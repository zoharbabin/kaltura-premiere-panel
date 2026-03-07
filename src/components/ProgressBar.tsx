import React from "react";

interface ProgressBarProps {
  value: number;
  label?: string;
  showPercent?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ value, label, showPercent = true }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%" }}>
    {(label || showPercent) && (
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {label && <sp-detail size="S">{label}</sp-detail>}
        {showPercent && <sp-detail size="S">{Math.round(value)}%</sp-detail>}
      </div>
    )}
    <sp-progress-bar value={value} style={{ width: "100%" }} />
  </div>
);
