import { ProxyService } from "../../src/services/ProxyService";
import { KalturaClient } from "../../src/services/KalturaClient";
import { MediaService } from "../../src/services/MediaService";
import { KalturaFlavorAsset } from "../../src/types/kaltura";

const mockRequest = jest.fn();
const client = {
  request: mockRequest,
} as unknown as KalturaClient;

const mediaService = {
  getFlavorDownloadUrl: jest.fn(),
} as unknown as MediaService;

function createMockHostService() {
  return {
    importFile: jest.fn().mockResolvedValue({ success: true }),
    storeMapping: jest.fn(),
  };
}

function makeFlavor(overrides: Partial<KalturaFlavorAsset>): KalturaFlavorAsset {
  return {
    id: "flv_1",
    entryId: "0_abc",
    partnerId: 123,
    status: 2,
    size: 1000,
    width: 1920,
    height: 1080,
    bitrate: 4000,
    frameRate: 30,
    fileExt: "mp4",
    isWeb: true,
    isOriginal: false,
    ...overrides,
  };
}

describe("ProxyService", () => {
  let service: ProxyService;
  let hostService: ReturnType<typeof createMockHostService>;

  beforeEach(() => {
    hostService = createMockHostService();
    service = new ProxyService(client, mediaService, hostService);
    jest.clearAllMocks();
  });

  describe("getProxyFlavor()", () => {
    it("selects lowest resolution >= 720p", async () => {
      mockRequest.mockResolvedValue({
        objects: [
          makeFlavor({ id: "flv_4k", height: 2160, width: 3840, bitrate: 8000 }),
          makeFlavor({ id: "flv_1080", height: 1080, width: 1920, bitrate: 4000 }),
          makeFlavor({ id: "flv_720", height: 720, width: 1280, bitrate: 2000 }),
          makeFlavor({ id: "flv_480", height: 480, width: 854, bitrate: 1000 }),
        ],
      });

      const result = await service.getProxyFlavor("0_abc");
      expect(result?.id).toBe("flv_720");
    });

    it("falls back to lowest resolution when none >= 720p", async () => {
      mockRequest.mockResolvedValue({
        objects: [
          makeFlavor({ id: "flv_480", height: 480, width: 854 }),
          makeFlavor({ id: "flv_360", height: 360, width: 640 }),
        ],
      });

      const result = await service.getProxyFlavor("0_abc");
      expect(result?.id).toBe("flv_360");
    });

    it("returns null when no flavors exist", async () => {
      mockRequest.mockResolvedValue({ objects: [] });
      const result = await service.getProxyFlavor("0_abc");
      expect(result).toBeNull();
    });

    it("excludes original flavors when transcoded versions exist", async () => {
      mockRequest.mockResolvedValue({
        objects: [
          makeFlavor({ id: "flv_orig", isOriginal: true, height: 720, width: 1280 }),
          makeFlavor({ id: "flv_720", isOriginal: false, height: 720, width: 1280 }),
        ],
      });

      const result = await service.getProxyFlavor("0_abc");
      expect(result?.id).toBe("flv_720");
      expect(result?.isOriginal).toBe(false);
    });
  });

  describe("getOriginalFlavor()", () => {
    it("returns the isOriginal flavor if available", async () => {
      mockRequest.mockResolvedValue({
        objects: [
          makeFlavor({ id: "flv_orig", isOriginal: true, bitrate: 8000 }),
          makeFlavor({ id: "flv_1080", isOriginal: false, bitrate: 10000 }),
        ],
      });

      const result = await service.getOriginalFlavor("0_abc");
      expect(result?.id).toBe("flv_orig");
    });

    it("falls back to highest bitrate when no original", async () => {
      mockRequest.mockResolvedValue({
        objects: [
          makeFlavor({ id: "flv_low", bitrate: 2000 }),
          makeFlavor({ id: "flv_high", bitrate: 8000 }),
          makeFlavor({ id: "flv_mid", bitrate: 4000 }),
        ],
      });

      const result = await service.getOriginalFlavor("0_abc");
      expect(result?.id).toBe("flv_high");
    });

    it("returns null when no flavors exist", async () => {
      mockRequest.mockResolvedValue({ objects: [] });
      const result = await service.getOriginalFlavor("0_abc");
      expect(result).toBeNull();
    });
  });

  describe("isProxyLoaded()", () => {
    it("returns false initially", () => {
      expect(service.isProxyLoaded("0_abc")).toBe(false);
    });
  });

  describe("reconnectToOriginal()", () => {
    it("gets original flavor URL and updates mapping", async () => {
      mockRequest.mockResolvedValue({
        objects: [makeFlavor({ id: "flv_orig", isOriginal: true, bitrate: 8000 })],
      });
      (mediaService.getFlavorDownloadUrl as jest.Mock).mockResolvedValue(
        "https://cdn.kaltura.com/original.mp4",
      );

      const result = await service.reconnectToOriginal("0_abc");
      expect(result.originalFlavor.id).toBe("flv_orig");
      expect(result.downloadUrl).toBe("https://cdn.kaltura.com/original.mp4");
      expect(hostService.storeMapping).toHaveBeenCalledWith(
        "0_abc",
        "https://cdn.kaltura.com/original.mp4",
      );
    });

    it("throws when no original flavor available", async () => {
      mockRequest.mockResolvedValue({ objects: [] });
      await expect(service.reconnectToOriginal("0_abc")).rejects.toThrow(
        "No original flavor available",
      );
    });
  });
});
