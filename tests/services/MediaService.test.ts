import { KalturaClient } from "../../src/services/KalturaClient";
import { MediaService } from "../../src/services/MediaService";
import { KalturaMediaType, ESearchItemType, ESearchOperatorType } from "../../src/types/kaltura";

const mockFetch = global.fetch as jest.Mock;

describe("MediaService", () => {
  let client: KalturaClient;
  let service: MediaService;

  beforeEach(() => {
    client = new KalturaClient({ serviceUrl: "https://test.kaltura.com", partnerId: 12345 });
    client.setKs("test_ks");
    service = new MediaService(client);
    mockFetch.mockReset();
  });

  describe("list()", () => {
    it("lists entries with default pager", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaMediaListResponse",
          totalCount: 2,
          objects: [
            { id: "0_a", name: "Video A", mediaType: 1 },
            { id: "0_b", name: "Video B", mediaType: 1 },
          ],
        }),
      });

      const result = await service.list();
      expect(result.totalCount).toBe(2);
      expect(result.objects).toHaveLength(2);
    });

    it("passes filter and pager to API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ totalCount: 0, objects: [] }),
      });

      await service.list(
        { searchTextMatchAnd: "test", mediaTypeEqual: KalturaMediaType.VIDEO },
        { pageSize: 20, pageIndex: 2 },
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.filter.searchTextMatchAnd).toBe("test");
      expect(body.filter.mediaTypeEqual).toBe(1);
      expect(body.pager.pageSize).toBe(20);
      expect(body.pager.pageIndex).toBe(2);
    });
  });

  describe("get()", () => {
    it("gets entry by ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "0_test", name: "Test Video" }),
      });

      const result = await service.get("0_test");
      expect(result.id).toBe("0_test");
    });
  });

  describe("getEntryDetails()", () => {
    it("fetches entry, flavors, and captions in one call", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { objectType: "KalturaMediaEntry", id: "0_test", name: "Test" },
          { objectType: "KalturaFlavorAssetListResponse", objects: [{ id: "f1" }], totalCount: 1 },
          { objectType: "KalturaCaptionAssetListResponse", objects: [], totalCount: 0 },
        ],
      });

      const result = await service.getEntryDetails("0_test");
      expect(result.entry.id).toBe("0_test");
      expect(result.flavors).toHaveLength(1);
      expect(result.captions).toHaveLength(0);
    });
  });

  describe("add()", () => {
    it("creates a new entry", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "0_new", name: "New Video" }),
      });

      const result = await service.add({ name: "New Video" });
      expect(result.id).toBe("0_new");

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.entry.name).toBe("New Video");
      expect(body.entry.objectType).toBe("KalturaMediaEntry");
    });
  });

  describe("addFromUploadedFile()", () => {
    it("creates entry from uploaded file token in a single call", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "0_uploaded", name: "Uploaded Video" }),
      });

      const result = await service.addFromUploadedFile({ name: "Uploaded Video" }, "token_abc");
      expect(result.id).toBe("0_uploaded");

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.mediaEntry.objectType).toBe("KalturaMediaEntry");
      expect(body.mediaEntry.name).toBe("Uploaded Video");
      expect(body.uploadTokenId).toBe("token_abc");

      // Verify the correct API action
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain("/service/media/action/addFromUploadedFile");
    });
  });

  describe("getFlavorDownloadUrl()", () => {
    it("calls flavorAsset/getDownloadUrl API and returns the URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => "https://cdn.kaltura.com/download/flavor_1",
      });

      const url = await service.getFlavorDownloadUrl("0_entry", "flavor_1");
      expect(url).toBe("https://cdn.kaltura.com/download/flavor_1");

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.id).toBe("flavor_1");
      expect(body.useCdn).toBe(true);
    });
  });

  describe("getEntryDownloadUrl()", () => {
    it("returns direct download URL using baseEntry service", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => "https://cdn.kaltura.com/download/entry_source",
      });

      const url = await service.getEntryDownloadUrl("0_image");
      expect(url).toBe("https://cdn.kaltura.com/download/entry_source");

      const [fetchUrl, options] = mockFetch.mock.calls[0];
      expect(fetchUrl).toContain("/service/baseEntry/action/getDownloadUrl");
      const body = JSON.parse(options.body);
      expect(body.entryId).toBe("0_image");
    });
  });

  describe("eSearch()", () => {
    it("calls eSearch endpoint with correct params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ totalCount: 1, objects: [{ id: "0_found" }] }),
      });

      const result = await service.eSearch("test query");
      expect(result.totalCount).toBe(1);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.searchParams.searchOperator.searchItems[0].searchTerm).toBe("test query");
    });
  });

  describe("eSearchBrowse()", () => {
    const makeESearchResponse = (
      entries: { id: string; name: string }[],
      highlights?: Record<string, unknown>[],
    ) => ({
      ok: true,
      json: async () => ({
        totalCount: entries.length,
        objects: entries.map((e, i) => ({
          object: { id: e.id, name: e.name, mediaType: 1 },
          itemsData: highlights?.[i] ? [highlights[i]] : [],
        })),
      }),
    });

    it("builds unified search item for search text", async () => {
      mockFetch.mockResolvedValueOnce(makeESearchResponse([{ id: "0_a", name: "A" }]));

      await service.eSearchBrowse({ searchText: "demo" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const items = body.searchParams.searchOperator.searchItems;
      // unified_item + entry_type
      expect(items).toHaveLength(2);
      expect(items[0].objectType).toBe("KalturaESearchUnifiedItem");
      expect(items[0].itemType).toBe(ESearchItemType.STARTS_WITH);
      expect(items[0].searchTerm).toBe("demo");
      expect(items[0].addHighlight).toBe(true);
    });

    it("builds caption EXISTS item for withCaptionsOnly", async () => {
      mockFetch.mockResolvedValueOnce(makeESearchResponse([]));

      await service.eSearchBrowse({ withCaptionsOnly: true });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const items = body.searchParams.searchOperator.searchItems;
      // caption_item + entry_type
      expect(items).toHaveLength(2);
      expect(items[0].objectType).toBe("KalturaESearchCaptionItem");
      expect(items[0].fieldName).toBe("content");
      expect(items[0].itemType).toBe(ESearchItemType.EXISTS);
    });

    it("builds category item for categoryIds", async () => {
      mockFetch.mockResolvedValueOnce(makeESearchResponse([]));

      await service.eSearchBrowse({ searchText: "x", categoryIds: "42" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const items = body.searchParams.searchOperator.searchItems;
      const catItem = items.find(
        (i: Record<string, unknown>) => i.objectType === "KalturaESearchCategoryEntryItem",
      );
      expect(catItem).toBeDefined();
      expect(catItem.fieldName).toBe("full_ids");
      expect(catItem.searchTerm).toBe("42");
      expect(catItem.categoryEntryStatus).toBe(1);
    });

    it("builds media type item", async () => {
      mockFetch.mockResolvedValueOnce(makeESearchResponse([]));

      await service.eSearchBrowse({ searchText: "x", mediaType: KalturaMediaType.VIDEO });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const items = body.searchParams.searchOperator.searchItems;
      const typeItem = items.find((i: Record<string, unknown>) => i.fieldName === "media_type");
      expect(typeItem).toBeDefined();
      expect(typeItem.searchTerm).toBe("1");
      expect(typeItem.itemType).toBe(ESearchItemType.EXACT_MATCH);
    });

    it("builds date range item for createdAfter", async () => {
      mockFetch.mockResolvedValueOnce(makeESearchResponse([]));

      await service.eSearchBrowse({ searchText: "x", createdAfter: 1700000000 });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const items = body.searchParams.searchOperator.searchItems;
      const dateItem = items.find((i: Record<string, unknown>) => i.fieldName === "created_at");
      expect(dateItem).toBeDefined();
      expect(dateItem.itemType).toBe(ESearchItemType.RANGE);
      expect(dateItem.range.greaterThanOrEqual).toBe(1700000000);
    });

    it("builds AND[ OR[user fields], AND[search fields] ] structure", async () => {
      mockFetch.mockResolvedValueOnce(makeESearchResponse([]));

      await service.eSearchBrowse({ searchText: "x", userId: "user123" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const items = body.searchParams.searchOperator.searchItems;
      // OR[user fields] + AND[search fields] + entry_type = 3
      expect(items).toHaveLength(3);

      // First: OR of ownership fields
      const orOp = items[0];
      expect(orOp.objectType).toBe("KalturaESearchEntryOperator");
      expect(orOp.operator).toBe(ESearchOperatorType.OR_OP);
      expect(orOp.searchItems).toHaveLength(4);
      expect(orOp.searchItems[0].fieldName).toBe("kuser_id");
      expect(orOp.searchItems[0].addHighlight).toBe(false);
      expect(orOp.searchItems[1].fieldName).toBe("creator_kuser_id");
      expect(orOp.searchItems[2].fieldName).toBe("entitled_kusers_edit");
      expect(orOp.searchItems[3].fieldName).toBe("entitled_kusers_publish");

      // Second: AND of search/filter fields
      const andOp = items[1];
      expect(andOp.objectType).toBe("KalturaESearchEntryOperator");
      expect(andOp.operator).toBe(ESearchOperatorType.AND_OP);
      expect(andOp.searchItems[0].objectType).toBe("KalturaESearchUnifiedItem");
      expect(andOp.searchItems[0].searchTerm).toBe("x");

      // Third: entry_type filter
      expect(items[2].fieldName).toBe("entry_type");
      expect(items[2].searchTerm).toBe("1");
    });

    it("uses AND operator and objectStatuses=2", async () => {
      mockFetch.mockResolvedValueOnce(makeESearchResponse([]));

      await service.eSearchBrowse({ searchText: "x" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.searchParams.searchOperator.operator).toBe(ESearchOperatorType.AND_OP);
      expect(body.searchParams.objectStatuses).toBe("2");
    });

    it("uses display_in_search default item when no filters specified", async () => {
      mockFetch.mockResolvedValueOnce(makeESearchResponse([{ id: "0_a", name: "A" }]));
      await service.eSearchBrowse({});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const items = body.searchParams.searchOperator.searchItems;
      // entry_type + display_in_search
      expect(items).toHaveLength(2);
      expect(items[0].fieldName).toBe("entry_type");
      expect(items[0].searchTerm).toBe("1");
      expect(items[1].fieldName).toBe("display_in_search");
      expect(items[1].searchTerm).toBe("1");
    });

    it("unwraps entries from eSearch response", async () => {
      mockFetch.mockResolvedValueOnce(
        makeESearchResponse([
          { id: "0_a", name: "Alpha" },
          { id: "0_b", name: "Beta" },
        ]),
      );

      const result = await service.eSearchBrowse({ searchText: "test" });
      expect(result.totalCount).toBe(2);
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].id).toBe("0_a");
      expect(result.entries[1].id).toBe("0_b");
    });

    it("extracts highlights from top-level highlight array and itemsData", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalCount: 1,
          objects: [
            {
              object: { id: "0_a", name: "Alpha", mediaType: 1 },
              highlight: [
                {
                  fieldName: "name",
                  hits: [{ value: "<em>hello</em> world" }],
                },
                {
                  fieldName: "captions_content",
                  hits: [{ value: "caption <em>hello</em>" }],
                },
              ],
              itemsData: [
                {
                  itemsType: "caption",
                  items: [
                    {
                      highlight: "<em>hello</em> in caption",
                      startTime: 5000,
                      endTime: 8000,
                    },
                  ],
                },
              ],
            },
          ],
        }),
      });

      const result = await service.eSearchBrowse({ searchText: "hello" });
      const h = result.highlights.get("0_a");
      expect(h).toBeDefined();
      expect(h).toHaveLength(3);
      // Top-level highlights first
      expect(h![0].type).toBe("content");
      expect(h![0].text).toBe("hello world"); // HTML tags stripped
      expect(h![1].type).toBe("caption");
      expect(h![1].text).toBe("caption hello");
      // itemsData caption with timecodes
      expect(h![2].type).toBe("caption");
      expect(h![2].text).toBe("hello in caption");
      expect(h![2].startTime).toBe(5000);
    });

    it("combines multiple filter parameters", async () => {
      mockFetch.mockResolvedValueOnce(makeESearchResponse([]));

      await service.eSearchBrowse({
        searchText: "demo",
        mediaType: KalturaMediaType.AUDIO,
        withCaptionsOnly: true,
        categoryIds: "10",
        userId: "admin",
        createdAfter: 1600000000,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const items = body.searchParams.searchOperator.searchItems;
      // Top level: OR[user fields] + AND[search/filter fields] + entry_type = 3
      expect(items).toHaveLength(3);
      // OR has 4 user fields
      expect(items[0].operator).toBe(ESearchOperatorType.OR_OP);
      expect(items[0].searchItems).toHaveLength(4);
      // AND has 5 filter items: unified + caption + category + media_type + created_at
      expect(items[1].operator).toBe(ESearchOperatorType.AND_OP);
      expect(items[1].searchItems).toHaveLength(5);
      // entry_type filter
      expect(items[2].fieldName).toBe("entry_type");
      expect(items[2].searchTerm).toBe("1");
    });
  });
});
