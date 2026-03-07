import { ReviewService } from "../../src/services/ReviewService";
import { KalturaClient } from "../../src/services/KalturaClient";
import { PremiereService } from "../../src/services/PremiereService";

const mockRequest = jest.fn();
const client = {
  request: mockRequest,
} as unknown as KalturaClient;

const premiereService = {
  addMarkers: jest.fn().mockResolvedValue(undefined),
  getMarkers: jest.fn().mockResolvedValue([]),
} as unknown as PremiereService;

describe("ReviewService", () => {
  let service: ReviewService;

  beforeEach(() => {
    service = new ReviewService(client, premiereService);
    jest.clearAllMocks();
  });

  describe("listAnnotations()", () => {
    it("returns annotations for an entry", async () => {
      const annotations = [{ id: "ann1", entryId: "0_abc", text: "Great shot", startTime: 10 }];
      mockRequest.mockResolvedValue({ objects: annotations, totalCount: 1 });

      const result = await service.listAnnotations("0_abc");
      expect(result).toEqual(annotations);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          service: "annotation_annotation",
          action: "list",
        }),
      );
    });

    it("filters by parentId for thread replies", async () => {
      mockRequest.mockResolvedValue({ objects: [], totalCount: 0 });

      await service.listAnnotations("0_abc", "ann1");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            filter: expect.objectContaining({
              parentIdEqual: "ann1",
            }),
          }),
        }),
      );
    });
  });

  describe("addAnnotation()", () => {
    it("creates a root annotation", async () => {
      const annotation = { id: "ann_new", text: "Comment", startTime: 5 };
      mockRequest.mockResolvedValue(annotation);

      const result = await service.addAnnotation("0_abc", "Comment", 5);
      expect(result).toEqual(annotation);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          service: "annotation_annotation",
          action: "add",
          params: expect.objectContaining({
            annotation: expect.objectContaining({
              entryId: "0_abc",
              text: "Comment",
              startTime: 5,
              isPublic: true,
            }),
          }),
        }),
      );
    });

    it("creates a reply with parentId", async () => {
      mockRequest.mockResolvedValue({ id: "ann_reply" });

      await service.addAnnotation("0_abc", "Reply text", 0, undefined, "ann_parent");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            annotation: expect.objectContaining({
              parentId: "ann_parent",
            }),
          }),
        }),
      );
    });

    it("includes endTime when provided", async () => {
      mockRequest.mockResolvedValue({ id: "ann_with_end" });

      await service.addAnnotation("0_abc", "Segment comment", 10, 20);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            annotation: expect.objectContaining({
              startTime: 10,
              endTime: 20,
            }),
          }),
        }),
      );
    });
  });

  describe("updateAnnotation()", () => {
    it("updates annotation text", async () => {
      mockRequest.mockResolvedValue({ id: "ann1", text: "Updated" });

      const result = await service.updateAnnotation("ann1", "Updated");
      expect(result.text).toBe("Updated");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          service: "annotation_annotation",
          action: "update",
          params: expect.objectContaining({
            id: "ann1",
            annotation: expect.objectContaining({ text: "Updated" }),
          }),
        }),
      );
    });
  });

  describe("deleteAnnotation()", () => {
    it("deletes an annotation", async () => {
      mockRequest.mockResolvedValue({});

      await service.deleteAnnotation("ann1");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          service: "annotation_annotation",
          action: "delete",
          params: { id: "ann1" },
        }),
      );
    });
  });

  describe("getThread()", () => {
    it("returns root annotation with replies", async () => {
      const root = { id: "ann1", entryId: "0_abc", text: "Root", startTime: 5 };
      const replies = [{ id: "reply1", text: "Reply", parentId: "ann1" }];

      mockRequest
        .mockResolvedValueOnce(root) // get
        .mockResolvedValueOnce({ objects: replies, totalCount: 1 }); // list replies

      const thread = await service.getThread("ann1");
      expect(thread.root.id).toBe("ann1");
      expect(thread.replies).toHaveLength(1);
      expect(thread.replies[0].id).toBe("reply1");
    });
  });

  describe("syncToMarkers()", () => {
    it("creates markers from annotations", async () => {
      const annotations = [
        { id: "ann1", entryId: "0_abc", text: "Comment at 5s", startTime: 5, userId: "user1" },
      ];
      mockRequest
        .mockResolvedValueOnce({ objects: annotations }) // listAnnotations
        .mockResolvedValueOnce({ objects: [] }); // listAnnotations (replies)

      const result = await service.syncToMarkers("0_abc");
      expect(result.created).toBe(1);
      expect(premiereService.addMarkers).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            start: 5,
            name: expect.stringContaining("[Kaltura]"),
          }),
        ]),
      );
    });

    it("handles empty annotations", async () => {
      mockRequest.mockResolvedValue({ objects: [] });

      const result = await service.syncToMarkers("0_abc");
      expect(result.created).toBe(0);
      expect(premiereService.addMarkers).not.toHaveBeenCalled();
    });
  });

  describe("syncFromMarkers()", () => {
    it("creates annotations from Premiere markers", async () => {
      (premiereService.getMarkers as jest.Mock).mockResolvedValue([
        { name: "My marker", start: 10, comments: "Some notes", colorIndex: 0 },
      ]);
      mockRequest.mockResolvedValue({ id: "ann_new" });

      const result = await service.syncFromMarkers("0_abc");
      expect(result.created).toBe(1);
    });

    it("skips markers with Kaltura prefix", async () => {
      (premiereService.getMarkers as jest.Mock).mockResolvedValue([
        { name: "[Kaltura] Already synced", start: 5, comments: "", colorIndex: 0 },
      ]);

      const result = await service.syncFromMarkers("0_abc");
      expect(result.skipped).toBe(1);
      expect(result.created).toBe(0);
    });

    it("handles no markers", async () => {
      (premiereService.getMarkers as jest.Mock).mockResolvedValue([]);
      const result = await service.syncFromMarkers("0_abc");
      expect(result.created).toBe(0);
    });
  });
});
