import { useState, useEffect, RefObject } from "react";

/**
 * Tracks the width of a container element.
 * Uses ResizeObserver when available, falls back to measuring on mount.
 */
export function useContainerWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Initial measurement
    setWidth(el.clientWidth);

    // Use ResizeObserver if available (may not be in all UXP versions)
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setWidth(entry.contentRect.width);
        }
      });
      observer.observe(el);
      return () => observer.disconnect();
    }

    // Fallback: re-measure on window resize (for UXP without ResizeObserver)
    const handleResize = () => setWidth(el.clientWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [ref]);

  return width;
}

/** Determine grid column count based on container width */
export function getGridColumns(containerWidth: number): number {
  if (containerWidth < 280) return 2;
  if (containerWidth < 420) return 3;
  if (containerWidth < 560) return 4;
  return 5;
}

/** Calculate CSS width for a grid card */
export function getCardWidth(columns: number, gap: number = 8): string {
  // Each card takes 1/N of the width minus its share of the gaps
  const gapShare = (gap * (columns - 1)) / columns;
  return `calc(${(100 / columns).toFixed(4)}% - ${gapShare}px)`;
}
