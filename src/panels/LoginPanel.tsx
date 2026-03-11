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
    const url = `${serverUrl}/index.php/kmcng/login`;
    if (!/^https:\/\//i.test(url)) return;
    try {
      const uxp = require("uxp");
      uxp.shell.openExternal(url);
    } catch {
      window.open(url, "_blank");
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
        <img src="icons/kaltura-sun-color.svg" alt="Kaltura" className="login-logo-img" />
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
            <div
              role="button"
              tabIndex={0}
              className={`login-toggle-btn${authMode === "email" ? " login-toggle-btn--active" : ""}`}
              onClick={() => setAuthMode("email")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setAuthMode("email");
              }}
            >
              Email
            </div>
            <div
              role="button"
              tabIndex={0}
              className={`login-toggle-btn${authMode === "sso" ? " login-toggle-btn--active" : ""}`}
              onClick={() => setAuthMode("sso")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setAuthMode("sso");
              }}
            >
              SSO
            </div>
          </div>
        )}

        {authMode === "email" ? (
          <>
            <sp-textfield
              placeholder="Email"
              aria-label="Email address"
              value={email}
              onInput={(e: Event) => setEmail((e.target as HTMLInputElement).value)}
              onKeyDown={handleKeyDown}
              style={{ width: "100%" }}
              type="email"
            />
            <sp-textfield
              placeholder="Password"
              aria-label="Password"
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
          aria-label="Partner ID"
          value={partnerId}
          onInput={(e: Event) => {
            const val = (e.target as HTMLInputElement).value.replace(/\D/g, "");
            setPartnerId(val);
          }}
          onKeyDown={handleKeyDown}
          style={{ width: "100%" }}
        />

        {authMode === "email" ? (
          <div
            role="button"
            tabIndex={isFormValid ? 0 : -1}
            className={`btn-kaltura${!isFormValid ? " btn-kaltura--disabled" : ""}`}
            onClick={isFormValid ? handleSubmit : undefined}
            onKeyDown={(e) => {
              if (isFormValid && (e.key === "Enter" || e.key === " ")) handleSubmit();
            }}
            aria-disabled={!isFormValid || undefined}
          >
            Sign In
          </div>
        ) : (
          <div
            role="button"
            tabIndex={partnerId ? 0 : -1}
            className={`btn-kaltura${!partnerId ? " btn-kaltura--disabled" : ""}`}
            onClick={partnerId ? handleSsoLogin : undefined}
            onKeyDown={(e) => {
              if (partnerId && (e.key === "Enter" || e.key === " ")) handleSsoLogin();
            }}
            aria-disabled={!partnerId || undefined}
          >
            Sign In with SSO
          </div>
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
            aria-label="Kaltura server URL"
            value={serverUrl}
            onInput={(e: Event) => handleServerUrlChange((e.target as HTMLInputElement).value)}
            style={{ width: "100%" }}
          />
        )}
      </div>
    </div>
  );
};
