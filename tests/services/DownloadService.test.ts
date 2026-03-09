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

function mockFetchResponse(data: Uint8Array) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    url: "https://cdn.kaltura.com/download/test.mp4",
    redirected: true,
    headers: {
      get: (name: string) => {
        if (name === "content-length") return String(data.byteLength);
        if (name === "content-type") return "video/mp4";
        return null;
      },
    },
    arrayBuffer: () =>
      Promise.resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)),
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

    mockFetch.mockResolvedValueOnce(mockFetchResponse(new Uint8Array([1, 2, 3])));

    const result = await service.downloadAndImport("0_existing", existingFlavor);

    expect(result.entryId).toBe("0_existing");
    expect(result.flavorId).toBe("flavor_existing");
  });

  it("downloads file and creates mapping", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse(new Uint8Array([1, 2, 3, 4])));

    const progressCalls: number[] = [];
    const result = await service.downloadAndImport("0_abc", mockFlavor, (p) => {
      progressCalls.push(p.percent);
    });

    expect(result.entryId).toBe("0_abc");
    expect(result.flavorId).toBe("flavor_1");
    expect(result.localPath).toContain("0_abc_flavor_1.mp4");
    expect(progressCalls.length).toBeGreaterThan(0);
  });

  it("resolves native path via getEntryWithUrl", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse(new Uint8Array([1, 2])));

    const result = await service.downloadAndImport("0_abc", mockFlavor);

    expect(result.localPath).toBe("/tmp/kaltura-data/0_abc_flavor_1.mp4");
  });

  it("cancels a download", () => {
    service.cancelDownload("0_nonexistent");
    expect(service.activeCount).toBe(0);
  });

  it("cancels all downloads", () => {
    service.cancelAll();
    expect(service.activeCount).toBe(0);
    expect(service.queueLength).toBe(0);
  });
});
