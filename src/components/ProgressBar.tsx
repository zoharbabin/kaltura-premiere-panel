import React from "react";

interface ProgressBarProps {
  value: number;
  label?: string;
  showPercent?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ value, label, showPercent = true }) => {
  const pct = Math.round(Math.max(0, Math.min(100, value)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
      <div
        style={{
          width: "100%",
          height: "6px",
          backgroundColor: "var(--spectrum-global-color-gray-300, #444)",
          borderRadius: "3px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: "var(--spectrum-global-color-blue-500, #1473e6)",
            borderRadius: "3px",
            transition: "width 0.3s ease",
          }}
        />
      </div>
      {(label || showPercent) && (
        <div
          style={{
            display: "flex",
            justifyContent: label ? "space-between" : "center",
            alignItems: "center",
          }}
        >
          {label && (
            <span
              style={{ fontSize: "12px", color: "var(--spectrum-global-color-gray-700, #999)" }}
            >
              {label}
            </span>
          )}
          {showPercent && (
            <span
              style={{ fontSize: "12px", color: "var(--spectrum-global-color-gray-700, #999)" }}
            >
              {pct}%
            </span>
          )}
        </div>
      )}
    </div>
  );
};
