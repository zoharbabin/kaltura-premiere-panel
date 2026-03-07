import { KalturaClient } from "../../src/services/KalturaClient";
import { UploadService } from "../../src/services/UploadService";
import { KalturaUploadTokenStatus } from "../../src/types/kaltura";

const mockFetch = global.fetch as jest.Mock;

describe("UploadService", () => {
  let client: KalturaClient;
  let service: UploadService;

  beforeEach(() => {
    client = new KalturaClient({ serviceUrl: "https://test.kaltura.com", partnerId: 12345 });
    client.setKs("test_ks");
    service = new UploadService(client);
    mockFetch.mockReset();
  });

  describe("createToken()", () => {
    it("creates an upload token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaUploadToken",
          id: "token_123",
          status: KalturaUploadTokenStatus.PENDING,
        }),
      });

      const token = await service.createToken();
      expect(token.id).toBe("token_123");
      expect(token.status).toBe(KalturaUploadTokenStatus.PENDING);
    });
  });

  describe("uploadFile()", () => {
    it("uploads a small file as a single chunk", async () => {
      // createToken already called, now upload + verify
      const fileData = new ArrayBuffer(1024); // 1 KB — single chunk

      // Upload chunk response
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      // Verify status response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaUploadToken",
          id: "token_123",
          status: KalturaUploadTokenStatus.FULL_UPLOAD,
        }),
      });

      const progressCalls: number[] = [];
      await service.uploadFile("token_123", fileData, ({ percent }) => {
        progressCalls.push(percent);
      });

      expect(progressCalls).toContain(100);
      expect(mockFetch).toHaveBeenCalledTimes(2); // 1 chunk + 1 status check
    });

    it("calls progress callback with percentage", async () => {
      const fileData = new ArrayBuffer(1024);

      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: KalturaUploadTokenStatus.FULL_UPLOAD,
        }),
      });

      const progressValues: number[] = [];
      await service.uploadFile("token_abc", fileData, ({ percent }) => {
        progressValues.push(percent);
      });

      expect(progressValues.length).toBeGreaterThan(0);
      expect(progressValues[progressValues.length - 1]).toBe(100);
    });
  });

  describe("cancelUpload()", () => {
    it("does not throw when cancelling non-existent upload", () => {
      expect(() => service.cancelUpload("non_existent")).not.toThrow();
    });
  });
});
