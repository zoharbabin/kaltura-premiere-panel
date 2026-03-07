import React from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
}) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 16px",
      textAlign: "center",
      gap: "8px",
    }}
  >
    <sp-heading size="S">{title}</sp-heading>
    {description && (
      <sp-body size="S" style={{ color: "var(--spectrum-global-color-gray-600)" }}>
        {description}
      </sp-body>
    )}
    {actionLabel && onAction && (
      <sp-button variant="primary" size="s" onClick={onAction} style={{ marginTop: "8px" }}>
        {actionLabel}
      </sp-button>
    )}
  </div>
);
