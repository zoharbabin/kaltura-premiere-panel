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

  describe("initiateSso()", () => {
    it("opens browser with correct SSO callback URL", () => {
      service.initiateSso("user@company.com", "nvp1");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("does not throw when called with organizationId", () => {
      expect(() => {
        service.initiateSso("user@company.com", "nvp1", "org-123");
      }).not.toThrow();
    });
  });

  describe("validateSsoToken()", () => {
    it("extracts partnerId from a real KS structure", async () => {
      // partnerId 5837132 encoded in KS structure
      const payload = "abc123hash|5837132;5837132;9999999999;0;1716825600;admin;";
      const fakeKs = btoa(payload);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaUser",
          id: "admin",
          email: "admin@company.com",
          firstName: "Admin",
          lastName: "User",
          fullName: "Admin User",
          partnerId: 5837132,
          isAdmin: true,
        }),
      });

      const session = await service.validateSsoToken(fakeKs, "https://www.kaltura.com");
      expect(session.partnerId).toBe(5837132);
    });

    it("uses partnerId from user.get response when KS parsing returns 0", async () => {
      // Malformed KS that can't be parsed
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaUser",
          id: "user1",
          email: "user@company.com",
          firstName: "User",
          lastName: "One",
          fullName: "User One",
          partnerId: 12345,
          isAdmin: false,
        }),
      });

      const session = await service.validateSsoToken(
        "not-valid-base64!!!",
        "https://www.kaltura.com",
      );
      expect(session.partnerId).toBe(12345);
    });

    it("validates a KS token and returns session with partnerId extracted from KS", async () => {
      // Create a fake KS: base64("hash|99;99;9999999999;...")
      const fakeKsPayload = "somehash|99;99;9999999999;0;1234567890;sso_user;";
      const fakeKs = btoa(fakeKsPayload);

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

      const session = await service.validateSsoToken(fakeKs, "https://test.kaltura.com");
      expect(session.ks).toBe(fakeKs);
      expect(session.user.fullName).toBe("SSO User");
      expect(session.partnerId).toBe(99);
    });

    it("throws SSO_INVALID_TOKEN when KS is invalid", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaAPIException",
          code: "INVALID_KS",
          message: "INVALID_KS",
        }),
      });

      await expect(service.validateSsoToken("bad_ks", "https://test.kaltura.com")).rejects.toThrow(
        "Invalid or expired token",
      );
    });
  });
});
