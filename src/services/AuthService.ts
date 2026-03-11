import { KalturaClient } from "./KalturaClient";
import {
  KalturaSessionType,
  KalturaUser,
  KalturaLoginCredentials,
  KalturaAppTokenCredentials,
} from "../types/kaltura";
import { AuthenticationError } from "../utils/errors";
import {
  SESSION_REFRESH_THRESHOLD,
  SECURE_STORAGE_KEY_KS,
  SECURE_STORAGE_KEY_USER,
  SSO_POLL_INTERVAL_MS,
  SSO_TIMEOUT_MS,
} from "../utils/constants";
import { createLogger } from "../utils/logger";

const log = createLogger("AuthService");

/**
 * UXP SecureStorage raw interface.
 * IMPORTANT: UXP secureStorage.getItem returns Uint8Array, not string.
 * And setItem expects a string value which it stores as bytes internally.
 * We wrap it to handle the Uint8Array ↔ string conversion.
 */
interface SecureStorageRaw {
  getItem(key: string): Promise<Uint8Array | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Wrapped SecureStorage that handles UXP's Uint8Array returns */
interface SecureStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Get UXP SecureStorage — returns null if not available (test environment) */
function getSecureStorage(): SecureStorage | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const uxp = require("uxp");
    const raw = uxp.storage.secureStorage as SecureStorageRaw;
    if (!raw) return null;

    // Wrap to handle Uint8Array ↔ string conversion
    return {
      async getItem(key: string): Promise<string | null> {
        try {
          const value = await raw.getItem(key);
          if (value == null) return null;
          // UXP returns Uint8Array — decode to string
          if (value instanceof Uint8Array) {
            return new TextDecoder().decode(value);
          }
          // Some UXP versions may return string directly
          if (typeof value === "string") return value;
          return String(value);
        } catch {
          // UXP secureStorage can throw "Failed to getItem" if storage
          // is not yet initialized or was corrupted — treat as empty
          return null;
        }
      },
      async setItem(key: string, value: string): Promise<void> {
        await raw.setItem(key, value);
      },
      async removeItem(key: string): Promise<void> {
        await raw.removeItem(key);
      },
    };
  } catch {
    return null;
  }
}

export interface AuthSession {
  ks: string;
  user: KalturaUser;
  expiry: number;
  partnerId: number;
}

/**
 * Manages Kaltura authentication: login, session persistence, and auto-refresh.
 */
export class AuthService {
  private client: KalturaClient;
  private session: AuthSession | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(client: KalturaClient) {
    this.client = client;
  }

  /** Get the current session (null if not authenticated) */
  getSession(): AuthSession | null {
    return this.session;
  }

  /** Check if the user is currently authenticated */
  isAuthenticated(): boolean {
    return this.session !== null && this.session.expiry > Date.now() / 1000;
  }

  /**
   * Login with email and password.
   */
  async loginWithCredentials(credentials: KalturaLoginCredentials): Promise<AuthSession> {
    log.info("Logging in with email/password");

    try {
      const ksResponse = await this.client.request<
        { objectType?: string } & Record<string, unknown>
      >({
        service: "user",
        action: "loginByLoginId",
        params: {
          loginId: credentials.email,
          password: credentials.password,
          partnerId: credentials.partnerId,
          privileges: "disableentitlement",
        },
      });

      // loginByLoginId returns a raw string KS, wrapped in a response
      const ks = typeof ksResponse === "string" ? ksResponse : String(ksResponse);
      this.client.setKs(ks);

      const user = await this.fetchUserInfo();
      const session: AuthSession = {
        ks,
        user,
        expiry: Date.now() / 1000 + 86400, // Default 24h
        partnerId: credentials.partnerId,
      };

      await this.setSession(session);
      return session;
    } catch (error) {
      if (error instanceof Error && error.message.includes("LOGIN_DATA_NOT_FOUND")) {
        throw new AuthenticationError("Invalid email or password", "AUTH_INVALID_CREDENTIALS");
      }
      throw error;
    }
  }

  /**
   * Login with an app token (preferred for production).
   * tokenHash = SHA256(widgetKS + appToken.token)
   */
  async loginWithAppToken(credentials: KalturaAppTokenCredentials): Promise<AuthSession> {
    log.info("Logging in with app token");

    // First get a widget KS (no auth needed)
    const widgetResult = await this.client.request<
      { objectType?: string; ks?: string } & Record<string, unknown>
    >({
      service: "session",
      action: "startWidgetSession",
      params: {
        widgetId: `_${this.client.getPartnerId()}`,
      },
    });

    const widgetKs = widgetResult.ks as string;
    this.client.setKs(widgetKs);

    // Compute token hash: SHA256(widgetKs + appToken)
    const hashInput = widgetKs + credentials.appToken;
    const tokenHash = await this.sha256(hashInput);

    const response = await this.client.request<
      { objectType?: string; ks?: string } & Record<string, unknown>
    >({
      service: "appToken",
      action: "startSession",
      params: {
        id: credentials.appTokenId,
        tokenHash,
        userId: credentials.userId,
        type: credentials.sessionType ?? KalturaSessionType.USER,
        expiry: 86400,
        sessionPrivileges: "disableentitlement",
      },
    });

    const ks = response.ks as string;
    this.client.setKs(ks);

    const user = await this.fetchUserInfo();
    const session: AuthSession = {
      ks,
      user,
      expiry: Date.now() / 1000 + 86400,
      partnerId: this.client.getPartnerId(),
    };

    await this.setSession(session);
    return session;
  }

  /**
   * Login via SSO (three-party OAuth).
   *
   * 1. Request a one-time login token from Kaltura (creates a pending session)
   * 2. Open the system browser to the IdP login page
   * 3. Poll Kaltura until the token is exchanged for a KS
   * 4. Store the session and return
   *
   * Call `cancelSso()` to abort a pending SSO flow.
   */
  async loginWithSso(
    serverUrl: string,
    partnerId: number,
    signal?: AbortSignal,
  ): Promise<AuthSession> {
    log.info("Starting SSO login flow");

    // Step 1: Request a one-time login token
    const tokenResponse = await this.client.request<{
      objectType?: string;
      id: string;
      loginUrl: string;
    }>({
      service: "sso",
      action: "getLoginToken",
      params: { partnerId },
    });

    const { id: tokenId, loginUrl } = tokenResponse;
    log.info("SSO token created, opening browser", { tokenId });

    // Step 2: Open system browser to IdP (validate URL is HTTPS to prevent open-redirect attacks)
    if (!/^https:\/\//i.test(loginUrl)) {
      throw new AuthenticationError("SSO login URL must use HTTPS", "SSO_INVALID_URL");
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const uxp = require("uxp");
      uxp.shell.openExternal(loginUrl);
    } catch {
      window.open(loginUrl, "_blank");
    }

    // Step 3: Poll for completion
    const deadline = Date.now() + SSO_TIMEOUT_MS;

    while (Date.now() < deadline) {
      if (signal?.aborted) {
        throw new AuthenticationError("SSO login cancelled", "SSO_CANCELLED");
      }

      await this.sleep(SSO_POLL_INTERVAL_MS);

      try {
        const pollResponse = await this.client.request<{
          objectType?: string;
          status: "pending" | "complete" | "expired";
          ks?: string;
        }>({
          service: "sso",
          action: "checkLoginToken",
          params: { id: tokenId, partnerId },
        });

        if (pollResponse.status === "complete" && pollResponse.ks) {
          this.client.setKs(pollResponse.ks);
          const user = await this.fetchUserInfo();
          const session: AuthSession = {
            ks: pollResponse.ks,
            user,
            expiry: Date.now() / 1000 + 86400,
            partnerId,
          };
          await this.setSession(session);
          log.info("SSO login complete");
          return session;
        }

        if (pollResponse.status === "expired") {
          throw new AuthenticationError("SSO login token expired", "SSO_EXPIRED");
        }
      } catch (err) {
        if (err instanceof AuthenticationError) throw err;
        log.debug("SSO poll attempt failed, retrying", err);
      }
    }

    throw new AuthenticationError("SSO login timed out", "SSO_TIMEOUT");
  }

  /**
   * Restore session from secure storage (called on panel launch).
   * Returns null if no stored session or if expired.
   */
  async restoreSession(): Promise<AuthSession | null> {
    const storage = getSecureStorage();
    if (!storage) return null;

    try {
      const storedKs = await storage.getItem(SECURE_STORAGE_KEY_KS);
      const storedUser = await storage.getItem(SECURE_STORAGE_KEY_USER);

      log.info("Restore session: stored data", {
        hasKs: !!storedKs,
        ksLength: storedKs?.length ?? 0,
        hasUser: !!storedUser,
        userLength: storedUser?.length ?? 0,
      });

      if (!storedKs || !storedUser) return null;

      const userInfo = JSON.parse(storedUser) as AuthSession;

      // Check if expired
      if (userInfo.expiry < Date.now() / 1000) {
        log.info("Stored session expired, clearing");
        await this.clearSession();
        return null;
      }

      this.client.setKs(storedKs);

      // Restore partnerId on the client so API calls use the correct partner
      if (userInfo.partnerId) {
        this.client.configure({ partnerId: userInfo.partnerId });
      }

      // Validate the session is still active
      try {
        const user = await this.fetchUserInfo();
        const session: AuthSession = {
          ks: storedKs,
          user,
          expiry: userInfo.expiry,
          partnerId: userInfo.partnerId,
        };
        this.session = session;
        this.scheduleRefresh();
        log.info("Session restored successfully");
        return session;
      } catch {
        log.warn("Stored session invalid, clearing");
        await this.clearSession();
        return null;
      }
    } catch (error) {
      log.warn("Failed to restore session (clearing corrupt data)", error);
      await this.clearSession();
      return null;
    }
  }

  /** Logout: clear session and storage */
  async logout(): Promise<void> {
    log.info("Logging out");
    this.client.setKs(null);
    this.session = null;
    this.cancelRefresh();
    await this.clearSession();
  }

  private async fetchUserInfo(): Promise<KalturaUser> {
    return this.client.request<KalturaUser>({
      service: "user",
      action: "get",
    });
  }

  private async setSession(session: AuthSession): Promise<void> {
    this.session = session;
    this.scheduleRefresh();

    const storage = getSecureStorage();
    if (storage) {
      await storage.setItem(SECURE_STORAGE_KEY_KS, session.ks);
      await storage.setItem(SECURE_STORAGE_KEY_USER, JSON.stringify(session));
    }
  }

  private async clearSession(): Promise<void> {
    const storage = getSecureStorage();
    if (storage) {
      await storage.removeItem(SECURE_STORAGE_KEY_KS);
      await storage.removeItem(SECURE_STORAGE_KEY_USER);
    }
  }

  private scheduleRefresh(): void {
    this.cancelRefresh();
    if (!this.session) return;

    const ttlSeconds = this.session.expiry - Date.now() / 1000;
    const refreshInMs = ttlSeconds * SESSION_REFRESH_THRESHOLD * 1000;

    if (refreshInMs > 0) {
      this.refreshTimer = setTimeout(() => this.refreshSession(), refreshInMs);
      log.debug(`Session refresh scheduled in ${Math.round(refreshInMs / 1000)}s`);
    }
  }

  private cancelRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private async refreshSession(): Promise<void> {
    if (!this.session) return;

    log.info("Refreshing session");
    try {
      const response = await this.client.request<
        { objectType?: string; ks?: string } & Record<string, unknown>
      >({
        service: "session",
        action: "start",
        params: {
          partnerId: this.session.partnerId,
          type: KalturaSessionType.USER,
          expiry: 86400,
          privileges: "disableentitlement",
        },
      });

      const ks = response.ks ?? (typeof response === "string" ? response : null);
      if (ks) {
        this.session.ks = ks as string;
        this.session.expiry = Date.now() / 1000 + 86400;
        this.client.setKs(ks as string);
        await this.setSession(this.session);
        log.info("Session refreshed successfully");
      }
    } catch (error) {
      log.error("Session refresh failed", error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async sha256(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}
