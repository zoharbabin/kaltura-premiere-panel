import React from "react";

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onDismiss, onRetry }) => (
  <div className="alert-error" role="alert">
    <sp-body size="S" style={{ flexGrow: 1, flexShrink: 1, flexBasis: "0%" }}>
      {message}
    </sp-body>
    {onRetry && (
      <sp-action-button size="s" quiet onClick={onRetry} aria-label="Retry">
        Retry
      </sp-action-button>
    )}
    {onDismiss && (
      <button className="alert-dismiss" onClick={onDismiss} aria-label="Dismiss error">
        {"\u2715"}
      </button>
    )}
  </div>
);
