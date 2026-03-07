import { BatchService } from "../../src/services/BatchService";
import { KalturaClient } from "../../src/services/KalturaClient";
import { MediaService } from "../../src/services/MediaService";
import { CaptionService } from "../../src/services/CaptionService";

const mockRequest = jest.fn();
const mockMultiRequest = jest.fn();
const client = {
  request: mockRequest,
  multiRequest: mockMultiRequest,
} as unknown as KalturaClient;

const mediaService = {} as unknown as MediaService;
const captionService = {
  triggerCaptioning: jest.fn(),
} as unknown as CaptionService;

describe("BatchService", () => {
  let service: BatchService;

  beforeEach(() => {
    service = new BatchService(client, mediaService, captionService);
    jest.clearAllMocks();
  });

  describe("batchUpdateMetadata()", () => {
    it("updates metadata for multiple entries via multiRequest", async () => {
      mockMultiRequest.mockResolvedValue([{ id: "0_a" }, { id: "0_b" }]);

      const result = await service.batchUpdateMetadata([
        { entryId: "0_a", name: "Updated A" },
        { entryId: "0_b", tags: "new,tags" },
      ]);

      expect(result.total).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toEqual([]);
      expect(mockMultiRequest).toHaveBeenCalled();
    });

    it("handles multiRequest failure", async () => {
      mockMultiRequest.mockRejectedValue(new Error("API error"));

      const result = await service.batchUpdateMetadata([{ entryId: "0_a", name: "Test" }]);
      expect(result.successful).toBe(0);
      expect(result.failed).toHaveLength(1);
    });
  });

  describe("batchPublishToCategory()", () => {
    it("adds multiple entries to a category via multiRequest", async () => {
      mockMultiRequest.mockResolvedValue([{}, {}, {}]);

      const result = await service.batchPublishToCategory(["0_a", "0_b", "0_c"], 42);
      expect(result.total).toBe(3);
      expect(result.successful).toBe(3);
    });

    it("tracks per-entry API exception failures", async () => {
      mockMultiRequest.mockResolvedValue([
        { id: "ok" },
        { objectType: "KalturaAPIException", message: "Duplicate" },
        { id: "ok2" },
      ]);

      const result = await service.batchPublishToCategory(["0_a", "0_b", "0_c"], 42);
      expect(result.successful).toBe(2);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].entryId).toBe("0_b");
    });
  });

  describe("batchOrderCaptioning()", () => {
    it("triggers captioning for multiple entries via multiRequest", async () => {
      mockMultiRequest.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      const result = await service.batchOrderCaptioning(["0_a", "0_b"], 42, "en");
      expect(result.total).toBe(2);
      expect(result.successful).toBe(2);
    });
  });

  describe("batchDelete()", () => {
    it("deletes multiple entries via multiRequest", async () => {
      mockMultiRequest.mockResolvedValue([{}, {}]);

      const result = await service.batchDelete(["0_a", "0_b"]);
      expect(result.total).toBe(2);
      expect(result.successful).toBe(2);
    });
  });

  describe("offline cache", () => {
    it("caches and retrieves entry metadata", () => {
      const entry = { id: "0_abc", name: "Test" } as any;
      service.cacheEntryMetadata(entry);

      const cached = service.getCachedEntries();
      expect(cached).toHaveLength(1);
      expect(cached[0].entry.id).toBe("0_abc");
    });

    it("clears cache", () => {
      const entry = { id: "0_abc", name: "Test" } as any;
      service.cacheEntryMetadata(entry);
      service.clearCache();
      expect(service.getCachedEntries()).toHaveLength(0);
    });
  });

  describe("enterprise governance", () => {
    it("sets content hold", async () => {
      mockRequest.mockResolvedValue({ id: "0_abc" });

      await service.setContentHold("0_abc", "Legal review");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          service: "media",
          action: "update",
        }),
      );
    });

    it("removes content hold", async () => {
      mockRequest.mockResolvedValue({ id: "0_abc" });

      await service.removeContentHold("0_abc");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          service: "media",
          action: "update",
        }),
      );
    });

    it("gets audit trail", async () => {
      mockRequest.mockResolvedValue({
        objects: [{ id: "audit1", action: "ENTRY_CREATED", entryId: "0_abc", userId: "user1" }],
        totalCount: 1,
      });

      const trail = await service.getAuditTrail("0_abc");
      expect(trail).toHaveLength(1);
      expect(trail[0].action).toBe("ENTRY_CREATED");
    });
  });
});
