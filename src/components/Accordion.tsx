import React, { useState, useCallback } from "react";

interface AccordionSectionProps {
  title: string;
  summary?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

/**
 * Collapsible accordion section for organizing form fields.
 * Uses JS class toggling (not CSS transitions — UXP doesn't support them).
 */
export const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  summary,
  defaultExpanded = false,
  children,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggle = useCallback(() => setExpanded((prev) => !prev), []);

  return (
    <div className="accordion-section">
      <div
        className="accordion-header"
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        aria-expanded={expanded}
      >
        <span className="accordion-title">{title}</span>
        {!expanded && summary && <span className="accordion-summary">{summary}</span>}
        <span className="accordion-chevron">{expanded ? "\u25BC" : "\u25B6"}</span>
      </div>
      {expanded && <div className="accordion-content">{children}</div>}
    </div>
  );
};
