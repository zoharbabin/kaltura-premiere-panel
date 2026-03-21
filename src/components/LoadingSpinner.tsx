import React from "react";

interface LoadingSpinnerProps {
  label?: string;
  size?: "small" | "medium" | "large";
}

const sizeMap = { small: 20, medium: 32, large: 48 };

/** Pure CSS spinner — avoids UXP preCreateCallback assertion crash
 *  that sp-progress-circle triggers during React re-renders / view transitions */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ label, size = "medium" }) => {
  const px = sizeMap[size];

  return (
    <div className="loading-spinner">
      <div className="css-spinner" style={{ width: px, height: px }} />
      {label && (
        <sp-body size="S" className="text-muted">
          {label}
        </sp-body>
      )}
    </div>
  );
};
