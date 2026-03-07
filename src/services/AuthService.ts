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
} from "../utils/constants";
import { createLogger } from "../utils/logger";

const log = createLogger("AuthService");

/** UXP SecureStorage interface (available at runtime) */
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
    return uxp.storage.secureStorage as SecureStorage;
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
   * Restore session from secure storage (called on panel launch).
   * Returns null if no stored session or if expired.
   */
  async restoreSession(): Promise<AuthSession | null> {
    const storage = getSecureStorage();
    if (!storage) return null;

    try {
      const storedKs = await storage.getItem(SECURE_STORAGE_KEY_KS);
      const storedUser = await storage.getItem(SECURE_STORAGE_KEY_USER);

      if (!storedKs || !storedUser) return null;

      const userInfo = JSON.parse(storedUser) as AuthSession;

      // Check if expired
      if (userInfo.expiry < Date.now() / 1000) {
        log.info("Stored session expired, clearing");
        await this.clearSession();
        return null;
      }

      this.client.setKs(storedKs);

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
      log.error("Failed to restore session", error);
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

  private async sha256(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}
