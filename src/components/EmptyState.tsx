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
  <div className="empty-state">
    <sp-heading size="S">{title}</sp-heading>
    {description && (
      <sp-body size="S" className="text-muted">
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
