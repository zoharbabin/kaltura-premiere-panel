import { MetadataService } from "../../src/services/MetadataService";
import { KalturaClient } from "../../src/services/KalturaClient";

const mockFetch = global.fetch as jest.Mock;

describe("MetadataService", () => {
  let client: KalturaClient;
  let service: MetadataService;

  beforeEach(() => {
    client = new KalturaClient({ serviceUrl: "https://test.kaltura.com", partnerId: 12345 });
    client.setKs("test_ks");
    service = new MetadataService(client);
    mockFetch.mockReset();
  });

  describe("updateEntry()", () => {
    it("updates entry metadata via media.update", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaMediaEntry",
          id: "0_abc",
          name: "Updated Title",
          description: "New desc",
          tags: "tag1, tag2",
        }),
      });

      const result = await service.updateEntry("0_abc", {
        name: "Updated Title",
        description: "New desc",
        tags: "tag1, tag2",
      });

      expect(result.name).toBe("Updated Title");
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.mediaEntry.name).toBe("Updated Title");
    });
  });

  describe("searchTags()", () => {
    it("returns tag suggestions from tag.search", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaTagListResponse",
          totalCount: 2,
          objects: [{ tag: "interview" }, { tag: "internal" }],
        }),
      });

      const tags = await service.searchTags("int");

      expect(tags).toEqual(["interview", "internal"]);
    });

    it("returns empty array on error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const tags = await service.searchTags("test");
      expect(tags).toEqual([]);
    });
  });

  describe("listCategories()", () => {
    it("lists categories", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaCategoryListResponse",
          totalCount: 2,
          objects: [
            { id: 1, name: "Videos", fullName: "Videos", parentId: 0 },
            { id: 2, name: "Training", fullName: "Training", parentId: 0 },
          ],
        }),
      });

      const categories = await service.listCategories();

      expect(categories).toHaveLength(2);
      expect(categories[0].name).toBe("Videos");
    });

    it("lists categories with parent filter", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaCategoryListResponse",
          totalCount: 1,
          objects: [{ id: 3, name: "Onboarding", fullName: "Training>Onboarding", parentId: 2 }],
        }),
      });

      const categories = await service.listCategories(2);

      expect(categories).toHaveLength(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.filter.parentIdEqual).toBe(2);
    });
  });

  describe("listMetadataProfiles()", () => {
    it("returns metadata profiles", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaMetadataProfileListResponse",
          totalCount: 1,
          objects: [{ id: 1, name: "Custom Fields", xsd: "<xsd/>" }],
        }),
      });

      const profiles = await service.listMetadataProfiles();
      expect(profiles).toHaveLength(1);
      expect(profiles[0].name).toBe("Custom Fields");
    });

    it("returns empty array when metadata plugin unavailable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Service not found"));
      const profiles = await service.listMetadataProfiles();
      expect(profiles).toEqual([]);
    });
  });

  describe("parseProfileXsd()", () => {
    it("extracts fields from XSD", () => {
      const xsd = `<xsd:schema><xsd:element name="department" type="textType" minOccurs="1"/><xsd:element name="projectDate" type="dateType" minOccurs="0"/><xsd:element name="priority" type="intType"/></xsd:schema>`;

      const fields = service.parseProfileXsd(xsd);

      expect(fields).toHaveLength(3);
      expect(fields[0]).toEqual({
        key: "department",
        label: "department",
        type: "text",
        required: true,
      });
      expect(fields[1].type).toBe("date");
      expect(fields[2].type).toBe("number");
    });
  });

  describe("addToCategory() / removeFromCategory()", () => {
    it("adds entry to category", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ objectType: "KalturaCategoryEntry" }),
      });

      await service.addToCategory("0_abc", 5);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.categoryEntry.entryId).toBe("0_abc");
      expect(body.categoryEntry.categoryId).toBe(5);
    });

    it("removes entry from category", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await service.removeFromCategory("0_abc", 5);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("categoryEntry/action/delete");
    });
  });
});
