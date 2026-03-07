import { PublishWorkflowService } from "../../src/services/PublishWorkflowService";
import { KalturaClient } from "../../src/services/KalturaClient";
import { MediaService } from "../../src/services/MediaService";
import { KalturaModerationStatus } from "../../src/types/kaltura";

const mockRequest = jest.fn();
const client = {
  request: mockRequest,
} as unknown as KalturaClient;

const mediaService = {
  get: jest.fn(),
} as unknown as MediaService;

describe("PublishWorkflowService", () => {
  let service: PublishWorkflowService;

  beforeEach(() => {
    service = new PublishWorkflowService(client, mediaService);
    jest.clearAllMocks();
  });

  describe("publishToCategories()", () => {
    it("assigns entry to multiple categories", async () => {
      mockRequest.mockResolvedValue({});

      const result = await service.publishToCategories("0_abc", [1, 2, 3]);
      expect(result.successful).toEqual([1, 2, 3]);
      expect(result.failed).toEqual([]);
      expect(mockRequest).toHaveBeenCalledTimes(3);
    });

    it("tracks failures per category", async () => {
      mockRequest
        .mockResolvedValueOnce({}) // category 1 succeeds
        .mockRejectedValueOnce(new Error("Permission denied")) // category 2 fails
        .mockResolvedValueOnce({}); // category 3 succeeds

      const result = await service.publishToCategories("0_abc", [1, 2, 3]);
      expect(result.successful).toEqual([1, 3]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].categoryId).toBe(2);
      expect(result.failed[0].error).toContain("Permission denied");
    });
  });

  describe("getModerationStatus()", () => {
    it("returns moderation status from entry", async () => {
      (mediaService.get as jest.Mock).mockResolvedValue({
        id: "0_abc",
        moderationStatus: KalturaModerationStatus.PENDING,
      });

      const status = await service.getModerationStatus("0_abc");
      expect(status).toBe(KalturaModerationStatus.PENDING);
    });

    it("defaults to AUTO_APPROVED when not set", async () => {
      (mediaService.get as jest.Mock).mockResolvedValue({ id: "0_abc" });

      const status = await service.getModerationStatus("0_abc");
      expect(status).toBe(KalturaModerationStatus.AUTO_APPROVED);
    });
  });

  describe("submitForApproval()", () => {
    it("sets moderation status to PENDING", async () => {
      mockRequest.mockResolvedValue({
        id: "0_abc",
        moderationStatus: KalturaModerationStatus.PENDING,
      });

      await service.submitForApproval("0_abc");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          service: "media",
          action: "update",
          params: expect.objectContaining({
            mediaEntry: expect.objectContaining({
              moderationStatus: KalturaModerationStatus.PENDING,
            }),
          }),
        }),
      );
    });
  });

  describe("approve()", () => {
    it("sets moderation status to APPROVED", async () => {
      mockRequest.mockResolvedValue({
        id: "0_abc",
        moderationStatus: KalturaModerationStatus.APPROVED,
      });

      const result = await service.approve("0_abc");
      expect(result.moderationStatus).toBe(KalturaModerationStatus.APPROVED);
    });
  });

  describe("reject()", () => {
    it("sets moderation status to REJECTED", async () => {
      mockRequest.mockResolvedValue({
        id: "0_abc",
        moderationStatus: KalturaModerationStatus.REJECTED,
      });

      await service.reject("0_abc", "Poor quality");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            mediaEntry: expect.objectContaining({
              moderationStatus: KalturaModerationStatus.REJECTED,
            }),
          }),
        }),
      );
    });
  });

  describe("listVersions()", () => {
    it("returns version history for an entry", async () => {
      mockRequest.mockResolvedValue({
        objects: [
          { id: "0_v1", createdAt: 1000, userId: "user1" },
          { id: "0_v2", createdAt: 2000, userId: "user2" },
        ],
        totalCount: 2,
      });

      const versions = await service.listVersions("0_abc");
      expect(versions).toHaveLength(2);
      expect(versions[0].version).toBe(1);
      expect(versions[1].version).toBe(2);
    });
  });

  describe("replaceEntry()", () => {
    it("replaces entry content with new upload token", async () => {
      mockRequest.mockResolvedValue({ id: "0_abc" });

      await service.replaceEntry("0_abc", "token_123");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          service: "media",
          action: "updateContent",
          params: expect.objectContaining({
            entryId: "0_abc",
            resource: expect.objectContaining({
              objectType: "KalturaUploadedFileTokenResource",
              token: "token_123",
            }),
          }),
        }),
      );
    });
  });

  describe("schedulePublish()", () => {
    it("sets start date", async () => {
      mockRequest.mockResolvedValue({ id: "0_abc", startDate: 1700000000 });

      await service.schedulePublish("0_abc", 1700000000);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            mediaEntry: expect.objectContaining({ startDate: 1700000000 }),
          }),
        }),
      );
    });

    it("sets both start and end dates", async () => {
      mockRequest.mockResolvedValue({ id: "0_abc" });

      await service.schedulePublish("0_abc", 1700000000, 1700100000);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            mediaEntry: expect.objectContaining({
              startDate: 1700000000,
              endDate: 1700100000,
            }),
          }),
        }),
      );
    });
  });

  describe("cancelSchedule()", () => {
    it("clears scheduling dates", async () => {
      mockRequest.mockResolvedValue({ id: "0_abc" });

      await service.cancelSchedule("0_abc");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            mediaEntry: expect.objectContaining({ startDate: -1, endDate: -1 }),
          }),
        }),
      );
    });
  });

  describe("applyPreset()", () => {
    it("applies tags and categories from preset", async () => {
      mockRequest.mockResolvedValue({});

      await service.applyPreset("0_abc", {
        name: "Standard",
        tags: ["marketing", "promo"],
        categoryIds: [10, 20],
      });

      // Should update entry metadata
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          service: "media",
          action: "update",
          params: expect.objectContaining({
            mediaEntry: expect.objectContaining({ tags: "marketing,promo" }),
          }),
        }),
      );
      // Should also assign categories (2 calls)
      expect(mockRequest).toHaveBeenCalledTimes(3); // 1 update + 2 category adds
    });

    it("skips update when no metadata fields set", async () => {
      mockRequest.mockResolvedValue({});

      await service.applyPreset("0_abc", {
        name: "Categories Only",
        categoryIds: [10],
      });

      // Should only call categoryEntry.add, not media.update
      expect(mockRequest).toHaveBeenCalledTimes(1);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({ service: "categoryEntry" }),
      );
    });
  });
});
