import React from "react";

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onDismiss, onRetry }) => (
  <div className="alert-error">
    <sp-body size="S" style={{ flexGrow: 1, flexShrink: 1, flexBasis: "0%" }}>
      {message}
    </sp-body>
    {onRetry && (
      <sp-action-button size="s" quiet onClick={onRetry}>
        Retry
      </sp-action-button>
    )}
    {onDismiss && (
      <button className="alert-dismiss" onClick={onDismiss}>
        {"\u2715"}
      </button>
    )}
  </div>
);
