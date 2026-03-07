import { AfterEffectsHostService } from "../../src/services/AfterEffectsHostService";
import { AuditionHostService } from "../../src/services/AuditionHostService";
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
      expect(getHostAppName("aftereffects")).toBe("After Effects");
      expect(getHostAppName("audition")).toBe("Audition");
    });
  });

  describe("createHostService()", () => {
    it("creates AfterEffectsHostService when forced", () => {
      const service = createHostService("aftereffects");
      expect(service.getAppInfo().id).toBe("aftereffects");
    });

    it("creates AuditionHostService when forced", () => {
      const service = createHostService("audition");
      expect(service.getAppInfo().id).toBe("audition");
    });

    it("creates PremiereService-compatible service by default", () => {
      const service = createHostService("premierepro");
      // PremiereService is returned, verify it has the expected interface
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
      const hosts = ["premierepro", "aftereffects", "audition"] as const;
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

    it("Audition host reports no video support", () => {
      const service = createHostService("audition");
      const info = service.getAppInfo();
      expect(info.supportsVideo).toBe(false);
      expect(info.supportsAudio).toBe(true);
    });
  });
});

describe("AfterEffectsHostService", () => {
  let service: AfterEffectsHostService;

  beforeEach(() => {
    localStorage.clear();
    service = new AfterEffectsHostService();
  });

  it("returns correct app info", () => {
    const info = service.getAppInfo();
    expect(info.id).toBe("aftereffects");
    expect(info.name).toBe("After Effects");
    expect(info.supportsVideo).toBe(true);
    expect(info.supportsAudio).toBe(true);
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
    const result = await service.importFile("/tmp/test.mp4");
    expect(result.success).toBe(false);
  });

  it("manages asset mappings", () => {
    expect(service.isImported("0_abc")).toBe(false);

    service.storeMapping("0_abc", "/tmp/test.mp4");
    expect(service.isImported("0_abc")).toBe(true);

    const mappings = service.getAllMappings();
    expect(mappings.get("0_abc")).toBe("/tmp/test.mp4");

    service.clearMappings();
    expect(service.isImported("0_abc")).toBe(false);
  });

  it("persists mappings across instances", () => {
    service.storeMapping("0_abc", "/tmp/test.mp4");

    const service2 = new AfterEffectsHostService();
    expect(service2.isImported("0_abc")).toBe(true);
  });
});

describe("AuditionHostService", () => {
  let service: AuditionHostService;

  beforeEach(() => {
    localStorage.clear();
    service = new AuditionHostService();
  });

  it("returns correct app info", () => {
    const info = service.getAppInfo();
    expect(info.id).toBe("audition");
    expect(info.name).toBe("Audition");
    expect(info.supportsVideo).toBe(false);
    expect(info.supportsAudio).toBe(true);
  });

  it("reports unavailable in test environment", () => {
    expect(service.isAvailable()).toBe(false);
  });

  it("returns null for active sequence when unavailable", async () => {
    const seq = await service.getActiveSequence();
    expect(seq).toBeNull();
  });

  it("returns error for import when unavailable", async () => {
    const result = await service.importFile("/tmp/test.wav");
    expect(result.success).toBe(false);
  });

  it("manages asset mappings", () => {
    service.storeMapping("0_audio", "/tmp/audio.wav");
    expect(service.isImported("0_audio")).toBe(true);

    service.clearMappings();
    expect(service.isImported("0_audio")).toBe(false);
  });
});
