import { formatBitrate, formatResolution, formatFileSize } from "../../src/utils/format";

describe("Extended format utilities", () => {
  describe("formatBitrate()", () => {
    it("formats low bitrate in Kbps", () => {
      expect(formatBitrate(500)).toBe("500 Kbps");
    });

    it("formats high bitrate in Mbps", () => {
      expect(formatBitrate(4000)).toBe("4.0 Mbps");
    });

    it("formats exact 1000 Kbps as 1.0 Mbps", () => {
      expect(formatBitrate(1000)).toBe("1.0 Mbps");
    });

    it("formats fractional Mbps", () => {
      expect(formatBitrate(2500)).toBe("2.5 Mbps");
    });
  });

  describe("formatResolution()", () => {
    it("formats 4K", () => {
      expect(formatResolution(3840, 2160)).toBe("4K");
    });

    it("formats 1080p", () => {
      expect(formatResolution(1920, 1080)).toBe("1080p");
    });

    it("formats 720p", () => {
      expect(formatResolution(1280, 720)).toBe("720p");
    });

    it("formats 480p", () => {
      expect(formatResolution(854, 480)).toBe("480p");
    });

    it("formats 1440p", () => {
      expect(formatResolution(2560, 1440)).toBe("1440p");
    });

    it("formats non-standard resolution as WxH", () => {
      expect(formatResolution(320, 240)).toBe("320\u00D7240");
    });
  });

  describe("formatFileSize() edge cases", () => {
    it("formats gigabytes", () => {
      expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");
    });

    it("formats small files", () => {
      expect(formatFileSize(500)).toBe("500 B");
    });

    it("formats zero", () => {
      expect(formatFileSize(0)).toBe("0 B");
    });
  });
});
