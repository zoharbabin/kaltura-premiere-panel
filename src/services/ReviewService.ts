import { KalturaClient } from "./KalturaClient";
import { KalturaAnnotation, KalturaListResponse } from "../types/kaltura";
import { MarkerColor, MarkerData } from "../types/premiere";
import { createLogger } from "../utils/logger";

/** Minimal host interface needed by ReviewService for marker sync */
interface ReviewHostService {
  addMarkers(markers: MarkerData[]): Promise<void>;
  getMarkers?(): Promise<MarkerData[]>;
}

const log = createLogger("ReviewService");

/** Result of a sync operation between Kaltura annotations and Premiere markers */
export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/** An annotation with all its threaded replies */
export interface AnnotationThread {
  root: KalturaAnnotation;
  replies: KalturaAnnotation[];
}

/** Prefix used to tag Premiere markers originating from Kaltura annotations */
const KALTURA_MARKER_PREFIX = "[Kaltura]";

/**
 * Review and collaboration service.
 * Syncs Kaltura annotations (timed comments) with Premiere Pro timeline markers
 * and manages threaded annotation replies.
 */
export class ReviewService {
  constructor(
    private client: KalturaClient,
    private hostService: ReviewHostService,
  ) {}

  /** List annotations for an entry, optionally filtered by parentId for thread replies */
  async listAnnotations(entryId: string, parentId?: string): Promise<KalturaAnnotation[]> {
    log.debug("Listing annotations", { entryId, parentId });

    const filter: Record<string, unknown> = {
      objectType: "KalturaAnnotationFilter",
      entryIdEqual: entryId,
      statusEqual: 1,
    };

    if (parentId) {
      filter.parentIdEqual = parentId;
    } else {
      filter.parentIdEqual = "";
    }

    const response = await this.client.request<KalturaListResponse<KalturaAnnotation>>({
      service: "annotation_annotation",
      action: "list",
      params: { filter },
    });

    return response.objects || [];
  }

  /** Add a new annotation (comment or reply) to an entry */
  async addAnnotation(
    entryId: string,
    text: string,
    startTime: number,
    endTime?: number,
    parentId?: string,
  ): Promise<KalturaAnnotation> {
    log.info("Adding annotation", { entryId, startTime, parentId });

    const annotation: Record<string, unknown> = {
      objectType: "KalturaAnnotation",
      entryId,
      text,
      startTime,
      isPublic: true,
    };

    if (endTime !== undefined) {
      annotation.endTime = endTime;
    }
    if (parentId) {
      annotation.parentId = parentId;
    }

    return this.client.request<KalturaAnnotation>({
      service: "annotation_annotation",
      action: "add",
      params: { annotation },
    });
  }

  /** Update the text of an existing annotation */
  async updateAnnotation(annotationId: string, text: string): Promise<KalturaAnnotation> {
    log.info("Updating annotation", { annotationId });

    return this.client.request<KalturaAnnotation>({
      service: "annotation_annotation",
      action: "update",
      params: {
        id: annotationId,
        annotation: {
          objectType: "KalturaAnnotation",
          text,
        },
      },
    });
  }

  /** Delete an annotation */
  async deleteAnnotation(annotationId: string): Promise<void> {
    log.info("Deleting annotation", { annotationId });

    await this.client.request({
      service: "annotation_annotation",
      action: "delete",
      params: { id: annotationId },
    });
  }

  /**
   * Pull annotations from Kaltura and create timeline markers in Premiere.
   * Only top-level annotations (no parentId) become markers.
   * Thread replies are included in the marker comments.
   */
  async syncToMarkers(entryId: string): Promise<SyncResult> {
    log.info("Syncing annotations to Premiere markers", { entryId });

    const result: SyncResult = { created: 0, updated: 0, skipped: 0, errors: [] };

    let annotations: KalturaAnnotation[];
    try {
      annotations = await this.listAnnotations(entryId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch annotations";
      result.errors.push(message);
      return result;
    }

    if (annotations.length === 0) {
      log.debug("No annotations to sync");
      return result;
    }

    const markers: MarkerData[] = [];

    for (const annotation of annotations) {
      try {
        const replies = await this.listAnnotations(entryId, annotation.id);
        const commentsText = this.buildMarkerComments(annotation, replies);

        markers.push({
          start: annotation.startTime,
          name: `${KALTURA_MARKER_PREFIX} ${this.truncate(annotation.text, 40)}`,
          comments: commentsText,
          colorIndex: MarkerColor.CYAN,
          duration: annotation.endTime ? annotation.endTime - annotation.startTime : undefined,
        });

        result.created++;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        result.errors.push(`Failed to process annotation ${annotation.id}: ${message}`);
        result.skipped++;
      }
    }

    if (markers.length > 0) {
      try {
        await this.hostService.addMarkers(markers);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to add markers";
        result.errors.push(message);
        result.created = 0;
        result.skipped = annotations.length;
      }
    }

    log.info("Sync to markers complete", result);
    return result;
  }

  /**
   * Push Premiere markers back to Kaltura as annotations.
   * Only markers tagged with the Kaltura prefix are skipped to avoid duplicates.
   */
  async syncFromMarkers(entryId: string): Promise<SyncResult> {
    log.info("Syncing Premiere markers to Kaltura annotations", { entryId });

    const result: SyncResult = { created: 0, updated: 0, skipped: 0, errors: [] };

    let markers: MarkerData[];
    try {
      if (!this.hostService.getMarkers) {
        result.errors.push("Host app does not support reading markers");
        return result;
      }
      markers = await this.hostService.getMarkers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to get markers";
      result.errors.push(message);
      return result;
    }

    if (markers.length === 0) {
      log.debug("No markers to sync");
      return result;
    }

    for (const marker of markers) {
      // Skip markers that originated from Kaltura (already synced)
      if (marker.name.startsWith(KALTURA_MARKER_PREFIX)) {
        result.skipped++;
        continue;
      }

      try {
        const text = marker.comments || marker.name;
        const endTime = marker.duration ? marker.start + marker.duration : undefined;

        await this.addAnnotation(entryId, text, marker.start, endTime);
        result.created++;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        result.errors.push(`Failed to create annotation for marker "${marker.name}": ${message}`);
        result.skipped++;
      }
    }

    log.info("Sync from markers complete", result);
    return result;
  }

  /** Get an annotation with all its threaded replies */
  async getThread(annotationId: string): Promise<AnnotationThread> {
    log.debug("Getting annotation thread", { annotationId });

    const root = await this.client.request<KalturaAnnotation>({
      service: "annotation_annotation",
      action: "get",
      params: { id: annotationId },
    });

    const replies = await this.listAnnotations(root.entryId, annotationId);

    return { root, replies };
  }

  /** Build a combined comments string from an annotation and its replies */
  private buildMarkerComments(annotation: KalturaAnnotation, replies: KalturaAnnotation[]): string {
    const lines: string[] = [];

    lines.push(`[${annotation.userId || "unknown"}] ${annotation.text}`);

    for (const reply of replies) {
      lines.push(`  > [${reply.userId || "unknown"}] ${reply.text}`);
    }

    return lines.join("\n");
  }

  /** Truncate text to a maximum length, appending ellipsis if needed */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 1) + "\u2026";
  }
}
