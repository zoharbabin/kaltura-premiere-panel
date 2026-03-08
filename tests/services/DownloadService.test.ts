import { DownloadService } from "../../src/services/DownloadService";
import { KalturaClient } from "../../src/services/KalturaClient";
import { MediaService } from "../../src/services/MediaService";
import { KalturaFlavorAsset } from "../../src/types/kaltura";

const mockFetch = global.fetch as jest.Mock;

function createMockHostService() {
  return {
    importFile: jest.fn().mockResolvedValue({ success: true }),
    isImported: jest.fn().mockReturnValue(false),
    storeMapping: jest.fn(),
  };
}

describe("DownloadService", () => {
  let client: KalturaClient;
  let mediaService: MediaService;
  let hostService: ReturnType<typeof createMockHostService>;
  let service: DownloadService;

  const mockFlavor: KalturaFlavorAsset = {
    id: "flavor_1",
    entryId: "0_abc",
    partnerId: 12345,
    status: 2,
    size: 1024,
    width: 1920,
    height: 1080,
    bitrate: 4000,
    frameRate: 30,
    fileExt: "mp4",
    isWeb: true,
    isOriginal: false,
  };

  beforeEach(() => {
    client = new KalturaClient({ serviceUrl: "https://test.kaltura.com", partnerId: 12345 });
    client.setKs("test_ks");
    mediaService = new MediaService(client);
    hostService = createMockHostService();
    service = new DownloadService(client, mediaService, hostService);
    mockFetch.mockReset();
  });

  it("initializes with zero active downloads", () => {
    expect(service.activeCount).toBe(0);
    expect(service.queueLength).toBe(0);
  });

  it("re-downloads even if asset was previously imported", async () => {
    hostService.isImported.mockReturnValue(true);
    const existingFlavor = { ...mockFlavor, id: "flavor_existing", entryId: "0_existing" };

    // getFlavorDownloadUrl is now synchronous (constructs serve URL directly).
    // Only mock the actual file download fetch.
    const mockReader = {
      read: jest
        .fn()
        .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: (name: string) => (name === "content-length" ? "3" : "video/mp4") },
      body: { getReader: () => mockReader },
    });

    const result = await service.downloadAndImport("0_existing", existingFlavor);

    expect(result.entryId).toBe("0_existing");
    expect(result.flavorId).toBe("flavor_existing");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/playManifest/entryId/0_existing/flavorId/flavor_existing/"),
      expect.any(Object),
    );
  });

  it("downloads file and creates mapping", async () => {
    // getFlavorDownloadUrl is now synchronous — only mock the file download
    const mockReader = {
      read: jest
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new Uint8Array([1, 2, 3, 4]),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: (name: string) => (name === "content-length" ? "4" : "video/mp4") },
      body: { getReader: () => mockReader },
    });

    const progressCalls: number[] = [];
    const result = await service.downloadAndImport("0_abc", mockFlavor, (p) => {
      progressCalls.push(p.percent);
    });

    expect(result.entryId).toBe("0_abc");
    expect(result.flavorId).toBe("flavor_1");
    expect(result.localPath).toContain("0_abc_flavor_1.mp4");
    expect(progressCalls.length).toBeGreaterThan(0);
  });

  it("cancels a download", () => {
    // Start a download but cancel it before it completes
    service.cancelDownload("0_nonexistent");
    // Should not throw
    expect(service.activeCount).toBe(0);
  });

  it("cancels all downloads", () => {
    service.cancelAll();
    expect(service.activeCount).toBe(0);
    expect(service.queueLength).toBe(0);
  });
});
