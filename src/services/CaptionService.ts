import { KalturaClient } from "./KalturaClient";
import {
  KalturaCaptionAsset,
  KalturaCaptionType,
  KalturaListResponse,
  KalturaVendorServiceFeature,
  KalturaVendorServiceType,
  KalturaVendorTaskStatus,
  KalturaEntryVendorTask,
} from "../types/kaltura";
import { createLogger } from "../utils/logger";

const log = createLogger("CaptionService");

export interface CaptionSegment {
  startTime: number;
  endTime: number;
  text: string;
  speakerId?: string;
}

export interface ReachCatalogItem {
  id: number;
  name: string;
  serviceType: KalturaVendorServiceType;
  serviceFeature: KalturaVendorServiceFeature;
  sourceLanguage: string;
  targetLanguage?: string;
  turnAroundTime: number;
  pricing?: { pricePerUnit: number };
}

/**
 * Manages Kaltura captions: REACH captioning, import/export, translation.
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
    // Strip WEBVTT header line(s)
    const content = vtt.replace(/^WEBVTT[^\n]*\n\n?/, "");
    const blocks = content.trim().split(/\n\n+/);

    for (const block of blocks) {
      const lines = block.split("\n");
      // Find the line with the timecode
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

      segments.push({
        startTime,
        endTime,
        text: lines
          .slice(timeLineIndex + 1)
          .join("\n")
          .trim(),
      });
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

  /** List available REACH catalog items for captioning/translation */
  async listReachCatalogItems(): Promise<ReachCatalogItem[]> {
    try {
      const response = await this.client.request<KalturaListResponse<ReachCatalogItem>>({
        service: "reach_vendorCatalogItem",
        action: "list",
        params: {
          filter: {
            objectType: "KalturaVendorCatalogItemFilter",
          },
        },
      });
      return response.objects || [];
    } catch {
      log.warn("REACH catalog items not available");
      return [];
    }
  }

  /** Trigger REACH captioning job */
  async triggerCaptioning(
    entryId: string,
    catalogItemId: number,
    sourceLanguage: string,
  ): Promise<KalturaEntryVendorTask> {
    log.info("Triggering REACH captioning", { entryId, catalogItemId, sourceLanguage });
    return this.client.request<KalturaEntryVendorTask>({
      service: "reach_entryVendorTask",
      action: "add",
      params: {
        entryVendorTask: {
          objectType: "KalturaEntryVendorTask",
          entryId,
          catalogItemId,
          sourceLanguage,
        },
      },
    });
  }

  /** Trigger REACH translation job */
  async triggerTranslation(
    entryId: string,
    catalogItemId: number,
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<KalturaEntryVendorTask> {
    log.info("Triggering REACH translation", { entryId, targetLanguage });
    return this.client.request<KalturaEntryVendorTask>({
      service: "reach_entryVendorTask",
      action: "add",
      params: {
        entryVendorTask: {
          objectType: "KalturaEntryVendorTask",
          entryId,
          catalogItemId,
          sourceLanguage,
          targetLanguage,
        },
      },
    });
  }

  /** Get REACH task status */
  async getTaskStatus(taskId: number): Promise<KalturaEntryVendorTask> {
    return this.client.request<KalturaEntryVendorTask>({
      service: "reach_entryVendorTask",
      action: "get",
      params: { id: taskId },
    });
  }

  /** List REACH tasks for an entry */
  async listTasks(entryId: string): Promise<KalturaEntryVendorTask[]> {
    const response = await this.client.request<KalturaListResponse<KalturaEntryVendorTask>>({
      service: "reach_entryVendorTask",
      action: "list",
      params: {
        filter: {
          objectType: "KalturaEntryVendorTaskFilter",
          entryIdEqual: entryId,
        },
      },
    });
    return response.objects || [];
  }

  /** Get human-readable task status */
  getTaskStatusLabel(status: KalturaVendorTaskStatus): string {
    switch (status) {
      case KalturaVendorTaskStatus.PENDING:
        return "Pending";
      case KalturaVendorTaskStatus.READY:
        return "Complete";
      case KalturaVendorTaskStatus.PROCESSING:
        return "Processing";
      case KalturaVendorTaskStatus.ERROR:
        return "Error";
      default:
        return "Unknown";
    }
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
