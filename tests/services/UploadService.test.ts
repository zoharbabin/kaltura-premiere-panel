import { KalturaClient } from "../../src/services/KalturaClient";
import { UploadService } from "../../src/services/UploadService";
import { KalturaUploadTokenStatus } from "../../src/types/kaltura";

const mockFetch = global.fetch as jest.Mock;

// Mock XMLHttpRequest for chunked upload (uses XHR, not fetch)
const mockXhrInstances: MockXhr[] = [];
class MockXhr {
  open = jest.fn();
  send = jest.fn();
  setRequestHeader = jest.fn();
  timeout = 0;
  status = 200;
  responseText = "";
  readyState = 4;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;

  constructor() {
    mockXhrInstances.push(this);
    // Auto-resolve on send
    this.send = jest.fn().mockImplementation(() => {
      setTimeout(() => {
        this.responseText = JSON.stringify({
          objectType: "KalturaUploadToken",
          status: KalturaUploadTokenStatus.FULL_UPLOAD,
          uploadedFileSize: 1024,
        });
        this.onload?.();
      }, 0);
    });
  }
}

(global as any).XMLHttpRequest = MockXhr;

describe("UploadService", () => {
  let client: KalturaClient;
  let service: UploadService;

  beforeEach(() => {
    client = new KalturaClient({ serviceUrl: "https://test.kaltura.com", partnerId: 12345 });
    client.setKs("test_ks");
    service = new UploadService(client);
    mockFetch.mockReset();
    mockXhrInstances.length = 0;
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

    it("passes fileName and fileSize when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaUploadToken",
          id: "token_456",
          status: KalturaUploadTokenStatus.PENDING,
          fileName: "test.mp4",
          fileSize: 5242880,
        }),
      });

      const token = await service.createToken("test.mp4", 5242880);
      expect(token.id).toBe("token_456");

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.uploadToken.fileName).toBe("test.mp4");
      expect(body.uploadToken.fileSize).toBe(5242880);
    });
  });

  describe("uploadFile()", () => {
    it("uploads a small file as a single chunk", async () => {
      const fileData = new ArrayBuffer(1024); // 1 KB — single chunk

      // Verify status response (after XHR upload)
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
      // 1 XHR for chunk + 1 fetch for status check
      expect(mockXhrInstances.length).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("sends uploadTokenId and ks as URL query params", async () => {
      const fileData = new ArrayBuffer(1024);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: KalturaUploadTokenStatus.FULL_UPLOAD,
        }),
      });

      await service.uploadFile("token_abc", fileData);

      expect(mockXhrInstances.length).toBe(1);
      const openCall = mockXhrInstances[0].open.mock.calls[0];
      const url = openCall[1] as string;
      expect(url).toContain("uploadTokenId=token_abc");
      expect(url).toContain("ks=test_ks");
      expect(url).toContain("format=1");
    });

    it("calls progress callback with percentage", async () => {
      const fileData = new ArrayBuffer(1024);

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
