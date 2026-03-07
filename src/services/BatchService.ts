import { KalturaClient } from "./KalturaClient";
import { MediaService } from "./MediaService";
import { CaptionService } from "./CaptionService";
import { KalturaMediaEntry, KalturaListResponse } from "../types/kaltura";
import { createLogger } from "../utils/logger";

const log = createLogger("BatchService");

/** Metadata fields to update for a single entry */
export interface MetadataUpdate {
  entryId: string;
  name?: string;
  description?: string;
  tags?: string;
}

/** Result summary for batch operations */
export interface BatchResult {
  total: number;
  successful: number;
  failed: { entryId: string; error: string }[];
}

/** Locally cached entry metadata */
export interface CachedEntry {
  entry: KalturaMediaEntry;
  cachedAt: number;
}

/** Audit trail entry */
export interface AuditEntry {
  id: string;
  action: string;
  entryId: string;
  userId: string;
  description: string;
  createdAt: number;
}

const CACHE_STORAGE_KEY = "kaltura_batch_cache";

/**
 * Batch operations for bulk management of Kaltura entries:
 * metadata updates, category publishing, REACH captioning, and deletion.
 * Also provides offline caching and enterprise governance features.
 */
export class BatchService {
  private cache: Map<string, CachedEntry> = new Map();

  constructor(
    private client: KalturaClient,
    private mediaService: MediaService,
    private captionService: CaptionService,
  ) {
    this.loadCacheFromStorage();
  }

  // ---------------------------------------------------------------------------
  // Batch operations (#32)
  // ---------------------------------------------------------------------------

  /** Update metadata for multiple entries using multiRequest */
  async batchUpdateMetadata(updates: MetadataUpdate[]): Promise<BatchResult> {
    log.info("Batch metadata update", { count: updates.length });

    const result: BatchResult = { total: updates.length, successful: 0, failed: [] };

    const requests = updates.map((update) => {
      const mediaEntry: Record<string, unknown> = {
        objectType: "KalturaMediaEntry",
      };
      if (update.name !== undefined) mediaEntry.name = update.name;
      if (update.description !== undefined) mediaEntry.description = update.description;
      if (update.tags !== undefined) mediaEntry.tags = update.tags;

      return {
        service: "media",
        action: "update",
        params: {
          entryId: update.entryId,
          mediaEntry,
        },
      };
    });

    try {
      const responses = await this.client.multiRequest<KalturaMediaEntry[]>(requests);
      for (let i = 0; i < responses.length; i++) {
        const entry = responses[i];
        if (entry?.objectType === "KalturaAPIException") {
          const err = entry as unknown as { message: string };
          result.failed.push({ entryId: updates[i].entryId, error: err.message });
        } else {
          result.successful++;
        }
      }
    } catch (error) {
      log.error("Batch metadata update failed", error);
      for (const update of updates) {
        result.failed.push({
          entryId: update.entryId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    log.info("Batch metadata update complete", {
      successful: result.successful,
      failed: result.failed.length,
    });
    return result;
  }

  /** Add multiple entries to a category using multiRequest */
  async batchPublishToCategory(entryIds: string[], categoryId: number): Promise<BatchResult> {
    log.info("Batch publish to category", { count: entryIds.length, categoryId });

    const result: BatchResult = { total: entryIds.length, successful: 0, failed: [] };

    const requests = entryIds.map((entryId) => ({
      service: "categoryEntry",
      action: "add",
      params: {
        categoryEntry: {
          objectType: "KalturaCategoryEntry",
          entryId,
          categoryId,
        },
      },
    }));

    try {
      const responses = await this.client.multiRequest(requests);
      for (let i = 0; i < responses.length; i++) {
        const resp = responses[i];
        if (resp?.objectType === "KalturaAPIException") {
          const err = resp as unknown as { message: string };
          result.failed.push({ entryId: entryIds[i], error: err.message });
        } else {
          result.successful++;
        }
      }
    } catch (error) {
      log.error("Batch publish failed", error);
      for (const entryId of entryIds) {
        result.failed.push({
          entryId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    log.info("Batch publish complete", {
      successful: result.successful,
      failed: result.failed.length,
    });
    return result;
  }

  /** Trigger REACH captioning for multiple entries using multiRequest */
  async batchOrderCaptioning(
    entryIds: string[],
    catalogItemId: number,
    sourceLanguage: string,
  ): Promise<BatchResult> {
    log.info("Batch order captioning", { count: entryIds.length, catalogItemId, sourceLanguage });

    const result: BatchResult = { total: entryIds.length, successful: 0, failed: [] };

    const requests = entryIds.map((entryId) => ({
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
    }));

    try {
      const responses = await this.client.multiRequest(requests);
      for (let i = 0; i < responses.length; i++) {
        const resp = responses[i];
        if (resp?.objectType === "KalturaAPIException") {
          const err = resp as unknown as { message: string };
          result.failed.push({ entryId: entryIds[i], error: err.message });
        } else {
          result.successful++;
        }
      }
    } catch (error) {
      log.error("Batch captioning order failed", error);
      for (const entryId of entryIds) {
        result.failed.push({
          entryId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    log.info("Batch captioning order complete", {
      successful: result.successful,
      failed: result.failed.length,
    });
    return result;
  }

  /** Soft-delete multiple entries using multiRequest */
  async batchDelete(entryIds: string[]): Promise<BatchResult> {
    log.info("Batch delete", { count: entryIds.length });

    const result: BatchResult = { total: entryIds.length, successful: 0, failed: [] };

    const requests = entryIds.map((entryId) => ({
      service: "media",
      action: "delete",
      params: { entryId },
    }));

    try {
      const responses = await this.client.multiRequest(requests);
      for (let i = 0; i < responses.length; i++) {
        const resp = responses[i];
        if (resp?.objectType === "KalturaAPIException") {
          const err = resp as unknown as { message: string };
          result.failed.push({ entryId: entryIds[i], error: err.message });
        } else {
          result.successful++;
        }
      }
    } catch (error) {
      log.error("Batch delete failed", error);
      for (const entryId of entryIds) {
        result.failed.push({
          entryId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    log.info("Batch delete complete", {
      successful: result.successful,
      failed: result.failed.length,
    });
    return result;
  }

  // ---------------------------------------------------------------------------
  // Offline caching (#35)
  // ---------------------------------------------------------------------------

  /** Get list of locally cached entry metadata */
  getCachedEntries(): CachedEntry[] {
    return Array.from(this.cache.values());
  }

  /** Cache entry metadata for offline access */
  cacheEntryMetadata(entry: KalturaMediaEntry): void {
    this.cache.set(entry.id, { entry, cachedAt: Date.now() });
    this.persistCache();
    log.debug("Cached entry metadata", { entryId: entry.id });
  }

  /** Clear all cached entries */
  clearCache(): void {
    this.cache.clear();
    this.persistCache();
    log.info("Cache cleared");
  }

  // ---------------------------------------------------------------------------
  // Enterprise governance (#34)
  // ---------------------------------------------------------------------------

  /** Block entry from deletion by setting admin tags */
  async setContentHold(entryId: string, reason: string): Promise<KalturaMediaEntry> {
    log.info("Setting content hold", { entryId, reason });

    return this.client.request<KalturaMediaEntry>({
      service: "media",
      action: "update",
      params: {
        entryId,
        mediaEntry: {
          objectType: "KalturaMediaEntry",
          adminTags: `content_hold,hold_reason:${reason}`,
        },
      },
    });
  }

  /** Remove content hold from an entry */
  async removeContentHold(entryId: string): Promise<KalturaMediaEntry> {
    log.info("Removing content hold", { entryId });

    return this.client.request<KalturaMediaEntry>({
      service: "media",
      action: "update",
      params: {
        entryId,
        mediaEntry: {
          objectType: "KalturaMediaEntry",
          adminTags: "",
        },
      },
    });
  }

  /** Fetch audit trail for an entry */
  async getAuditTrail(entryId: string): Promise<AuditEntry[]> {
    log.debug("Fetching audit trail", { entryId });

    try {
      const response = await this.client.request<
        KalturaListResponse<{
          id: string;
          action: string;
          entryId: string;
          userId: string;
          description: string;
          createdAt: number;
          objectType?: string;
        }>
      >({
        service: "auditTrail",
        action: "list",
        params: {
          filter: {
            objectType: "KalturaAuditTrailFilter",
            entryIdEqual: entryId,
            orderBy: "-createdAt",
          },
        },
      });

      return (response.objects || []).map((item) => ({
        id: item.id,
        action: item.action,
        entryId: item.entryId,
        userId: item.userId,
        description: item.description,
        createdAt: item.createdAt,
      }));
    } catch (error) {
      log.warn("Audit trail not available", error);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private loadCacheFromStorage(): void {
    try {
      const stored = localStorage.getItem(CACHE_STORAGE_KEY);
      if (stored) {
        const entries: CachedEntry[] = JSON.parse(stored);
        for (const cached of entries) {
          this.cache.set(cached.entry.id, cached);
        }
        log.debug("Loaded cache from storage", { count: this.cache.size });
      }
    } catch {
      log.debug("No existing cache found");
    }
  }

  private persistCache(): void {
    try {
      const entries = Array.from(this.cache.values());
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(entries));
    } catch {
      log.warn("Failed to persist cache to storage");
    }
  }
}
