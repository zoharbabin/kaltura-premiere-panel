import { PhotoshopHostService } from "../../src/services/PhotoshopHostService";
import { detectHostApp, getHostAppName } from "../../src/services/HostService";
import { createHostService } from "../../src/services/HostServiceFactory";

describe("HostService", () => {
  describe("detectHostApp()", () => {
    it("defaults to premierepro in test environment", () => {
      // In test env, no host modules are available
      expect(detectHostApp()).toBe("premierepro");
    });
  });

  describe("getHostAppName()", () => {
    it("returns correct names", () => {
      expect(getHostAppName("premierepro")).toBe("Premiere Pro");
      expect(getHostAppName("photoshop")).toBe("Photoshop");
    });
  });

  describe("createHostService()", () => {
    it("creates PhotoshopHostService when forced", () => {
      const service = createHostService("photoshop");
      expect(service.getAppInfo().id).toBe("photoshop");
    });

    it("creates PremiereService-compatible service by default", () => {
      const service = createHostService("premierepro");
      expect(typeof service.isAvailable).toBe("function");
      expect(typeof service.getVersion).toBe("function");
      expect(typeof service.getActiveSequence).toBe("function");
    });

    it("auto-detects host when no argument provided", () => {
      const service = createHostService();
      // In test env, detectHostApp() defaults to premierepro
      expect(typeof service.isAvailable).toBe("function");
      expect(typeof service.importFile).toBe("function");
      expect(typeof service.addMarkers).toBe("function");
      expect(typeof service.isImported).toBe("function");
      expect(typeof service.storeMapping).toBe("function");
      expect(typeof service.getAllMappings).toBe("function");
      expect(typeof service.clearMappings).toBe("function");
    });

    it("all host services implement complete HostService interface", () => {
      const hosts = ["premierepro", "photoshop"] as const;
      for (const hostId of hosts) {
        const service = createHostService(hostId);
        expect(typeof service.getAppInfo).toBe("function");
        expect(typeof service.isAvailable).toBe("function");
        expect(typeof service.getVersion).toBe("function");
        expect(typeof service.getActiveSequence).toBe("function");
        expect(typeof service.importFile).toBe("function");
        expect(typeof service.addMarkers).toBe("function");
        expect(typeof service.isImported).toBe("function");
        expect(typeof service.storeMapping).toBe("function");
        expect(typeof service.getAllMappings).toBe("function");
        expect(typeof service.clearMappings).toBe("function");
      }
    });

    it("Photoshop host reports image-only support", () => {
      const service = createHostService("photoshop");
      const info = service.getAppInfo();
      expect(info.supportsVideo).toBe(false);
      expect(info.supportsAudio).toBe(false);
      expect(info.supportsSequences).toBe(false);
      expect(info.supportsMarkers).toBe(false);
    });
  });
});

describe("PhotoshopHostService", () => {
  let service: PhotoshopHostService;

  beforeEach(() => {
    localStorage.clear();
    service = new PhotoshopHostService();
  });

  it("returns correct app info", () => {
    const info = service.getAppInfo();
    expect(info.id).toBe("photoshop");
    expect(info.name).toBe("Photoshop");
    expect(info.supportsVideo).toBe(false);
    expect(info.supportsAudio).toBe(false);
    expect(info.supportsSequences).toBe(false);
    expect(info.supportsMarkers).toBe(false);
  });

  it("reports unavailable in test environment", () => {
    expect(service.isAvailable()).toBe(false);
  });

  it("returns N/A version when unavailable", () => {
    expect(service.getVersion()).toBe("N/A");
  });

  it("returns null for active sequence when unavailable", async () => {
    const seq = await service.getActiveSequence();
    expect(seq).toBeNull();
  });

  it("returns error for import when unavailable", async () => {
    const result = await service.importFile("/tmp/test.psd");
    expect(result.success).toBe(false);
  });

  it("addMarkers is a no-op", async () => {
    // Should not throw
    await service.addMarkers([{ name: "test", start: 0, comments: "", colorIndex: 0 }]);
  });

  it("manages asset mappings", () => {
    expect(service.isImported("0_img")).toBe(false);

    service.storeMapping("0_img", "/tmp/test.psd");
    expect(service.isImported("0_img")).toBe(true);

    const mappings = service.getAllMappings();
    expect(mappings.get("0_img")).toBe("/tmp/test.psd");

    service.clearMappings();
    expect(service.isImported("0_img")).toBe(false);
  });

  it("persists mappings across instances", () => {
    service.storeMapping("0_img", "/tmp/test.psd");

    const service2 = new PhotoshopHostService();
    expect(service2.isImported("0_img")).toBe(true);
  });
});
