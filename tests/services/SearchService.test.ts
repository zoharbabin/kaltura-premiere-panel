import { SearchService } from "../../src/services/SearchService";
import { KalturaClient } from "../../src/services/KalturaClient";

const mockRequest = jest.fn();
const client = {
  request: mockRequest,
} as unknown as KalturaClient;

describe("SearchService", () => {
  let service: SearchService;

  beforeEach(() => {
    service = new SearchService(client);
    jest.clearAllMocks();
  });

  describe("searchTranscripts()", () => {
    it("returns transcript matches for an entry", async () => {
      mockRequest.mockResolvedValue({
        totalCount: 1,
        objects: [
          {
            object: { id: "0_abc" },
            itemsData: [
              {
                items: [
                  { startTime: 10, endTime: 15, searchTerm: "hello", highlight: "<em>hello</em>" },
                  {
                    startTime: 30,
                    endTime: 35,
                    searchTerm: "hello",
                    highlight: "<em>hello</em> world",
                  },
                ],
              },
            ],
          },
        ],
      });

      const results = await service.searchTranscripts("0_abc", "hello");
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        startTime: 10,
        endTime: 15,
        text: "hello",
        highlight: "<em>hello</em>",
      });
    });

    it("filters results to the requested entry only", async () => {
      mockRequest.mockResolvedValue({
        totalCount: 2,
        objects: [
          {
            object: { id: "0_other" },
            itemsData: [{ items: [{ startTime: 0, endTime: 5, searchTerm: "test" }] }],
          },
          {
            object: { id: "0_target" },
            itemsData: [{ items: [{ startTime: 10, endTime: 20, searchTerm: "test" }] }],
          },
        ],
      });

      const results = await service.searchTranscripts("0_target", "test");
      expect(results).toHaveLength(1);
      expect(results[0].startTime).toBe(10);
    });

    it("returns empty array when no matches", async () => {
      mockRequest.mockResolvedValue({ totalCount: 0, objects: [] });
      const results = await service.searchTranscripts("0_abc", "nonexistent");
      expect(results).toEqual([]);
    });
  });

  describe("searchInVideo()", () => {
    it("returns entries with highlights", async () => {
      mockRequest.mockResolvedValue({
        totalCount: 1,
        objects: [
          {
            object: { id: "0_abc", name: "Test Video" },
            itemsData: [
              {
                items: [
                  { itemType: "caption", highlight: "caption match", startTime: 5, endTime: 10 },
                  { itemType: "metadata", highlight: "metadata match" },
                ],
              },
            ],
          },
        ],
      });

      const results = await service.searchInVideo("match");
      expect(results).toHaveLength(1);
      expect(results[0].entry.id).toBe("0_abc");
      expect(results[0].highlights).toHaveLength(2);
      expect(results[0].highlights[0].type).toBe("caption");
      expect(results[0].highlights[1].type).toBe("metadata");
    });

    it("uses OR operator for unified search", async () => {
      mockRequest.mockResolvedValue({ totalCount: 0, objects: [] });

      await service.searchInVideo("test");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            searchParams: expect.objectContaining({
              searchOperator: expect.objectContaining({
                operator: 2, // OR
              }),
            }),
          }),
        }),
      );
    });

    it("maps unknown item types to content", async () => {
      mockRequest.mockResolvedValue({
        totalCount: 1,
        objects: [
          {
            object: { id: "0_abc" },
            itemsData: [{ items: [{ itemType: "unknown_type", highlight: "test" }] }],
          },
        ],
      });

      const results = await service.searchInVideo("test");
      expect(results[0].highlights[0].type).toBe("content");
    });
  });

  describe("searchByTags()", () => {
    it("searches with AND logic across tags", async () => {
      mockRequest.mockResolvedValue({ totalCount: 0, objects: [] });

      await service.searchByTags(["tag1", "tag2"]);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            searchParams: expect.objectContaining({
              searchOperator: expect.objectContaining({
                operator: 1, // AND
                searchItems: expect.arrayContaining([
                  expect.objectContaining({ searchTerm: "tag1", itemType: 1 }),
                  expect.objectContaining({ searchTerm: "tag2", itemType: 1 }),
                ]),
              }),
            }),
          }),
        }),
      );
    });
  });

  describe("searchSimilar()", () => {
    it("uses similar item type for related entries", async () => {
      mockRequest.mockResolvedValue({ totalCount: 0, objects: [] });

      await service.searchSimilar("0_abc");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            searchParams: expect.objectContaining({
              searchOperator: expect.objectContaining({
                searchItems: expect.arrayContaining([
                  expect.objectContaining({ searchTerm: "0_abc", itemType: 3 }),
                ]),
              }),
            }),
          }),
        }),
      );
    });

    it("respects custom pager", async () => {
      mockRequest.mockResolvedValue({ totalCount: 0, objects: [] });

      await service.searchSimilar("0_abc", { pageSize: 10, pageIndex: 2 });
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            pager: expect.objectContaining({ pageSize: 10, pageIndex: 2 }),
          }),
        }),
      );
    });
  });
});
