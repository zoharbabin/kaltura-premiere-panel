import React from "react";
import { useTranslation } from "../i18n";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "accent" | "negative";
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = "accent",
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const resolvedConfirmLabel = confirmLabel ?? t("confirm.confirm");
  const resolvedCancelLabel = cancelLabel ?? t("confirm.cancel");

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#000000",
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "#323232",
          borderRadius: "4px",
          padding: "16px",
          maxWidth: "320px",
          width: "90%",
          border: "1px solid #4a4a4a",
        }}
      >
        <sp-heading size="XS" style={{ marginBottom: "8px" }}>
          {title}
        </sp-heading>
        <sp-body size="S" style={{ marginBottom: "16px" }}>
          {message}
        </sp-body>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <sp-button variant="secondary" size="s" onClick={onCancel} style={{ marginRight: 8 }}>
            {resolvedCancelLabel}
          </sp-button>
          <sp-button variant={variant} size="s" onClick={onConfirm}>
            {resolvedConfirmLabel}
          </sp-button>
        </div>
      </div>
    </div>
  );
};
