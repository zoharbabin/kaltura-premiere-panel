/** Format seconds to MM:SS or HH:MM:SS */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Format bytes to human-readable size */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (!Number.isFinite(bytes) || bytes < 0) return "—";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);

  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/** Format a Unix timestamp to a locale date string */
export function formatDate(unixTimestamp: number): string {
  if (!unixTimestamp) return "—";
  return new Date(unixTimestamp * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Format a Unix timestamp to a locale date+time string */
export function formatDateTime(unixTimestamp: number): string {
  if (!unixTimestamp) return "—";
  return new Date(unixTimestamp * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Truncate text with ellipsis */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "…";
}

/** Format bitrate to human-readable */
export function formatBitrate(kbps: number): string {
  if (kbps >= 1000) {
    return `${(kbps / 1000).toFixed(1)} Mbps`;
  }
  return `${Math.round(kbps)} Kbps`;
}

/** Format resolution from width x height */
export function formatResolution(width: number, height: number): string {
  if (height >= 2160) return "4K";
  if (height >= 1440) return "1440p";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  if (height >= 480) return "480p";
  return `${width}×${height}`;
}
