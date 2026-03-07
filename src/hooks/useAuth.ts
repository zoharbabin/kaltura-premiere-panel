import { useState, useCallback, useEffect, useRef } from "react";
import { AuthState, ConnectionState, KalturaLoginCredentials } from "../types";
import { AuthService, KalturaClient } from "../services";
import { getUserMessage } from "../utils/errors";
import { DEFAULT_SERVICE_URL } from "../utils/constants";

interface UseAuthReturn {
  authState: AuthState;
  login: (credentials: KalturaLoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

export function useAuth(client: KalturaClient, authService: AuthService): UseAuthReturn {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    ks: null,
    partnerId: null,
    serverUrl: DEFAULT_SERVICE_URL,
    connectionState: ConnectionState.DISCONNECTED,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const restoredRef = useRef(false);

  // Attempt session restore on mount
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    async function restore() {
      setAuthState((prev) => ({
        ...prev,
        connectionState: ConnectionState.CONNECTING,
      }));

      try {
        const session = await authService.restoreSession();
        if (session) {
          setAuthState({
            isAuthenticated: true,
            user: session.user,
            ks: session.ks,
            partnerId: session.partnerId,
            serverUrl: client.getServiceUrl(),
            connectionState: ConnectionState.CONNECTED,
          });
        } else {
          setAuthState((prev) => ({
            ...prev,
            connectionState: ConnectionState.DISCONNECTED,
          }));
        }
      } catch {
        setAuthState((prev) => ({
          ...prev,
          connectionState: ConnectionState.DISCONNECTED,
        }));
      } finally {
        setIsLoading(false);
      }
    }

    restore();
  }, [authService, client]);

  const login = useCallback(
    async (credentials: KalturaLoginCredentials) => {
      setIsLoading(true);
      setError(null);
      setAuthState((prev) => ({
        ...prev,
        connectionState: ConnectionState.CONNECTING,
      }));

      try {
        const session = await authService.loginWithCredentials(credentials);
        setAuthState({
          isAuthenticated: true,
          user: session.user,
          ks: session.ks,
          partnerId: session.partnerId,
          serverUrl: client.getServiceUrl(),
          connectionState: ConnectionState.CONNECTED,
        });
      } catch (err) {
        setError(getUserMessage(err));
        setAuthState((prev) => ({
          ...prev,
          connectionState: ConnectionState.ERROR,
        }));
      } finally {
        setIsLoading(false);
      }
    },
    [authService, client],
  );

  const logout = useCallback(async () => {
    await authService.logout();
    setAuthState({
      isAuthenticated: false,
      user: null,
      ks: null,
      partnerId: null,
      serverUrl: client.getServiceUrl(),
      connectionState: ConnectionState.DISCONNECTED,
    });
    setError(null);
  }, [authService, client]);

  const clearError = useCallback(() => setError(null), []);

  return { authState, login, logout, isLoading, error, clearError };
}
