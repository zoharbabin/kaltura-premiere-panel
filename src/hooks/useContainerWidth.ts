import { useState, useEffect, useRef, RefObject } from "react";

/**
 * Tracks the width of a container element.
 * Uses ResizeObserver when available, falls back to measuring on mount.
 */
export function useContainerWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  const measured = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Initial measurement
    const w = el.clientWidth;
    if (w > 0) {
      setWidth(w);
      measured.current = true;
    }

    // Use ResizeObserver if available (may not be in all UXP versions)
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const cw = entry.contentRect.width;
          if (cw > 0) {
            setWidth(cw);
            measured.current = true;
          }
        }
      });
      observer.observe(el);
      return () => observer.disconnect();
    }

    // Fallback: re-measure on window resize
    const handleResize = () => {
      const cw = el.clientWidth;
      if (cw > 0) setWidth(cw);
    };
    window.addEventListener("resize", handleResize);

    // Also re-measure after a short delay (UXP layout may not be ready synchronously)
    if (!measured.current) {
      const timer = setTimeout(handleResize, 100);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("resize", handleResize);
      };
    }

    return () => window.removeEventListener("resize", handleResize);
  }, [ref]);

  return width;
}

/**
 * Determine grid column count based on container width.
 * Returns 0 if width hasn't been measured yet (CSS fallback handles this).
 */
export function getGridColumns(containerWidth: number): number {
  if (containerWidth <= 0) return 0; // Not measured — let CSS default handle it
  if (containerWidth < 300) return 2;
  if (containerWidth < 500) return 3;
  if (containerWidth < 700) return 4;
  if (containerWidth < 1000) return 5;
  return 6;
}

/** Calculate CSS width for a grid card */
export function getCardWidth(columns: number, gap: number = 8): string {
  if (columns <= 0) return ""; // Empty = use CSS default width
  const gapShare = (gap * (columns - 1)) / columns;
  return `calc(${(100 / columns).toFixed(4)}% - ${gapShare}px)`;
}
