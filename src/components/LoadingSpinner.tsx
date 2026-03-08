import React from "react";

interface LoadingSpinnerProps {
  label?: string;
  size?: "small" | "medium" | "large";
}

const sizeMap = { small: 20, medium: 32, large: 48 };

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ label, size = "medium" }) => {
  const px = sizeMap[size];

  return (
    <div className="loading-spinner">
      <sp-progress-circle
        size={size === "small" ? "small" : size === "large" ? "large" : "medium"}
        indeterminate
        style={{ width: px, height: px }}
      />
      {label && (
        <sp-body size="S" className="text-muted">
          {label}
        </sp-body>
      )}
    </div>
  );
};
