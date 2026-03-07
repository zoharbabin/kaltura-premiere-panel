import React, { useState, useCallback } from "react";
import { KalturaLoginCredentials } from "../types";
import { ErrorBanner, LoadingSpinner } from "../components";
import { DEFAULT_SERVICE_URL, PLUGIN_NAME } from "../utils/constants";

interface LoginPanelProps {
  onLogin: (credentials: KalturaLoginCredentials) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  onClearError: () => void;
}

export const LoginPanel: React.FC<LoginPanelProps> = ({
  onLogin,
  isLoading,
  error,
  onClearError,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVICE_URL);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!email || !password || !partnerId) return;
    onClearError();
    await onLogin({
      email,
      password,
      partnerId: parseInt(partnerId, 10),
    });
  }, [email, password, partnerId, onLogin, onClearError]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSubmit();
    },
    [handleSubmit],
  );

  const isFormValid = email.length > 0 && password.length > 0 && partnerId.length > 0;

  if (isLoading) {
    return <LoadingSpinner label="Signing in…" size="large" />;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        gap: "16px",
        height: "100%",
      }}
    >
      <sp-heading size="M">{PLUGIN_NAME}</sp-heading>
      <sp-body
        size="S"
        style={{ color: "var(--spectrum-global-color-gray-600)", textAlign: "center" }}
      >
        Sign in to your Kaltura account to browse, import, and publish video content.
      </sp-body>

      {error && <ErrorBanner message={error} onDismiss={onClearError} />}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          width: "100%",
          maxWidth: "300px",
        }}
      >
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
        <sp-textfield
          placeholder="Partner ID"
          value={partnerId}
          onInput={(e: Event) => setPartnerId((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
          style={{ width: "100%" }}
          type="number"
        />

        <sp-button
          variant="accent"
          onClick={handleSubmit}
          disabled={!isFormValid || undefined}
          style={{ width: "100%" }}
        >
          Sign In
        </sp-button>

        <sp-action-button
          quiet
          size="s"
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{ alignSelf: "center" }}
        >
          {showAdvanced ? "Hide" : "Configure server"}
        </sp-action-button>

        {showAdvanced && (
          <sp-textfield
            placeholder="Server URL"
            value={serverUrl}
            onInput={(e: Event) => setServerUrl((e.target as HTMLInputElement).value)}
            style={{ width: "100%" }}
          />
        )}
      </div>
    </div>
  );
};
