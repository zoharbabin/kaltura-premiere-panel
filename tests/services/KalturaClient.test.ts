import { KalturaClient } from "../../src/services/KalturaClient";
import { KalturaApiError, NetworkError } from "../../src/utils/errors";

const mockFetch = global.fetch as jest.Mock;

describe("KalturaClient", () => {
  let client: KalturaClient;

  beforeEach(() => {
    client = new KalturaClient({ serviceUrl: "https://test.kaltura.com", partnerId: 12345 });
    mockFetch.mockReset();
  });

  describe("constructor & configuration", () => {
    it("initializes with config", () => {
      expect(client.getPartnerId()).toBe(12345);
      expect(client.getServiceUrl()).toBe("https://test.kaltura.com");
      expect(client.getKs()).toBeNull();
    });

    it("sets and gets KS", () => {
      client.setKs("test_ks_token");
      expect(client.getKs()).toBe("test_ks_token");
    });

    it("updates config via configure()", () => {
      client.configure({ partnerId: 99999 });
      expect(client.getPartnerId()).toBe(99999);
    });
  });

  describe("request()", () => {
    it("makes a POST request with correct URL and body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ objectType: "KalturaMediaEntry", id: "0_test" }),
      });

      const result = await client.request({
        service: "media",
        action: "get",
        params: { entryId: "0_test" },
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://test.kaltura.com/api_v3/service/media/action/get");
      expect(options.method).toBe("POST");

      const body = JSON.parse(options.body);
      expect(body.entryId).toBe("0_test");
      expect(body.format).toBe(1);
      expect(body.clientTag).toContain("kaltura-premiere-panel");

      expect(result).toEqual({ objectType: "KalturaMediaEntry", id: "0_test" });
    });

    it("includes KS in request body when set", async () => {
      client.setKs("my_ks_token");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ objectType: "KalturaUser" }),
      });

      await client.request({ service: "user", action: "get" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.ks).toBe("my_ks_token");
    });

    it("throws KalturaApiError for API exceptions", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaAPIException",
          message: "Invalid KS",
          code: "INVALID_KS",
        }),
      });

      await expect(client.request({ service: "user", action: "get" })).rejects.toThrow(
        KalturaApiError,
      );
    });

    it("throws NetworkError for HTTP failures", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Server Error" });

      await expect(client.request({ service: "media", action: "list" })).rejects.toThrow(
        NetworkError,
      );
    });

    it("throws NetworkError for fetch failures", async () => {
      mockFetch.mockRejectedValueOnce(new Error("net::ERR_CONNECTION_REFUSED"));

      await expect(client.request({ service: "media", action: "list" })).rejects.toThrow(
        NetworkError,
      );
    });
  });

  describe("multiRequest()", () => {
    it("sends multiple requests in a single call", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { objectType: "KalturaMediaEntry", id: "0_abc" },
          { objectType: "KalturaFlavorAssetListResponse", objects: [], totalCount: 0 },
        ],
      });

      const results = await client.multiRequest([
        { service: "media", action: "get", params: { entryId: "0_abc" } },
        { service: "flavorAsset", action: "list", params: { "filter:entryIdEqual": "0_abc" } },
      ]);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/multirequest");
      const body = JSON.parse(options.body);
      expect(body["1:service"]).toBe("media");
      expect(body["2:service"]).toBe("flavorAsset");
      expect(results).toHaveLength(2);
    });

    it("throws error when any sub-request fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { objectType: "KalturaMediaEntry", id: "0_abc" },
          { objectType: "KalturaAPIException", code: "NOT_FOUND", message: "Entry not found" },
        ],
      });

      await expect(
        client.multiRequest([
          { service: "media", action: "get", params: { entryId: "0_abc" } },
          { service: "flavorAsset", action: "list" },
        ]),
      ).rejects.toThrow(KalturaApiError);
    });
  });
});
