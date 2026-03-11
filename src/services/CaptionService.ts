import { KalturaClient } from "./KalturaClient";
import { KalturaCaptionAsset, KalturaCaptionType, KalturaListResponse } from "../types/kaltura";
import { createLogger } from "../utils/logger";

const log = createLogger("CaptionService");

export interface CaptionSegment {
  startTime: number;
  endTime: number;
  text: string;
  speakerId?: string;
}

/** Raw segment from Kaltura's serveAsJson endpoint */
export interface KalturaTranscriptSegment {
  startTime: number; // milliseconds
  endTime: number; // milliseconds
  content: { text: string }[];
}

/**
 * Manages Kaltura captions: listing, downloading, parsing, and uploading.
 */
export class CaptionService {
  constructor(private client: KalturaClient) {}

  /** List caption tracks for an entry */
  async listCaptions(entryId: string): Promise<KalturaCaptionAsset[]> {
    const response = await this.client.request<KalturaListResponse<KalturaCaptionAsset>>({
      service: "caption_captionAsset",
      action: "list",
      params: {
        filter: {
          objectType: "KalturaCaptionAssetFilter",
          entryIdEqual: entryId,
        },
      },
    });
    return response.objects || [];
  }

  /** Download caption content as text */
  async downloadCaptionContent(captionAssetId: string): Promise<string> {
    const urlResponse = await this.client.request<
      { objectType?: string } & Record<string, unknown>
    >({
      service: "caption_captionAsset",
      action: "getUrl",
      params: { id: captionAssetId },
    });

    const url = typeof urlResponse === "string" ? urlResponse : String(urlResponse);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download caption: HTTP ${response.status}`);
    return response.text();
  }

  /**
   * Download a caption track and convert to SRT format.
   * SRT is the universal format supported by Premiere Pro for import.
   */
  async downloadCaptionAsSrt(caption: KalturaCaptionAsset): Promise<string> {
    log.info("Downloading caption as SRT", { id: caption.id, format: caption.format });
    const content = await this.downloadCaptionContent(caption.id);

    // Kaltura API returns format as string ("1", "3") but enum values are numbers.
    // Use Number() to ensure correct comparison.
    const format = Number(caption.format);

    if (format === KalturaCaptionType.SRT) {
      return content;
    }

    // Convert other formats to SRT via parse → serialize
    const segments =
      format === KalturaCaptionType.WEBVTT ? this.parseVtt(content) : this.parseSrt(content);

    if (segments.length === 0) {
      log.warn("No parseable segments found, returning raw content");
      return content;
    }

    return this.toSrt(segments);
  }

  /** Parse SRT content into segments */
  parseSrt(srt: string): CaptionSegment[] {
    const segments: CaptionSegment[] = [];
    const blocks = srt.trim().split(/\n\n+/);

    for (const block of blocks) {
      const lines = block.split("\n");
      if (lines.length < 3) continue;

      const timeMatch = lines[1].match(
        /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/,
      );
      if (!timeMatch) continue;

      const startTime =
        parseInt(timeMatch[1]) * 3600 +
        parseInt(timeMatch[2]) * 60 +
        parseInt(timeMatch[3]) +
        parseInt(timeMatch[4]) / 1000;
      const endTime =
        parseInt(timeMatch[5]) * 3600 +
        parseInt(timeMatch[6]) * 60 +
        parseInt(timeMatch[7]) +
        parseInt(timeMatch[8]) / 1000;

      segments.push({
        startTime,
        endTime,
        text: lines.slice(2).join("\n").trim(),
      });
    }

    return segments;
  }

  /** Parse WebVTT content into segments */
  parseVtt(vtt: string): CaptionSegment[] {
    const segments: CaptionSegment[] = [];
    const content = vtt.replace(/^WEBVTT[^\n]*\n\n?/, "");
    const blocks = content.trim().split(/\n\n+/);

    for (const block of blocks) {
      const lines = block.split("\n");
      let timeLineIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("-->")) {
          timeLineIndex = i;
          break;
        }
      }
      if (timeLineIndex < 0 || timeLineIndex >= lines.length - 1) continue;

      const timeMatch = lines[timeLineIndex].match(
        /(\d{2}):(\d{2}):(\d{2})[,.:](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.:](\d{3})/,
      );
      if (!timeMatch) continue;

      const startTime =
        parseInt(timeMatch[1]) * 3600 +
        parseInt(timeMatch[2]) * 60 +
        parseInt(timeMatch[3]) +
        parseInt(timeMatch[4]) / 1000;
      const endTime =
        parseInt(timeMatch[5]) * 3600 +
        parseInt(timeMatch[6]) * 60 +
        parseInt(timeMatch[7]) +
        parseInt(timeMatch[8]) / 1000;

      // Strip VTT voice tags: <v Speaker Name>text</v> → text
      const rawText = lines
        .slice(timeLineIndex + 1)
        .join("\n")
        .trim();
      const text = rawText.replace(/<v[^>]*>/g, "").replace(/<\/v>/g, "");

      segments.push({ startTime, endTime, text });
    }

    return segments;
  }

  /** Convert segments to SRT format */
  toSrt(segments: CaptionSegment[]): string {
    return segments
      .map((seg, i) => {
        const start = this.formatSrtTime(seg.startTime);
        const end = this.formatSrtTime(seg.endTime);
        return `${i + 1}\n${start} --> ${end}\n${seg.text}`;
      })
      .join("\n\n");
  }

  /** Convert segments to WebVTT format */
  toVtt(segments: CaptionSegment[]): string {
    const cues = segments
      .map((seg) => {
        const start = this.formatVttTime(seg.startTime);
        const end = this.formatVttTime(seg.endTime);
        return `${start} --> ${end}\n${seg.text}`;
      })
      .join("\n\n");
    return `WEBVTT\n\n${cues}`;
  }

  /** Upload caption content to Kaltura (update existing or create new) */
  async uploadCaption(
    entryId: string,
    content: string,
    options: {
      captionAssetId?: string;
      language: string;
      label: string;
      format: KalturaCaptionType;
      isDefault?: boolean;
    },
  ): Promise<KalturaCaptionAsset> {
    let assetId = options.captionAssetId;

    if (!assetId) {
      log.info("Creating new caption asset", { entryId, language: options.language });
      const asset = await this.client.request<KalturaCaptionAsset>({
        service: "caption_captionAsset",
        action: "add",
        params: {
          entryId,
          captionAsset: {
            objectType: "KalturaCaptionAsset",
            language: options.language,
            label: options.label,
            format: options.format,
            isDefault: options.isDefault ?? false,
          },
        },
      });
      assetId = asset.id;
    }

    log.info("Uploading caption content", { assetId });
    return this.client.request<KalturaCaptionAsset>({
      service: "caption_captionAsset",
      action: "setContent",
      params: {
        id: assetId,
        contentResource: {
          objectType: "KalturaStringResource",
          content,
        },
      },
    });
  }

  /**
   * Download a caption asset as structured JSON via Kaltura's serveAsJson endpoint.
   * Returns an array of time-stamped segments with text content.
   */
  async downloadCaptionAsJson(captionAssetId: string): Promise<KalturaTranscriptSegment[]> {
    log.info("Downloading caption as JSON", { captionAssetId });
    const urlResponse = await this.client.request<
      { objectType?: string } & Record<string, unknown>
    >({
      service: "caption_captionAsset",
      action: "serveAsJson",
      params: { captionAssetId },
    });

    log.info("serveAsJson API response", {
      type: typeof urlResponse,
      value: JSON.stringify(urlResponse).substring(0, 300),
    });

    const url = typeof urlResponse === "string" ? urlResponse : String(urlResponse);
    const response = await fetch(url);
    log.info("serveAsJson fetch result", { ok: response.ok, status: response.status });
    if (!response.ok) throw new Error(`Failed to fetch JSON transcript: HTTP ${response.status}`);
    const data = await response.json();
    log.info("serveAsJson JSON data", {
      hasObjects: !!data.objects,
      objectCount: data.objects?.length,
      keys: Object.keys(data),
    });
    return (data.objects as KalturaTranscriptSegment[]) || [];
  }

  /** Convert Kaltura JSON transcript segments to CaptionSegments (ms → seconds) */
  parseKalturaJson(segments: KalturaTranscriptSegment[]): CaptionSegment[] {
    return segments.map((seg) => ({
      startTime: seg.startTime / 1000,
      endTime: seg.endTime / 1000,
      text: seg.content.map((c) => c.text).join("\n"),
    }));
  }

  private formatSrtTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  }

  private formatVttTime(seconds: number): string {
    return this.formatSrtTime(seconds).replace(",", ".");
  }
}
