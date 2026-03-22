import React from "react";
import { useTranslation } from "../i18n";

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onDismiss, onRetry }) => {
  const { t } = useTranslation();

  return (
    <div className="alert-error" role="alert">
      <sp-body size="S" style={{ flexGrow: 1, flexShrink: 1, flexBasis: "0%" }}>
        {message}
      </sp-body>
      {onRetry && (
        <sp-action-button size="s" quiet onClick={onRetry} aria-label={t("error.retry")}>
          {t("error.retry")}
        </sp-action-button>
      )}
      {onDismiss && (
        <button className="alert-dismiss" onClick={onDismiss} aria-label={t("error.dismiss")}>
          {"\u2715"}
        </button>
      )}
    </div>
  );
};
