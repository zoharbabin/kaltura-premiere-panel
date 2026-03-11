import { KalturaClient } from "../../src/services/KalturaClient";
import { MediaService } from "../../src/services/MediaService";
import { KalturaMediaType } from "../../src/types/kaltura";

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
});
