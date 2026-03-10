import React from "react";

interface ProgressBarProps {
  value: number;
  label?: string;
  showPercent?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ value, label, showPercent = true }) => {
  const pct = Math.round(Math.max(0, Math.min(100, value)));
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      <div
        style={{
          width: "100%",
          height: "6px",
          backgroundColor: "#4a4a4a",
          borderRadius: "3px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: "#2680eb",
            borderRadius: "3px",
          }}
        />
      </div>
      {(label || showPercent) && (
        <div
          style={{
            display: "flex",
            justifyContent: label ? "space-between" : "center",
            alignItems: "center",
            marginTop: "8px",
          }}
        >
          {label && <span style={{ fontSize: "12px", color: "#b0b0b0" }}>{label}</span>}
          {showPercent && <span style={{ fontSize: "12px", color: "#b0b0b0" }}>{pct}%</span>}
        </div>
      )}
    </div>
  );
};
