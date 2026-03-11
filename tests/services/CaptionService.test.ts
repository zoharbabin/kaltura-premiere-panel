import { CaptionService } from "../../src/services/CaptionService";
import { KalturaClient } from "../../src/services/KalturaClient";
import { KalturaCaptionType } from "../../src/types/kaltura";

// Mock KalturaClient
const mockRequest = jest.fn();
const client = {
  request: mockRequest,
  multiRequest: jest.fn(),
  setKs: jest.fn(),
  getKs: jest.fn(),
  getPartnerId: jest.fn(),
  getServiceUrl: jest.fn(),
  configure: jest.fn(),
} as unknown as KalturaClient;

describe("CaptionService", () => {
  let service: CaptionService;

  beforeEach(() => {
    service = new CaptionService(client);
    jest.clearAllMocks();
  });

  describe("listCaptions()", () => {
    it("returns caption assets for an entry", async () => {
      const captions = [
        { id: "cap1", language: "en", label: "English", format: KalturaCaptionType.SRT },
      ];
      mockRequest.mockResolvedValue({ objects: captions, totalCount: 1 });

      const result = await service.listCaptions("0_abc123");
      expect(result).toEqual(captions);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          service: "caption_captionAsset",
          action: "list",
        }),
      );
    });

    it("returns empty array when no captions exist", async () => {
      mockRequest.mockResolvedValue({ objects: [], totalCount: 0 });
      const result = await service.listCaptions("0_empty");
      expect(result).toEqual([]);
    });
  });

  describe("parseSrt()", () => {
    it("parses valid SRT content", () => {
      const srt = `1
00:00:01,000 --> 00:00:04,500
Hello world

2
00:00:05,000 --> 00:00:08,200
This is a test`;

      const segments = service.parseSrt(srt);
      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({
        startTime: 1.0,
        endTime: 4.5,
        text: "Hello world",
      });
      expect(segments[1]).toEqual({
        startTime: 5.0,
        endTime: 8.2,
        text: "This is a test",
      });
    });

    it("handles multiline subtitle text", () => {
      const srt = `1
00:00:01,000 --> 00:00:04,000
Line one
Line two`;

      const segments = service.parseSrt(srt);
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe("Line one\nLine two");
    });

    it("handles hours in timecodes", () => {
      const srt = `1
01:30:00,000 --> 01:30:05,500
Late in the video`;

      const segments = service.parseSrt(srt);
      expect(segments[0].startTime).toBe(5400.0);
      expect(segments[0].endTime).toBe(5405.5);
    });

    it("returns empty array for invalid SRT", () => {
      const segments = service.parseSrt("not valid srt");
      expect(segments).toEqual([]);
    });

    it("skips malformed blocks", () => {
      const srt = `1
invalid timecode
Some text

2
00:00:01,000 --> 00:00:02,000
Valid text`;

      const segments = service.parseSrt(srt);
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe("Valid text");
    });
  });

  describe("parseVtt()", () => {
    it("parses valid WebVTT content", () => {
      const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.500
Hello world

00:00:05.000 --> 00:00:08.200
Second cue`;

      const segments = service.parseVtt(vtt);
      expect(segments).toHaveLength(2);
      expect(segments[0].text).toBe("Hello world");
      expect(segments[1].startTime).toBe(5.0);
    });

    it("handles VTT header with metadata", () => {
      const vtt = `WEBVTT - This file has captions

00:00:01.000 --> 00:00:02.000
Only cue`;

      const segments = service.parseVtt(vtt);
      expect(segments).toHaveLength(1);
    });
  });

  describe("toSrt()", () => {
    it("converts segments to SRT format", () => {
      const segments = [
        { startTime: 1.5, endTime: 4.0, text: "Hello" },
        { startTime: 5.0, endTime: 8.0, text: "World" },
      ];

      const srt = service.toSrt(segments);
      expect(srt).toContain("1\n00:00:01,500 --> 00:00:04,000\nHello");
      expect(srt).toContain("2\n00:00:05,000 --> 00:00:08,000\nWorld");
    });

    it("formats hours correctly", () => {
      const segments = [{ startTime: 3661.5, endTime: 3665.0, text: "Late" }];
      const srt = service.toSrt(segments);
      expect(srt).toContain("01:01:01,500 --> 01:01:05,000");
    });
  });

  describe("toVtt()", () => {
    it("converts segments to WebVTT format", () => {
      const segments = [{ startTime: 1.0, endTime: 4.0, text: "Hello" }];
      const vtt = service.toVtt(segments);
      expect(vtt).toMatch(/^WEBVTT/);
      expect(vtt).toContain("00:00:01.000 --> 00:00:04.000");
    });
  });

  describe("roundtrip SRT parse/generate", () => {
    it("preserves content through parse and regenerate", () => {
      const original = `1
00:00:01,000 --> 00:00:04,500
Hello world

2
00:00:05,000 --> 00:00:08,200
Second line`;

      const segments = service.parseSrt(original);
      const regenerated = service.toSrt(segments);
      const reparsed = service.parseSrt(regenerated);

      expect(reparsed).toHaveLength(segments.length);
      expect(reparsed[0].text).toBe(segments[0].text);
      expect(reparsed[0].startTime).toBeCloseTo(segments[0].startTime, 2);
    });
  });

  describe("downloadCaptionAsSrt()", () => {
    it("returns SRT content directly for SRT captions", async () => {
      const srtContent = "1\n00:00:01,000 --> 00:00:02,000\nHello";
      mockRequest.mockResolvedValue("https://example.com/caption.srt");
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(srtContent),
      }) as jest.Mock;

      const caption = {
        id: "cap1",
        format: KalturaCaptionType.SRT,
      } as any;

      const result = await service.downloadCaptionAsSrt(caption);
      expect(result).toBe(srtContent);
    });

    it("converts WebVTT to SRT", async () => {
      const vttContent = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello";
      mockRequest.mockResolvedValue("https://example.com/caption.vtt");
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(vttContent),
      }) as jest.Mock;

      const caption = {
        id: "cap1",
        format: KalturaCaptionType.WEBVTT,
      } as any;

      const result = await service.downloadCaptionAsSrt(caption);
      expect(result).toContain("00:00:01,000 --> 00:00:02,000");
      expect(result).toContain("Hello");
    });
  });

  describe("downloadCaptionAsJson()", () => {
    it("fetches JSON transcript from Kaltura serveAsJson endpoint", async () => {
      const jsonData = {
        objects: [
          { startTime: 1000, endTime: 4500, content: [{ text: "Hello world" }] },
          { startTime: 5000, endTime: 8200, content: [{ text: "Second line" }] },
        ],
      };
      mockRequest.mockResolvedValue("https://example.com/transcript.json");
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(jsonData),
      }) as jest.Mock;

      const result = await service.downloadCaptionAsJson("cap1");
      expect(result).toHaveLength(2);
      expect(result[0].startTime).toBe(1000);
      expect(result[0].content[0].text).toBe("Hello world");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          service: "caption_captionAsset",
          action: "serveAsJson",
          params: { captionAssetId: "cap1" },
        }),
      );
    });

    it("returns empty array when no objects in response", async () => {
      mockRequest.mockResolvedValue("https://example.com/transcript.json");
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      }) as jest.Mock;

      const result = await service.downloadCaptionAsJson("cap1");
      expect(result).toEqual([]);
    });

    it("throws on HTTP error", async () => {
      mockRequest.mockResolvedValue("https://example.com/transcript.json");
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }) as jest.Mock;

      await expect(service.downloadCaptionAsJson("cap1")).rejects.toThrow(
        "Failed to fetch JSON transcript: HTTP 404",
      );
    });
  });

  describe("parseKalturaJson()", () => {
    it("converts Kaltura JSON segments to CaptionSegments", () => {
      const segments = [
        { startTime: 1000, endTime: 4500, content: [{ text: "Hello world" }] },
        { startTime: 5000, endTime: 8200, content: [{ text: "Second line" }] },
      ];

      const result = service.parseKalturaJson(segments);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ startTime: 1.0, endTime: 4.5, text: "Hello world" });
      expect(result[1]).toEqual({ startTime: 5.0, endTime: 8.2, text: "Second line" });
    });

    it("joins multiple content items with newlines", () => {
      const segments = [
        {
          startTime: 0,
          endTime: 1000,
          content: [{ text: "Line one" }, { text: "Line two" }],
        },
      ];

      const result = service.parseKalturaJson(segments);
      expect(result[0].text).toBe("Line one\nLine two");
    });

    it("handles empty segments array", () => {
      const result = service.parseKalturaJson([]);
      expect(result).toEqual([]);
    });
  });

  describe("uploadCaption()", () => {
    it("creates new caption asset then uploads content", async () => {
      mockRequest
        .mockResolvedValueOnce({ id: "cap_new" }) // add
        .mockResolvedValueOnce({ id: "cap_new", language: "en" }); // setContent

      const result = await service.uploadCaption("0_abc", "1\n00:00:01,000 --> 00:00:02,000\nHi", {
        language: "en",
        label: "English",
        format: KalturaCaptionType.SRT,
      });

      expect(mockRequest).toHaveBeenCalledTimes(2);
      expect(result.id).toBe("cap_new");
    });

    it("updates existing caption asset", async () => {
      mockRequest.mockResolvedValue({ id: "cap_exist", language: "en" });

      await service.uploadCaption("0_abc", "content", {
        captionAssetId: "cap_exist",
        language: "en",
        label: "English",
        format: KalturaCaptionType.SRT,
      });

      expect(mockRequest).toHaveBeenCalledTimes(1);
      expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ action: "setContent" }));
    });
  });
});
