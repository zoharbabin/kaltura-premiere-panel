import { KalturaMediaEntry } from "../types/kaltura";
import { createLogger } from "../utils/logger";

const log = createLogger("OfflineService");

const CACHE_KEY = "kaltura_offline_cache";
const QUEUE_KEY = "kaltura_offline_queue";
const THUMBNAIL_CACHE_KEY = "kaltura_offline_thumbnails";
const DEFAULT_MAX_CACHE_ENTRIES = 200;
const DEFAULT_MAX_CACHE_SIZE_MB = 50;

/** Cached entry with metadata */
export interface OfflineCachedEntry {
  entry: KalturaMediaEntry;
  cachedAt: number;
  thumbnailDataUrl?: string;
  lastAccessed: number;
}

/** Queued operation for sync when online */
export interface QueuedOperation {
  id: string;
  type: "publish" | "update_metadata" | "caption_order" | "delete";
  entryId?: string;
  payload: Record<string, unknown>;
  queuedAt: number;
  retryCount: number;
}

/** Sync status summary */
export interface SyncStatus {
  isOnline: boolean;
  pendingOperations: number;
  lastSyncAt: number | null;
  cacheEntryCount: number;
  cacheSizeMB: number;
}

/**
 * Manages offline caching and operation queuing for disconnected workflows.
 * Stores entry metadata and thumbnails in localStorage with LRU eviction.
 * Queues operations when offline and syncs when connection restores.
 */
export class OfflineService {
  private cache: Map<string, OfflineCachedEntry> = new Map();
  private queue: QueuedOperation[] = [];
  private thumbnailCache: Map<string, string> = new Map();
  private isOnline = true;
  private maxCacheEntries: number;
  private lastSyncAt: number | null = null;
  private onlineListeners: Array<(online: boolean) => void> = [];

  constructor(
    private maxCacheSizeMB: number = DEFAULT_MAX_CACHE_SIZE_MB,
    maxEntries: number = DEFAULT_MAX_CACHE_ENTRIES,
  ) {
    this.maxCacheEntries = maxEntries;
    this.loadFromStorage();
    this.setupNetworkListeners();
  }

  /** Get current online/offline status */
  getIsOnline(): boolean {
    return this.isOnline;
  }

  /** Subscribe to online status changes */
  onStatusChange(listener: (online: boolean) => void): () => void {
    this.onlineListeners.push(listener);
    return () => {
      this.onlineListeners = this.onlineListeners.filter((l) => l !== listener);
    };
  }

  /** Cache an entry's metadata for offline access */
  cacheEntry(entry: KalturaMediaEntry, thumbnailDataUrl?: string): void {
    const now = Date.now();
    this.cache.set(entry.id, {
      entry,
      cachedAt: now,
      thumbnailDataUrl,
      lastAccessed: now,
    });

    if (thumbnailDataUrl) {
      this.thumbnailCache.set(entry.id, thumbnailDataUrl);
    }

    this.evictIfNeeded();
    this.persistCache();
    log.debug("Cached entry", { entryId: entry.id });
  }

  /** Cache multiple entries at once */
  cacheEntries(entries: KalturaMediaEntry[]): void {
    const now = Date.now();
    for (const entry of entries) {
      this.cache.set(entry.id, {
        entry,
        cachedAt: now,
        lastAccessed: now,
      });
    }
    this.evictIfNeeded();
    this.persistCache();
    log.debug("Cached entries", { count: entries.length });
  }

  /** Get a cached entry (updates lastAccessed for LRU) */
  getCachedEntry(entryId: string): OfflineCachedEntry | null {
    const cached = this.cache.get(entryId);
    if (!cached) return null;
    cached.lastAccessed = Date.now();
    return cached;
  }

  /** Get all cached entries sorted by lastAccessed (most recent first) */
  getCachedEntries(): OfflineCachedEntry[] {
    return Array.from(this.cache.values()).sort((a, b) => b.lastAccessed - a.lastAccessed);
  }

  /** Check if an entry is cached */
  isCached(entryId: string): boolean {
    return this.cache.has(entryId);
  }

  /** Get cached thumbnail data URL */
  getCachedThumbnail(entryId: string): string | null {
    return this.thumbnailCache.get(entryId) ?? null;
  }

  /** Remove a specific entry from cache */
  removeFromCache(entryId: string): void {
    this.cache.delete(entryId);
    this.thumbnailCache.delete(entryId);
    this.persistCache();
  }

  /** Clear all cached entries */
  clearCache(): void {
    this.cache.clear();
    this.thumbnailCache.clear();
    this.persistCache();
    log.info("Offline cache cleared");
  }

  // ---------------------------------------------------------------------------
  // Operation queue
  // ---------------------------------------------------------------------------

  /** Queue an operation for later sync */
  queueOperation(
    type: QueuedOperation["type"],
    entryId: string | undefined,
    payload: Record<string, unknown>,
  ): string {
    const id = `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const op: QueuedOperation = {
      id,
      type,
      entryId,
      payload,
      queuedAt: Date.now(),
      retryCount: 0,
    };
    this.queue.push(op);
    this.persistQueue();
    log.info("Queued operation", { id, type, entryId });
    return id;
  }

  /** Get all pending queued operations */
  getPendingOperations(): QueuedOperation[] {
    return [...this.queue];
  }

  /** Remove a completed operation from the queue */
  removeOperation(operationId: string): void {
    this.queue = this.queue.filter((op) => op.id !== operationId);
    this.persistQueue();
  }

  /** Clear all queued operations */
  clearQueue(): void {
    this.queue = [];
    this.persistQueue();
    log.info("Operation queue cleared");
  }

  /** Process queued operations (called when coming back online) */
  async processQueue(
    executor: (op: QueuedOperation) => Promise<boolean>,
  ): Promise<{ processed: number; failed: number }> {
    if (this.queue.length === 0) return { processed: 0, failed: 0 };

    log.info("Processing queued operations", { count: this.queue.length });

    let processed = 0;
    let failed = 0;
    const remaining: QueuedOperation[] = [];

    for (const op of this.queue) {
      try {
        const success = await executor(op);
        if (success) {
          processed++;
        } else {
          op.retryCount++;
          if (op.retryCount < 3) {
            remaining.push(op);
          } else {
            failed++;
            log.warn("Operation exceeded max retries", { id: op.id, type: op.type });
          }
        }
      } catch {
        op.retryCount++;
        if (op.retryCount < 3) {
          remaining.push(op);
        } else {
          failed++;
        }
      }
    }

    this.queue = remaining;
    this.lastSyncAt = Date.now();
    this.persistQueue();

    log.info("Queue processing complete", { processed, failed, remaining: remaining.length });
    return { processed, failed };
  }

  // ---------------------------------------------------------------------------
  // Sync status
  // ---------------------------------------------------------------------------

  /** Get current sync status summary */
  getSyncStatus(): SyncStatus {
    const cacheSize = this.estimateCacheSize();
    return {
      isOnline: this.isOnline,
      pendingOperations: this.queue.length,
      lastSyncAt: this.lastSyncAt,
      cacheEntryCount: this.cache.size,
      cacheSizeMB: Math.round((cacheSize / (1024 * 1024)) * 100) / 100,
    };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private setupNetworkListeners(): void {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        this.isOnline = true;
        log.info("Network restored");
        this.onlineListeners.forEach((l) => l(true));
      });
      window.addEventListener("offline", () => {
        this.isOnline = false;
        log.info("Network lost — entering offline mode");
        this.onlineListeners.forEach((l) => l(false));
      });
      this.isOnline = navigator.onLine !== false;
    }
  }

  private evictIfNeeded(): void {
    while (this.cache.size > this.maxCacheEntries) {
      // Find LRU entry
      let oldestKey: string | null = null;
      let oldestAccess = Infinity;
      for (const [key, cached] of this.cache) {
        if (cached.lastAccessed < oldestAccess) {
          oldestAccess = cached.lastAccessed;
          oldestKey = key;
        }
      }
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.thumbnailCache.delete(oldestKey);
        log.debug("Evicted LRU entry", { entryId: oldestKey });
      } else {
        break;
      }
    }
  }

  private estimateCacheSize(): number {
    try {
      const cacheStr = JSON.stringify(Array.from(this.cache.values()));
      const thumbStr = JSON.stringify(Array.from(this.thumbnailCache.entries()));
      return (cacheStr.length + thumbStr.length) * 2; // Rough UTF-16 estimate
    } catch {
      return 0;
    }
  }

  private loadFromStorage(): void {
    try {
      const cacheStr = localStorage.getItem(CACHE_KEY);
      if (cacheStr) {
        const entries: OfflineCachedEntry[] = JSON.parse(cacheStr);
        for (const entry of entries) {
          this.cache.set(entry.entry.id, entry);
        }
      }

      const thumbStr = localStorage.getItem(THUMBNAIL_CACHE_KEY);
      if (thumbStr) {
        const thumbs: [string, string][] = JSON.parse(thumbStr);
        for (const [id, dataUrl] of thumbs) {
          this.thumbnailCache.set(id, dataUrl);
        }
      }

      const queueStr = localStorage.getItem(QUEUE_KEY);
      if (queueStr) {
        this.queue = JSON.parse(queueStr);
      }

      log.debug("Loaded offline storage", {
        entries: this.cache.size,
        thumbnails: this.thumbnailCache.size,
        queuedOps: this.queue.length,
      });
    } catch {
      log.debug("No existing offline storage found");
    }
  }

  private persistCache(): void {
    try {
      const entries = Array.from(this.cache.values());
      localStorage.setItem(CACHE_KEY, JSON.stringify(entries));

      const thumbs = Array.from(this.thumbnailCache.entries());
      localStorage.setItem(THUMBNAIL_CACHE_KEY, JSON.stringify(thumbs));
    } catch {
      log.warn("Failed to persist offline cache — storage may be full");
    }
  }

  private persistQueue(): void {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    } catch {
      log.warn("Failed to persist operation queue");
    }
  }
}
