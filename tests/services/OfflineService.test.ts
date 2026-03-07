import { OfflineService } from "../../src/services/OfflineService";
import { KalturaMediaEntry, KalturaMediaType, KalturaEntryStatus } from "../../src/types/kaltura";

const mockEntry = (id: string, name: string): KalturaMediaEntry => ({
  objectType: "KalturaMediaEntry",
  id,
  name,
  partnerId: 12345,
  status: KalturaEntryStatus.READY,
  mediaType: KalturaMediaType.VIDEO,
  duration: 60,
  createdAt: 1700000000,
  updatedAt: 1700000000,
});

describe("OfflineService", () => {
  let service: OfflineService;

  beforeEach(() => {
    localStorage.clear();
    service = new OfflineService(50, 10);
  });

  describe("caching", () => {
    it("caches and retrieves an entry", () => {
      const entry = mockEntry("0_abc", "Test Video");
      service.cacheEntry(entry);

      expect(service.isCached("0_abc")).toBe(true);
      const cached = service.getCachedEntry("0_abc");
      expect(cached).not.toBeNull();
      expect(cached!.entry.name).toBe("Test Video");
    });

    it("caches multiple entries", () => {
      const entries = [mockEntry("0_a", "A"), mockEntry("0_b", "B"), mockEntry("0_c", "C")];
      service.cacheEntries(entries);

      expect(service.getCachedEntries()).toHaveLength(3);
      expect(service.isCached("0_a")).toBe(true);
      expect(service.isCached("0_b")).toBe(true);
    });

    it("returns cached entries sorted by lastAccessed", () => {
      service.cacheEntry(mockEntry("0_a", "A"));
      service.cacheEntry(mockEntry("0_b", "B"));

      // Access 0_a more recently
      service.getCachedEntry("0_a");

      const all = service.getCachedEntries();
      expect(all[0].entry.id).toBe("0_a");
    });

    it("removes entry from cache", () => {
      service.cacheEntry(mockEntry("0_abc", "Test"));
      expect(service.isCached("0_abc")).toBe(true);

      service.removeFromCache("0_abc");
      expect(service.isCached("0_abc")).toBe(false);
    });

    it("clears all cached entries", () => {
      service.cacheEntries([mockEntry("0_a", "A"), mockEntry("0_b", "B")]);
      expect(service.getCachedEntries()).toHaveLength(2);

      service.clearCache();
      expect(service.getCachedEntries()).toHaveLength(0);
    });

    it("evicts LRU entries when cache exceeds max", () => {
      // Max is 10 entries
      for (let i = 0; i < 15; i++) {
        service.cacheEntry(mockEntry(`0_${i}`, `Entry ${i}`));
      }

      expect(service.getCachedEntries().length).toBeLessThanOrEqual(10);
      // Earliest entries should be evicted
      expect(service.isCached("0_0")).toBe(false);
      // Latest entries should still be cached
      expect(service.isCached("0_14")).toBe(true);
    });

    it("caches thumbnail data URL", () => {
      service.cacheEntry(mockEntry("0_abc", "Test"), "data:image/png;base64,abc123");

      expect(service.getCachedThumbnail("0_abc")).toBe("data:image/png;base64,abc123");
    });

    it("returns null for uncached thumbnail", () => {
      expect(service.getCachedThumbnail("nonexistent")).toBeNull();
    });
  });

  describe("operation queue", () => {
    it("queues operations", () => {
      const id = service.queueOperation("publish", "0_abc", { name: "Test" });

      expect(id).toBeTruthy();
      expect(service.getPendingOperations()).toHaveLength(1);
      expect(service.getPendingOperations()[0].type).toBe("publish");
    });

    it("removes operations", () => {
      const id = service.queueOperation("publish", "0_abc", {});
      service.removeOperation(id);

      expect(service.getPendingOperations()).toHaveLength(0);
    });

    it("clears operation queue", () => {
      service.queueOperation("publish", "0_a", {});
      service.queueOperation("delete", "0_b", {});

      service.clearQueue();
      expect(service.getPendingOperations()).toHaveLength(0);
    });

    it("processes queued operations", async () => {
      service.queueOperation("publish", "0_a", {});
      service.queueOperation("update_metadata", "0_b", {});

      const result = await service.processQueue(async () => true);

      expect(result.processed).toBe(2);
      expect(result.failed).toBe(0);
      expect(service.getPendingOperations()).toHaveLength(0);
    });

    it("retries failed operations up to 3 times", async () => {
      service.queueOperation("publish", "0_a", {});

      // Fail 3 times
      await service.processQueue(async () => false);
      await service.processQueue(async () => false);
      const result = await service.processQueue(async () => false);

      expect(result.failed).toBe(1);
      expect(service.getPendingOperations()).toHaveLength(0);
    });
  });

  describe("sync status", () => {
    it("returns sync status", () => {
      service.cacheEntries([mockEntry("0_a", "A"), mockEntry("0_b", "B")]);
      service.queueOperation("publish", "0_a", {});

      const status = service.getSyncStatus();

      expect(status.cacheEntryCount).toBe(2);
      expect(status.pendingOperations).toBe(1);
    });
  });

  describe("persistence", () => {
    it("persists and restores cache from localStorage", () => {
      service.cacheEntry(mockEntry("0_abc", "Test Video"));

      // Create new instance — should load from storage
      const service2 = new OfflineService(50, 10);
      expect(service2.isCached("0_abc")).toBe(true);
    });

    it("persists and restores queue from localStorage", () => {
      service.queueOperation("publish", "0_abc", { name: "Test" });

      const service2 = new OfflineService(50, 10);
      expect(service2.getPendingOperations()).toHaveLength(1);
    });
  });

  describe("network status", () => {
    it("returns online by default (jsdom)", () => {
      expect(service.getIsOnline()).toBe(true);
    });

    it("allows subscribing to status changes", () => {
      const listener = jest.fn();
      const unsubscribe = service.onStatusChange(listener);

      // Simulate going offline
      window.dispatchEvent(new Event("offline"));
      expect(listener).toHaveBeenCalledWith(false);

      // Simulate coming online
      window.dispatchEvent(new Event("online"));
      expect(listener).toHaveBeenCalledWith(true);

      unsubscribe();
      window.dispatchEvent(new Event("offline"));
      expect(listener).toHaveBeenCalledTimes(2); // Not called again after unsubscribe
    });
  });
});
