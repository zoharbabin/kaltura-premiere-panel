import { renderHook, act, waitFor } from "@testing-library/react";
import { useAuth } from "../../src/hooks/useAuth";
import { ConnectionState } from "../../src/types";
import type { KalturaClient, AuthService } from "../../src/services";

const mockSession = {
  ks: "test-ks",
  partnerId: 12345,
  user: { id: "user1", fullName: "Test User", email: "test@example.com" },
};

function createMockClient(): KalturaClient {
  return {
    getServiceUrl: jest.fn().mockReturnValue("https://www.kaltura.com"),
    configure: jest.fn(),
  } as unknown as KalturaClient;
}

function createMockAuthService(
  overrides: Partial<Record<keyof AuthService, jest.Mock>> = {},
): AuthService {
  return {
    restoreSession: jest.fn().mockResolvedValue(null),
    loginWithCredentials: jest.fn(),
    loginWithSso: jest.fn(),
    logout: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as AuthService;
}

describe("useAuth", () => {
  it("has initial state with isLoading true and not authenticated", () => {
    const client = createMockClient();
    const authService = createMockAuthService({
      restoreSession: jest.fn().mockReturnValue(new Promise(() => {})), // never resolves
    });

    const { result } = renderHook(() => useAuth(client, authService));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.authState.isAuthenticated).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("restores session on mount and becomes authenticated", async () => {
    const client = createMockClient();
    const authService = createMockAuthService({
      restoreSession: jest.fn().mockResolvedValue(mockSession),
    });

    const { result } = renderHook(() => useAuth(client, authService));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.authState.isAuthenticated).toBe(true);
    expect(result.current.authState.ks).toBe("test-ks");
    expect(result.current.authState.partnerId).toBe(12345);
    expect(result.current.authState.user).toEqual(mockSession.user);
    expect(result.current.authState.connectionState).toBe(ConnectionState.CONNECTED);
  });

  it("stays unauthenticated when restoreSession returns null", async () => {
    const client = createMockClient();
    const authService = createMockAuthService({
      restoreSession: jest.fn().mockResolvedValue(null),
    });

    const { result } = renderHook(() => useAuth(client, authService));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.authState.isAuthenticated).toBe(false);
    expect(result.current.authState.connectionState).toBe(ConnectionState.DISCONNECTED);
  });

  it("authenticates on successful login with credentials", async () => {
    const client = createMockClient();
    const authService = createMockAuthService({
      restoreSession: jest.fn().mockResolvedValue(null),
      loginWithCredentials: jest.fn().mockResolvedValue(mockSession),
    });

    const { result } = renderHook(() => useAuth(client, authService));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login({
        email: "test@example.com",
        password: "password123",
        partnerId: 12345,
      });
    });

    expect(result.current.authState.isAuthenticated).toBe(true);
    expect(result.current.authState.ks).toBe("test-ks");
    expect(result.current.authState.connectionState).toBe(ConnectionState.CONNECTED);
    expect(result.current.error).toBeNull();
  });

  it("sets error state on login failure", async () => {
    const client = createMockClient();
    const loginError = new Error("Login failed");
    const authService = createMockAuthService({
      restoreSession: jest.fn().mockResolvedValue(null),
      loginWithCredentials: jest.fn().mockRejectedValue(loginError),
    });

    const { result } = renderHook(() => useAuth(client, authService));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login({
        email: "test@example.com",
        password: "wrong",
        partnerId: 12345,
      });
    });

    expect(result.current.authState.isAuthenticated).toBe(false);
    expect(result.current.authState.connectionState).toBe(ConnectionState.ERROR);
    expect(result.current.error).toBe("Login failed");
  });

  it("clears auth state on logout", async () => {
    const client = createMockClient();
    const authService = createMockAuthService({
      restoreSession: jest.fn().mockResolvedValue(mockSession),
      logout: jest.fn().mockResolvedValue(undefined),
    });

    const { result } = renderHook(() => useAuth(client, authService));

    await waitFor(() => {
      expect(result.current.authState.isAuthenticated).toBe(true);
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.authState.isAuthenticated).toBe(false);
    expect(result.current.authState.ks).toBeNull();
    expect(result.current.authState.user).toBeNull();
    expect(result.current.authState.partnerId).toBeNull();
    expect(result.current.authState.connectionState).toBe(ConnectionState.DISCONNECTED);
    expect(result.current.error).toBeNull();
  });

  it("resets to disconnected on cancelSso", async () => {
    const client = createMockClient();
    const authService = createMockAuthService({
      restoreSession: jest.fn().mockResolvedValue(null),
    });

    const { result } = renderHook(() => useAuth(client, authService));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.cancelSso();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.authState.connectionState).toBe(ConnectionState.DISCONNECTED);
  });

  it("clears error with clearError", async () => {
    const client = createMockClient();
    const authService = createMockAuthService({
      restoreSession: jest.fn().mockResolvedValue(null),
      loginWithCredentials: jest.fn().mockRejectedValue(new Error("Bad credentials")),
    });

    const { result } = renderHook(() => useAuth(client, authService));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login({
        email: "test@example.com",
        password: "wrong",
        partnerId: 12345,
      });
    });

    expect(result.current.error).toBe("Bad credentials");

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });
});
