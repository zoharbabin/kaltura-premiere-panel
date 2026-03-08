import React, { useState, useCallback } from "react";
import { KalturaLoginCredentials } from "../types";
import { ErrorBanner, LoadingSpinner } from "../components";
import { DEFAULT_SERVICE_URL, PLUGIN_NAME } from "../utils/constants";

interface LoginPanelProps {
  onLogin: (credentials: KalturaLoginCredentials) => Promise<void>;
  onSsoLogin?: (serverUrl: string, partnerId: number) => Promise<void>;
  onCancelSso?: () => void;
  onServerUrlChange?: (url: string) => void;
  isLoading: boolean;
  error: string | null;
  onClearError: () => void;
}

export const LoginPanel: React.FC<LoginPanelProps> = ({
  onLogin,
  onSsoLogin,
  onCancelSso,
  onServerUrlChange,
  isLoading,
  error,
  onClearError,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVICE_URL);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [authMode, setAuthMode] = useState<"email" | "sso">("email");
  const [ssoStatus, setSsoStatus] = useState<string | null>(null);

  const handleServerUrlChange = useCallback(
    (url: string) => {
      setServerUrl(url);
      onServerUrlChange?.(url);
    },
    [onServerUrlChange],
  );

  const handleSubmit = useCallback(async () => {
    if (!email || !password || !partnerId) return;
    onClearError();
    await onLogin({
      email,
      password,
      partnerId: parseInt(partnerId, 10),
    });
  }, [email, password, partnerId, onLogin, onClearError]);

  const handleSsoLogin = useCallback(async () => {
    if (!partnerId || !onSsoLogin) return;
    onClearError();
    setSsoStatus("Opening browser for SSO...");

    try {
      await onSsoLogin(serverUrl, parseInt(partnerId, 10));
    } catch {
      setSsoStatus(null);
    }
  }, [partnerId, serverUrl, onSsoLogin, onClearError]);

  const handleForgotPassword = useCallback(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const uxp = require("uxp");
      uxp.shell.openExternal(`${serverUrl}/index.php/kmcng/login`);
    } catch {
      window.open(`${serverUrl}/index.php/kmcng/login`, "_blank");
    }
  }, [serverUrl]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSubmit();
    },
    [handleSubmit],
  );

  const isFormValid = email.length > 0 && password.length > 0 && partnerId.length > 0;

  if (isLoading || ssoStatus) {
    return (
      <div className="login-container">
        <LoadingSpinner label={ssoStatus || "Signing in..."} size="large" />
        {ssoStatus && onCancelSso && (
          <sp-button
            variant="secondary"
            size="s"
            onClick={() => {
              onCancelSso();
              setSsoStatus(null);
            }}
          >
            Cancel
          </sp-button>
        )}
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-brand">
        <div className="login-logo">K</div>
        <sp-heading size="M">{PLUGIN_NAME}</sp-heading>
        <div className="login-divider" />
      </div>
      <div className="login-subtitle">
        Sign in to your Kaltura account to browse, import, and publish video content.
      </div>

      {error && <ErrorBanner message={error} onDismiss={onClearError} />}

      <div className="login-form">
        {/* Auth mode toggle */}
        {onSsoLogin && (
          <div className="login-toggle">
            <button
              className={`login-toggle-btn${authMode === "email" ? " login-toggle-btn--active" : ""}`}
              onClick={() => setAuthMode("email")}
            >
              Email
            </button>
            <button
              className={`login-toggle-btn${authMode === "sso" ? " login-toggle-btn--active" : ""}`}
              onClick={() => setAuthMode("sso")}
            >
              SSO
            </button>
          </div>
        )}

        {authMode === "email" ? (
          <>
            <sp-textfield
              placeholder="Email"
              value={email}
              onInput={(e: Event) => setEmail((e.target as HTMLInputElement).value)}
              onKeyDown={handleKeyDown}
              style={{ width: "100%" }}
              type="email"
            />
            <sp-textfield
              placeholder="Password"
              value={password}
              onInput={(e: Event) => setPassword((e.target as HTMLInputElement).value)}
              onKeyDown={handleKeyDown}
              style={{ width: "100%" }}
              type="password"
            />
          </>
        ) : null}

        <sp-textfield
          placeholder="Partner ID"
          value={partnerId}
          onInput={(e: Event) => {
            const val = (e.target as HTMLInputElement).value.replace(/\D/g, "");
            setPartnerId(val);
          }}
          onKeyDown={handleKeyDown}
          style={{ width: "100%" }}
        />

        {authMode === "email" ? (
          <sp-button
            variant="accent"
            onClick={handleSubmit}
            disabled={!isFormValid || undefined}
            style={{ width: "100%" }}
          >
            Sign In
          </sp-button>
        ) : (
          <sp-button
            variant="accent"
            onClick={handleSsoLogin}
            disabled={!partnerId || undefined}
            style={{ width: "100%" }}
          >
            Sign In with SSO
          </sp-button>
        )}

        <div className="login-links">
          {authMode === "email" && (
            <sp-action-button quiet size="s" onClick={handleForgotPassword}>
              Forgot password?
            </sp-action-button>
          )}

          <sp-action-button quiet size="s" onClick={() => setShowAdvanced(!showAdvanced)}>
            {showAdvanced ? "Hide server settings" : "Configure server"}
          </sp-action-button>
        </div>

        {showAdvanced && (
          <sp-textfield
            placeholder="Server URL"
            value={serverUrl}
            onInput={(e: Event) => handleServerUrlChange((e.target as HTMLInputElement).value)}
            style={{ width: "100%" }}
          />
        )}
      </div>
    </div>
  );
};
