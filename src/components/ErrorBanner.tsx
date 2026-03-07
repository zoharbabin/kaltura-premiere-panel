import React from "react";

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onDismiss, onRetry }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 12px",
      backgroundColor: "var(--spectrum-global-color-red-400)",
      borderRadius: "4px",
      margin: "8px",
    }}
  >
    <sp-icon-alert size="s" />
    <sp-body size="S" style={{ flex: 1, color: "white" }}>
      {message}
    </sp-body>
    {onRetry && (
      <sp-action-button size="s" quiet onClick={onRetry}>
        Retry
      </sp-action-button>
    )}
    {onDismiss && (
      <sp-action-button size="s" quiet onClick={onDismiss}>
        ✕
      </sp-action-button>
    )}
  </div>
);
