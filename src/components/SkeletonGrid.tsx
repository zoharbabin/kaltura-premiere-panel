import React, { useState, useEffect } from "react";

interface SkeletonGridProps {
  count?: number;
  columnWidth?: string;
}

/**
 * Skeleton placeholder cards shown while the browse grid is loading.
 * Uses a JS-driven pulse toggle since UXP doesn't support CSS animations.
 */
export const SkeletonGrid: React.FC<SkeletonGridProps> = ({ count = 6, columnWidth }) => {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setPulse((p) => !p), 800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="thumb-grid">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`skeleton-card${pulse ? " skeleton-pulse" : ""}`}
          style={columnWidth ? { width: columnWidth } : undefined}
        >
          <div className="skeleton-thumb" />
          <div className="skeleton-title" />
        </div>
      ))}
    </div>
  );
};
