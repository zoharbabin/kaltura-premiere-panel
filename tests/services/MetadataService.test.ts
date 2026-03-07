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

  describe("getEntryMetadata()", () => {
    it("returns parsed metadata values for an entry", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaMetadataListResponse",
          totalCount: 1,
          objects: [
            {
              id: 100,
              xml: "<metadata><department>Engineering</department><priority>High</priority></metadata>",
              metadataProfileId: 1,
            },
          ],
        }),
      });

      const result = await service.getEntryMetadata("0_abc", 1);

      expect(result).not.toBeNull();
      expect(result!.profileId).toBe(1);
      expect(result!.values).toEqual({ department: "Engineering", priority: "High" });
    });

    it("returns null when no metadata exists", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaMetadataListResponse",
          totalCount: 0,
          objects: [],
        }),
      });

      const result = await service.getEntryMetadata("0_abc", 1);
      expect(result).toBeNull();
    });

    it("returns null on error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const result = await service.getEntryMetadata("0_abc", 1);
      expect(result).toBeNull();
    });
  });

  describe("saveEntryMetadata()", () => {
    it("creates new metadata when none exists", async () => {
      // First call: getEntryMetadata returns empty
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaMetadataListResponse",
          totalCount: 0,
          objects: [],
        }),
      });
      // Second call: metadata.add
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ objectType: "KalturaMetadata", id: 200 }),
      });

      await service.saveEntryMetadata("0_abc", 1, { department: "Sales" });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const addBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(addBody.xmlData).toContain("<department>Sales</department>");
      expect(addBody.metadataProfileId).toBe(1);
    });

    it("updates existing metadata", async () => {
      // First call: getEntryMetadata returns existing
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaMetadataListResponse",
          totalCount: 1,
          objects: [
            {
              id: 100,
              xml: "<metadata><department>Old</department></metadata>",
              metadataProfileId: 1,
            },
          ],
        }),
      });
      // Second call: metadata.update
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ objectType: "KalturaMetadata", id: 100 }),
      });

      await service.saveEntryMetadata("0_abc", 1, { department: "New" });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const updateUrl = mockFetch.mock.calls[1][0] as string;
      expect(updateUrl).toContain("metadata_metadata/action/update");
    });

    it("escapes XML special characters in values", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaMetadataListResponse",
          totalCount: 0,
          objects: [],
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ objectType: "KalturaMetadata", id: 201 }),
      });

      await service.saveEntryMetadata("0_abc", 1, { notes: "A & B <test>" });

      const addBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(addBody.xmlData).toContain("A &amp; B &lt;test&gt;");
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
