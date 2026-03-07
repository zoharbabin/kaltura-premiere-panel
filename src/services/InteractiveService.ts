import { KalturaClient } from "./KalturaClient";
import { KalturaMediaEntry, KalturaListResponse } from "../types/kaltura";
import { MarkerData } from "../types/premiere";
import { SyncResult } from "./ReviewService";
import { createLogger } from "../utils/logger";

const log = createLogger("InteractiveService");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Cue point type discriminator */
export type CuePointType = "chapter" | "quiz" | "hotspot" | "cta" | "code";

/** A Kaltura cue point returned from the API */
export interface CuePoint {
  id: string;
  entryId: string;
  type: CuePointType;
  startTime: number;
  endTime?: number;
  text?: string;
  tags?: string;
  createdAt: number;
}

/** Data required to create a chapter cue point */
export interface ChapterData {
  title: string;
  startTime: number;
  description?: string;
  thumbnailUrl?: string;
}

/** Data required to create a quiz cue point */
export interface QuizData {
  question: string;
  startTime: number;
  answers: { text: string; isCorrect: boolean }[];
  explanation?: string;
}

/** Data required to create a hotspot cue point */
export interface HotspotData {
  startTime: number;
  endTime: number;
  label: string;
  link?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Data required to create a call-to-action overlay */
export interface CTAData {
  startTime: number;
  endTime?: number;
  label: string;
  url: string;
  buttonText?: string;
}

/** A recording associated with a live entry */
export interface LiveRecording {
  id: string;
  entryId: string;
  duration: number;
  createdAt: number;
  status: number;
}

// ---------------------------------------------------------------------------
// System name constants used to differentiate cue point types
// ---------------------------------------------------------------------------

const SYSTEM_NAMES: Record<CuePointType, string> = {
  chapter: "CHAPTER",
  quiz: "QUIZ",
  hotspot: "HOTSPOT",
  cta: "CTA",
  code: "CODE",
};

const TAG_PREFIX = "premiere-panel-";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Interactive video authoring and live-to-VOD workflows.
 * Manages chapters, quiz points, hotspots, CTAs (cue points) and converts
 * live recordings to VOD entries.
 */
export class InteractiveService {
  constructor(private client: KalturaClient) {}

  // -------------------------------------------------------------------------
  // Interactive video authoring (#31)
  // -------------------------------------------------------------------------

  /** Add a chapter cue point to an entry */
  async addChapter(entryId: string, chapter: ChapterData): Promise<CuePoint> {
    log.info("Adding chapter", { entryId, title: chapter.title, startTime: chapter.startTime });

    const annotation: Record<string, unknown> = {
      objectType: "KalturaAnnotation",
      entryId,
      startTime: chapter.startTime,
      text: chapter.title,
      tags: `${TAG_PREFIX}chapter`,
      systemName: SYSTEM_NAMES.chapter,
      isPublic: true,
    };

    if (chapter.description) {
      annotation.description = chapter.description;
    }
    if (chapter.thumbnailUrl) {
      annotation.partnerData = JSON.stringify({ thumbnailUrl: chapter.thumbnailUrl });
    }

    const response = await this.client.request<CuePointResponse>({
      service: "cuePoint_cuePoint",
      action: "add",
      params: { cuePoint: annotation },
    });

    return this.toCuePoint(response, "chapter");
  }

  /** Add a quiz question cue point to an entry */
  async addQuizPoint(entryId: string, quiz: QuizData): Promise<CuePoint> {
    log.info("Adding quiz point", { entryId, question: quiz.question, startTime: quiz.startTime });

    const partnerData = JSON.stringify({
      answers: quiz.answers,
      explanation: quiz.explanation,
    });

    const response = await this.client.request<CuePointResponse>({
      service: "cuePoint_cuePoint",
      action: "add",
      params: {
        cuePoint: {
          objectType: "KalturaAnnotation",
          entryId,
          startTime: quiz.startTime,
          text: quiz.question,
          tags: `${TAG_PREFIX}quiz`,
          systemName: SYSTEM_NAMES.quiz,
          partnerData,
          isPublic: true,
        },
      },
    });

    return this.toCuePoint(response, "quiz");
  }

  /** Add a clickable hotspot cue point to an entry */
  async addHotspot(entryId: string, hotspot: HotspotData): Promise<CuePoint> {
    log.info("Adding hotspot", { entryId, label: hotspot.label, startTime: hotspot.startTime });

    const partnerData = JSON.stringify({
      link: hotspot.link,
      x: hotspot.x,
      y: hotspot.y,
      width: hotspot.width,
      height: hotspot.height,
    });

    const response = await this.client.request<CuePointResponse>({
      service: "cuePoint_cuePoint",
      action: "add",
      params: {
        cuePoint: {
          objectType: "KalturaAnnotation",
          entryId,
          startTime: hotspot.startTime,
          endTime: hotspot.endTime,
          text: hotspot.label,
          tags: `${TAG_PREFIX}hotspot`,
          systemName: SYSTEM_NAMES.hotspot,
          partnerData,
          isPublic: true,
        },
      },
    });

    return this.toCuePoint(response, "hotspot");
  }

  /** Add a call-to-action overlay cue point to an entry */
  async addCTA(entryId: string, cta: CTAData): Promise<CuePoint> {
    log.info("Adding CTA", { entryId, label: cta.label, startTime: cta.startTime });

    const partnerData = JSON.stringify({
      url: cta.url,
      buttonText: cta.buttonText,
    });

    const annotation: Record<string, unknown> = {
      objectType: "KalturaAnnotation",
      entryId,
      startTime: cta.startTime,
      text: cta.label,
      tags: `${TAG_PREFIX}cta`,
      systemName: SYSTEM_NAMES.cta,
      partnerData,
      isPublic: true,
    };

    if (cta.endTime !== undefined) {
      annotation.endTime = cta.endTime;
    }

    const response = await this.client.request<CuePointResponse>({
      service: "cuePoint_cuePoint",
      action: "add",
      params: { cuePoint: annotation },
    });

    return this.toCuePoint(response, "cta");
  }

  /** List all cue points for an entry, optionally filtered by type */
  async listCuePoints(entryId: string, type?: CuePointType): Promise<CuePoint[]> {
    log.debug("Listing cue points", { entryId, type });

    const filter: Record<string, unknown> = {
      objectType: "KalturaCuePointFilter",
      entryIdEqual: entryId,
      statusEqual: 1,
    };

    if (type) {
      filter.tagsLike = `${TAG_PREFIX}${type}`;
      filter.systemNameEqual = SYSTEM_NAMES[type];
    } else {
      // Match any premiere-panel cue point
      filter.tagsLike = TAG_PREFIX;
    }

    const response = await this.client.request<KalturaListResponse<CuePointResponse>>({
      service: "cuePoint_cuePoint",
      action: "list",
      params: { filter },
    });

    return (response.objects || []).map((cp) => this.toCuePoint(cp, this.inferType(cp)));
  }

  /** Delete a cue point by ID */
  async deleteCuePoint(cuePointId: string): Promise<void> {
    log.info("Deleting cue point", { cuePointId });

    await this.client.request({
      service: "cuePoint_cuePoint",
      action: "delete",
      params: { id: cuePointId },
    });
  }

  /**
   * Convert Premiere Pro timeline markers into Kaltura chapter cue points.
   * Creates new chapters for each marker and reports the sync outcome.
   */
  async syncMarkersToChapters(entryId: string, markers: MarkerData[]): Promise<SyncResult> {
    log.info("Syncing markers to chapters", { entryId, count: markers.length });

    const result: SyncResult = { created: 0, updated: 0, skipped: 0, errors: [] };

    if (markers.length === 0) {
      log.debug("No markers to sync");
      return result;
    }

    for (const marker of markers) {
      try {
        await this.addChapter(entryId, {
          title: marker.name,
          startTime: marker.start,
          description: marker.comments || undefined,
        });
        result.created++;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        result.errors.push(`Failed to create chapter for marker "${marker.name}": ${message}`);
        result.skipped++;
      }
    }

    log.info("Sync markers to chapters complete", result);
    return result;
  }

  // -------------------------------------------------------------------------
  // Live-to-VOD (#30)
  // -------------------------------------------------------------------------

  /** List recordings associated with a live entry */
  async listLiveRecordings(entryId: string): Promise<LiveRecording[]> {
    log.debug("Listing live recordings", { entryId });

    const response = await this.client.request<KalturaListResponse<LiveRecordingResponse>>({
      service: "liveStream",
      action: "list",
      params: {
        filter: {
          objectType: "KalturaLiveStreamEntryFilter",
          rootEntryIdEqual: entryId,
        },
      },
    });

    return (response.objects || []).map((rec) => ({
      id: rec.id,
      entryId: rec.rootEntryId || entryId,
      duration: rec.duration || 0,
      createdAt: rec.createdAt,
      status: rec.status,
    }));
  }

  /** Clip and convert a live recording to a VOD entry */
  async convertToVod(
    recordingId: string,
    trimStart?: number,
    trimEnd?: number,
  ): Promise<KalturaMediaEntry> {
    log.info("Converting live recording to VOD", { recordingId, trimStart, trimEnd });

    const params: Record<string, unknown> = {
      sourceEntryId: recordingId,
      mediaEntry: {
        objectType: "KalturaMediaEntry",
      },
    };

    if (trimStart !== undefined || trimEnd !== undefined) {
      const operations: Record<string, unknown> = {
        objectType: "KalturaClipAttributes",
      };
      if (trimStart !== undefined) {
        operations.offset = trimStart;
      }
      if (trimEnd !== undefined) {
        operations.duration = trimStart !== undefined ? trimEnd - trimStart : trimEnd;
      }
      params.resource = {
        objectType: "KalturaOperationResource",
        resource: {
          objectType: "KalturaEntryResource",
          entryId: recordingId,
        },
        operationAttributes: [operations],
      };
    }

    return this.client.request<KalturaMediaEntry>({
      service: "media",
      action: "add",
      params,
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Map a raw API cue point response to a typed CuePoint */
  private toCuePoint(raw: CuePointResponse, type: CuePointType): CuePoint {
    return {
      id: raw.id,
      entryId: raw.entryId,
      type,
      startTime: raw.startTime,
      endTime: raw.endTime,
      text: raw.text,
      tags: raw.tags,
      createdAt: raw.createdAt,
    };
  }

  /** Infer the CuePointType from a raw cue point's tags or systemName */
  private inferType(raw: CuePointResponse): CuePointType {
    if (raw.systemName) {
      const entry = Object.entries(SYSTEM_NAMES).find(([, v]) => v === raw.systemName);
      if (entry) return entry[0] as CuePointType;
    }

    if (raw.tags) {
      for (const type of ["chapter", "quiz", "hotspot", "cta", "code"] as CuePointType[]) {
        if (raw.tags.includes(`${TAG_PREFIX}${type}`)) return type;
      }
    }

    return "code";
  }
}

// ---------------------------------------------------------------------------
// Internal API response shapes (not exported)
// ---------------------------------------------------------------------------

interface CuePointResponse {
  objectType?: string;
  id: string;
  entryId: string;
  startTime: number;
  endTime?: number;
  text?: string;
  tags?: string;
  systemName?: string;
  partnerData?: string;
  createdAt: number;
}

interface LiveRecordingResponse {
  objectType?: string;
  id: string;
  rootEntryId?: string;
  duration?: number;
  createdAt: number;
  status: number;
}
