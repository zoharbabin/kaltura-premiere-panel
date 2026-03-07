import {
  formatDuration,
  formatFileSize,
  formatDate,
  truncate,
  formatBitrate,
  formatResolution,
} from "../../src/utils/format";

describe("formatDuration", () => {
  it("formats seconds to MM:SS", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(600)).toBe("10:00");
  });

  it("formats to HH:MM:SS for long durations", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3661)).toBe("1:01:01");
    expect(formatDuration(7200)).toBe("2:00:00");
  });

  it("handles edge cases", () => {
    expect(formatDuration(-1)).toBe("0:00");
    expect(formatDuration(NaN)).toBe("0:00");
    expect(formatDuration(Infinity)).toBe("0:00");
  });
});

describe("formatFileSize", () => {
  it("formats bytes to human-readable sizes", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1048576)).toBe("1.0 MB");
    expect(formatFileSize(1073741824)).toBe("1.0 GB");
  });

  it("handles large files with rounding", () => {
    expect(formatFileSize(15 * 1024 * 1024)).toBe("15 MB");
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });

  it("handles edge cases", () => {
    expect(formatFileSize(-1)).toBe("—");
    expect(formatFileSize(NaN)).toBe("—");
  });
});

describe("formatDate", () => {
  it("formats unix timestamps to a date string", () => {
    const result = formatDate(1704153600); // 2024-01-02 00:00:00 UTC
    // Just verify it produces a non-empty string with a year
    expect(result).not.toBe("—");
    expect(result.length).toBeGreaterThan(3);
  });

  it("returns dash for falsy values", () => {
    expect(formatDate(0)).toBe("—");
  });
});

describe("truncate", () => {
  it("truncates long text with ellipsis", () => {
    expect(truncate("Hello World", 5)).toBe("Hell…");
    expect(truncate("Short", 10)).toBe("Short");
    expect(truncate("Exactly10!", 10)).toBe("Exactly10!");
  });
});

describe("formatBitrate", () => {
  it("formats kbps to readable strings", () => {
    expect(formatBitrate(500)).toBe("500 Kbps");
    expect(formatBitrate(1500)).toBe("1.5 Mbps");
    expect(formatBitrate(8000)).toBe("8.0 Mbps");
  });
});

describe("formatResolution", () => {
  it("returns common labels for standard resolutions", () => {
    expect(formatResolution(3840, 2160)).toBe("4K");
    expect(formatResolution(1920, 1080)).toBe("1080p");
    expect(formatResolution(1280, 720)).toBe("720p");
    expect(formatResolution(854, 480)).toBe("480p");
  });

  it("returns dimensions for non-standard resolutions", () => {
    expect(formatResolution(320, 240)).toBe("320×240");
  });
});
