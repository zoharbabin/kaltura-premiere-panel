import { KalturaClient } from "./KalturaClient";
import { MediaService } from "./MediaService";
import { KalturaMediaEntry, KalturaListResponse, KalturaModerationStatus } from "../types/kaltura";
import { createLogger } from "../utils/logger";

const log = createLogger("PublishWorkflowService");

export interface PublishResult {
  successful: number[];
  failed: { categoryId: number; error: string }[];
}

export interface EntryVersion {
  entryId: string;
  version: number;
  createdAt: number;
  userId: string;
}

export interface PublishPreset {
  name: string;
  tags?: string[];
  categoryIds?: number[];
  accessControlId?: number;
  description?: string;
}

/**
 * Publishing workflow service: multi-destination publish, approval workflow,
 * version management, scheduled publishing, and publishing presets.
 */
export class PublishWorkflowService {
  constructor(
    private client: KalturaClient,
    private mediaService: MediaService,
  ) {}

  // ---------------------------------------------------------------------------
  // Multi-destination publish (#26)
  // ---------------------------------------------------------------------------

  /** Assign an entry to multiple categories in batch */
  async publishToCategories(entryId: string, categoryIds: number[]): Promise<PublishResult> {
    log.info("Publishing entry to categories", { entryId, categoryIds });

    const result: PublishResult = { successful: [], failed: [] };

    for (const categoryId of categoryIds) {
      try {
        await this.client.request({
          service: "categoryEntry",
          action: "add",
          params: {
            categoryEntry: {
              objectType: "KalturaCategoryEntry",
              entryId,
              categoryId,
            },
          },
        });
        result.successful.push(categoryId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        log.warn("Failed to assign category", { entryId, categoryId, error: message });
        result.failed.push({ categoryId, error: message });
      }
    }

    log.info("Publish to categories complete", {
      entryId,
      successful: result.successful.length,
      failed: result.failed.length,
    });

    return result;
  }

  // ---------------------------------------------------------------------------
  // Approval workflow (#25)
  // ---------------------------------------------------------------------------

  /** Get the current moderation status of an entry */
  async getModerationStatus(entryId: string): Promise<KalturaModerationStatus> {
    log.debug("Getting moderation status", { entryId });
    const entry = await this.mediaService.get(entryId);
    return entry.moderationStatus ?? KalturaModerationStatus.AUTO_APPROVED;
  }

  /** Submit an entry for approval (set moderation status to PENDING) */
  async submitForApproval(entryId: string): Promise<KalturaMediaEntry> {
    log.info("Submitting entry for approval", { entryId });
    return this.client.request<KalturaMediaEntry>({
      service: "media",
      action: "update",
      params: {
        entryId,
        mediaEntry: {
          objectType: "KalturaMediaEntry",
          moderationStatus: KalturaModerationStatus.PENDING,
        },
      },
    });
  }

  /** Approve an entry (admin only) */
  async approve(entryId: string): Promise<KalturaMediaEntry> {
    log.info("Approving entry", { entryId });
    return this.client.request<KalturaMediaEntry>({
      service: "media",
      action: "update",
      params: {
        entryId,
        mediaEntry: {
          objectType: "KalturaMediaEntry",
          moderationStatus: KalturaModerationStatus.APPROVED,
        },
      },
    });
  }

  /** Reject an entry with an optional reason */
  async reject(entryId: string, reason?: string): Promise<KalturaMediaEntry> {
    log.info("Rejecting entry", { entryId, reason });
    const params: Record<string, unknown> = {
      entryId,
      mediaEntry: {
        objectType: "KalturaMediaEntry",
        moderationStatus: KalturaModerationStatus.REJECTED,
      },
    };
    if (reason) {
      (params.mediaEntry as Record<string, unknown>).tags = reason;
    }
    return this.client.request<KalturaMediaEntry>({
      service: "media",
      action: "update",
      params,
    });
  }

  // ---------------------------------------------------------------------------
  // Version management (#28)
  // ---------------------------------------------------------------------------

  /** List version history for an entry using media.list with replacedEntryId filter */
  async listVersions(entryId: string): Promise<EntryVersion[]> {
    log.debug("Listing versions", { entryId });

    const response = await this.client.request<KalturaListResponse<KalturaMediaEntry>>({
      service: "media",
      action: "list",
      params: {
        filter: {
          objectType: "KalturaMediaEntryFilter",
          replacedEntryIdEqual: entryId,
        },
      },
    });

    const versions: EntryVersion[] = (response.objects || []).map(
      (entry: KalturaMediaEntry, index: number) => ({
        entryId: entry.id,
        version: index + 1,
        createdAt: entry.createdAt,
        userId: entry.userId ?? "",
      }),
    );

    return versions;
  }

  /** Replace entry content, creating a new version */
  async replaceEntry(entryId: string, uploadTokenId: string): Promise<KalturaMediaEntry> {
    log.info("Replacing entry content", { entryId, uploadTokenId });

    return this.client.request<KalturaMediaEntry>({
      service: "media",
      action: "updateContent",
      params: {
        entryId,
        resource: {
          objectType: "KalturaUploadedFileTokenResource",
          token: uploadTokenId,
        },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Scheduled publishing (#27)
  // ---------------------------------------------------------------------------

  /** Set start/end dates for scheduled availability */
  async schedulePublish(
    entryId: string,
    startDate: number,
    endDate?: number,
  ): Promise<KalturaMediaEntry> {
    log.info("Scheduling publish", { entryId, startDate, endDate });

    const mediaEntry: Record<string, unknown> = {
      objectType: "KalturaMediaEntry",
      startDate,
    };
    if (endDate !== undefined) {
      mediaEntry.endDate = endDate;
    }

    return this.client.request<KalturaMediaEntry>({
      service: "media",
      action: "update",
      params: { entryId, mediaEntry },
    });
  }

  /** Clear scheduling dates from an entry */
  async cancelSchedule(entryId: string): Promise<KalturaMediaEntry> {
    log.info("Cancelling scheduled publish", { entryId });

    return this.client.request<KalturaMediaEntry>({
      service: "media",
      action: "update",
      params: {
        entryId,
        mediaEntry: {
          objectType: "KalturaMediaEntry",
          startDate: -1,
          endDate: -1,
        },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Publishing presets (#27)
  // ---------------------------------------------------------------------------

  /** Apply a publishing preset to an entry */
  async applyPreset(entryId: string, preset: PublishPreset): Promise<void> {
    log.info("Applying publish preset", { entryId, preset: preset.name });

    // Update entry metadata from preset
    const mediaEntry: Record<string, unknown> = {
      objectType: "KalturaMediaEntry",
    };

    if (preset.tags) {
      mediaEntry.tags = preset.tags.join(",");
    }
    if (preset.accessControlId !== undefined) {
      mediaEntry.accessControlId = preset.accessControlId;
    }
    if (preset.description !== undefined) {
      mediaEntry.description = preset.description;
    }

    // Update entry metadata if any fields were set
    if (Object.keys(mediaEntry).length > 1) {
      await this.client.request<KalturaMediaEntry>({
        service: "media",
        action: "update",
        params: { entryId, mediaEntry },
      });
    }

    // Assign categories if specified
    if (preset.categoryIds && preset.categoryIds.length > 0) {
      await this.publishToCategories(entryId, preset.categoryIds);
    }

    log.info("Preset applied", { entryId, preset: preset.name });
  }
}
