import { AuthService } from "../../src/services/AuthService";
import { KalturaClient } from "../../src/services/KalturaClient";
import { AuthenticationError } from "../../src/utils/errors";

const mockFetch = global.fetch as jest.Mock;

describe("AuthService", () => {
  let client: KalturaClient;
  let service: AuthService;

  beforeEach(() => {
    client = new KalturaClient({ serviceUrl: "https://test.kaltura.com", partnerId: 12345 });
    service = new AuthService(client);
    mockFetch.mockReset();
  });

  describe("loginWithCredentials()", () => {
    it("logs in with email/password and returns session", async () => {
      // Mock loginByLoginId -> returns KS string
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => "test_ks_12345",
      });

      // Mock user.get -> returns user info
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaUser",
          id: "user123",
          email: "test@example.com",
          firstName: "Test",
          lastName: "User",
          fullName: "Test User",
          partnerId: 12345,
          isAdmin: false,
        }),
      });

      const session = await service.loginWithCredentials({
        email: "test@example.com",
        password: "password123",
        partnerId: 12345,
      });

      expect(session.ks).toBe("test_ks_12345");
      expect(session.user.email).toBe("test@example.com");
      expect(session.user.fullName).toBe("Test User");
      expect(session.partnerId).toBe(12345);
      expect(service.isAuthenticated()).toBe(true);
    });

    it("throws AuthenticationError for invalid credentials", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaAPIException",
          code: "LOGIN_DATA_NOT_FOUND",
          message: "LOGIN_DATA_NOT_FOUND",
        }),
      });

      await expect(
        service.loginWithCredentials({
          email: "bad@email.com",
          password: "wrong",
          partnerId: 12345,
        }),
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe("loginWithAppToken()", () => {
    it("logs in with app token flow", async () => {
      // Mock startWidgetSession
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaStartWidgetSessionResponse",
          ks: "widget_ks_abc",
        }),
      });

      // Mock appToken.startSession
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaSessionInfo",
          ks: "app_token_ks_xyz",
        }),
      });

      // Mock user.get
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaUser",
          id: "user456",
          email: "admin@example.com",
          firstName: "Admin",
          lastName: "User",
          fullName: "Admin User",
          partnerId: 12345,
          isAdmin: true,
        }),
      });

      const session = await service.loginWithAppToken({
        appTokenId: "token_id_123",
        appToken: "token_secret_456",
      });

      expect(session.ks).toBe("app_token_ks_xyz");
      expect(session.user.fullName).toBe("Admin User");
      expect(service.isAuthenticated()).toBe(true);
    });
  });

  describe("session management", () => {
    it("starts unauthenticated", () => {
      expect(service.isAuthenticated()).toBe(false);
      expect(service.getSession()).toBeNull();
    });

    it("logout clears session", async () => {
      // Login first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => "test_ks",
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaUser",
          id: "u1",
          email: "a@b.com",
          firstName: "A",
          lastName: "B",
          fullName: "A B",
          partnerId: 12345,
          isAdmin: false,
        }),
      });

      await service.loginWithCredentials({
        email: "a@b.com",
        password: "pass",
        partnerId: 12345,
      });
      expect(service.isAuthenticated()).toBe(true);

      await service.logout();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.getSession()).toBeNull();
    });

    it("restoreSession returns null when no storage available", async () => {
      const result = await service.restoreSession();
      expect(result).toBeNull();
    });
  });

  describe("loginWithSso()", () => {
    beforeEach(() => {
      // Mock the private sleep method to resolve immediately
      jest
        .spyOn(AuthService.prototype as unknown as { sleep: () => Promise<void> }, "sleep" as never)
        .mockResolvedValue(undefined as never);
    });

    it("opens browser and polls until KS is returned", async () => {
      // Mock sso.getLoginToken
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "sso_token_1",
          loginUrl: "https://idp.example.com/login?token=sso_token_1",
        }),
      });

      // Mock first poll -> pending
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "pending" }),
      });

      // Mock second poll -> complete with KS
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "complete", ks: "sso_ks_abc" }),
      });

      // Mock user.get
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaUser",
          id: "sso_user",
          email: "sso@corp.com",
          firstName: "SSO",
          lastName: "User",
          fullName: "SSO User",
          partnerId: 99,
          isAdmin: false,
        }),
      });

      const session = await service.loginWithSso("https://test.kaltura.com", 99);
      expect(session.ks).toBe("sso_ks_abc");
      expect(session.user.fullName).toBe("SSO User");
      expect(session.partnerId).toBe(99);
    });

    it("throws when SSO token expires", async () => {
      // Mock sso.getLoginToken
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "sso_token_2", loginUrl: "https://idp.example.com/login" }),
      });

      // Mock poll -> expired
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "expired" }),
      });

      await expect(service.loginWithSso("https://test.kaltura.com", 99)).rejects.toThrow(
        "SSO login token expired",
      );
    });

    it("can be cancelled via AbortSignal", async () => {
      // Mock sso.getLoginToken
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "sso_token_3", loginUrl: "https://idp.example.com/login" }),
      });

      // Mock poll -> always pending (will be cancelled before second poll)
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: "pending" }),
      });

      const controller = new AbortController();
      controller.abort(); // Pre-abort
      await expect(
        service.loginWithSso("https://test.kaltura.com", 99, controller.signal),
      ).rejects.toThrow("SSO login cancelled");
    });
  });
});
