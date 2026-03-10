import React from "react";

interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Segmented control for choosing between 2-4 options.
 * Uses div[role=button] instead of <button> to avoid UXP native button chrome.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>): React.ReactElement {
  return (
    <div className="segmented-control">
      {options.map((opt) => (
        <div
          key={opt.value}
          role="button"
          tabIndex={0}
          className={`segment-btn${opt.value === value ? " segment-btn--active" : ""}`}
          onClick={() => onChange(opt.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onChange(opt.value);
            }
          }}
        >
          {opt.label}
        </div>
      ))}
    </div>
  );
}
