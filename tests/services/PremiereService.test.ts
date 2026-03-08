import { PremiereService } from "../../src/services/PremiereService";
import { MarkerColor } from "../../src/types/premiere";
import { STORAGE_KEY_ASSET_MAPPINGS } from "../../src/utils/constants";

const pp = require("premierepro");

describe("PremiereService", () => {
  let service: PremiereService;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    service = new PremiereService();
  });

  describe("isAvailable", () => {
    it("returns true when premierepro module is available", () => {
      expect(service.isAvailable()).toBe(true);
    });
  });

  describe("getVersion", () => {
    it("returns the mocked Premiere Pro version", () => {
      expect(service.getVersion()).toBe("25.2.0");
    });
  });

  describe("getActiveSequence", () => {
    it("returns sequence info when an active sequence exists", async () => {
      const mockSequence = {
        name: "My Sequence",
        id: "seq-1",
        settings: {
          videoFrameRate: { seconds: 1 / 29.97 },
          videoFrameWidth: 1920,
          videoFrameHeight: 1080,
        },
      };
      const mockProject = {
        getActiveSequence: jest.fn().mockResolvedValue(mockSequence),
      };
      pp.Project.getActiveProject.mockResolvedValue(mockProject);

      const result = await service.getActiveSequence();

      expect(result).toEqual({
        name: "My Sequence",
        id: "seq-1",
        duration: 0,
        frameRate: expect.closeTo(29.97, 1),
        width: 1920,
        height: 1080,
      });
    });

    it("returns null when there is no active sequence", async () => {
      const mockProject = {
        getActiveSequence: jest.fn().mockResolvedValue(null),
      };
      pp.Project.getActiveProject.mockResolvedValue(mockProject);

      const result = await service.getActiveSequence();

      expect(result).toBeNull();
    });
  });

  describe("importFiles", () => {
    it("returns success when import completes", async () => {
      const mockRootItem = {
        children: [],
        createBinAction: jest.fn().mockResolvedValue({
          execute: jest.fn().mockResolvedValue(undefined),
        }),
      };
      const mockProject = {
        name: "TestProject",
        getRootItem: jest.fn().mockResolvedValue(mockRootItem),
        importFiles: jest.fn().mockResolvedValue(undefined),
        executeTransaction: jest.fn().mockImplementation(async (fn: () => Promise<void>) => {
          await fn();
        }),
      };
      pp.Project.getActiveProject.mockResolvedValue(mockProject);

      const result = await service.importFiles(["/path/to/video.mp4"]);

      expect(result).toEqual({ success: true });
      // Without file entries, falls back to string paths
      expect(mockProject.importFiles).toHaveBeenCalledWith(["/path/to/video.mp4"], undefined);
    });

    it("uses UXP File Entry objects when provided", async () => {
      const mockRootItem = {
        children: [],
        createBinAction: jest.fn().mockResolvedValue({
          execute: jest.fn().mockResolvedValue(undefined),
        }),
      };
      const mockProject = {
        name: "TestProject",
        getRootItem: jest.fn().mockResolvedValue(mockRootItem),
        importFiles: jest.fn().mockResolvedValue(undefined),
        executeTransaction: jest.fn().mockImplementation(async (fn: () => Promise<void>) => {
          await fn();
        }),
      };
      pp.Project.getActiveProject.mockResolvedValue(mockProject);

      const fakeEntry = { nativePath: "/tmp/video.mp4", isFile: true };
      const result = await service.importFiles(["/tmp/video.mp4"], [fakeEntry]);

      expect(result).toEqual({ success: true });
      // Should pass Entry objects, not string paths
      expect(mockProject.importFiles).toHaveBeenCalledWith([fakeEntry], undefined);
    });

    it("returns failure with error message when import throws", async () => {
      const mockRootItem = {
        children: [],
        createBinAction: jest.fn().mockResolvedValue({
          execute: jest.fn().mockResolvedValue(undefined),
        }),
      };
      const mockProject = {
        name: "TestProject",
        getRootItem: jest.fn().mockResolvedValue(mockRootItem),
        importFiles: jest.fn().mockRejectedValue(new Error("Disk full")),
        executeTransaction: jest.fn().mockImplementation(async (fn: () => Promise<void>) => {
          await fn();
        }),
      };
      pp.Project.getActiveProject.mockResolvedValue(mockProject);

      const result = await service.importFiles(["/path/to/video.mp4"]);

      expect(result).toEqual({ success: false, error: "Disk full" });
    });
  });

  describe("addMarkers", () => {
    it("adds markers via CompoundAction within a transaction", async () => {
      const mockMarkerAction = { execute: jest.fn() };
      const mockSequenceMarkers = {
        createAddMarkerAction: jest.fn().mockResolvedValue(mockMarkerAction),
      };
      const mockSequence = {
        name: "Seq",
        id: "seq-1",
        getMarkers: jest.fn().mockResolvedValue(mockSequenceMarkers),
        settings: {
          videoFrameRate: { seconds: 1 / 29.97 },
          videoFrameWidth: 1920,
          videoFrameHeight: 1080,
        },
      };
      const mockProject = {
        getActiveSequence: jest.fn().mockResolvedValue(mockSequence),
        executeTransaction: jest.fn().mockImplementation(async (fn: () => Promise<void>) => {
          await fn();
        }),
      };
      pp.Project.getActiveProject.mockResolvedValue(mockProject);

      const markers = [
        { start: 5.0, name: "Chapter 1", comments: "Intro", colorIndex: MarkerColor.GREEN },
        {
          start: 30.0,
          name: "Chapter 2",
          comments: "Main",
          colorIndex: MarkerColor.BLUE,
          duration: 2.0,
        },
      ];

      await service.addMarkers(markers);

      expect(mockSequenceMarkers.createAddMarkerAction).toHaveBeenCalledTimes(2);
      expect(mockSequenceMarkers.createAddMarkerAction).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Chapter 1",
          comments: "Intro",
          colorIndex: MarkerColor.GREEN,
        }),
      );
      expect(mockSequenceMarkers.createAddMarkerAction).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Chapter 2",
          comments: "Main",
          colorIndex: MarkerColor.BLUE,
        }),
      );

      // Verify CompoundAction was constructed and used
      const compoundInstance = pp.CompoundAction.mock.results[0].value;
      expect(compoundInstance.addAction).toHaveBeenCalledTimes(2);
      expect(compoundInstance.execute).toHaveBeenCalled();
    });

    it("throws when no active sequence exists", async () => {
      const mockProject = {
        getActiveSequence: jest.fn().mockResolvedValue(null),
        executeTransaction: jest.fn(),
      };
      pp.Project.getActiveProject.mockResolvedValue(mockProject);

      await expect(
        service.addMarkers([{ start: 0, name: "M", comments: "", colorIndex: MarkerColor.GREEN }]),
      ).rejects.toThrow("No active sequence");
    });
  });

  describe("mapping methods", () => {
    const mapping = {
      entryId: "entry-abc",
      flavorId: "flavor-1",
      localPath: "/tmp/video.mp4",
      importDate: Date.now(),
      isProxy: false,
    };

    it("saves and retrieves a mapping", () => {
      service.saveMapping("entry-abc", mapping);

      expect(service.getMapping("entry-abc")).toEqual(mapping);
    });

    it("isImported returns true for saved entries and false for unknown", () => {
      expect(service.isImported("entry-abc")).toBe(false);

      service.saveMapping("entry-abc", mapping);

      expect(service.isImported("entry-abc")).toBe(true);
    });

    it("getAllMappings returns a copy of all mappings", () => {
      service.saveMapping("entry-abc", mapping);
      const secondMapping = { ...mapping, entryId: "entry-def", localPath: "/tmp/other.mp4" };
      service.saveMapping("entry-def", secondMapping);

      const all = service.getAllMappings();

      expect(all.size).toBe(2);
      expect(all.get("entry-abc")).toEqual(mapping);
      expect(all.get("entry-def")).toEqual(secondMapping);

      // Verify it is a copy, not the internal map
      all.delete("entry-abc");
      expect(service.getMapping("entry-abc")).toEqual(mapping);
    });

    it("clearMappings removes all entries", () => {
      service.saveMapping("entry-abc", mapping);
      service.saveMapping("entry-def", { ...mapping, entryId: "entry-def" });

      service.clearMappings();

      expect(service.isImported("entry-abc")).toBe(false);
      expect(service.isImported("entry-def")).toBe(false);
      expect(service.getAllMappings().size).toBe(0);
    });

    it("persists mappings to localStorage on save", () => {
      service.saveMapping("entry-abc", mapping);

      const stored = localStorage.getItem(STORAGE_KEY_ASSET_MAPPINGS);
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!) as [string, typeof mapping][];
      expect(parsed).toEqual([["entry-abc", mapping]]);
    });

    it("clears localStorage when clearMappings is called", () => {
      service.saveMapping("entry-abc", mapping);
      service.clearMappings();

      const stored = localStorage.getItem(STORAGE_KEY_ASSET_MAPPINGS);
      const parsed = JSON.parse(stored!) as unknown[];
      expect(parsed).toEqual([]);
    });

    it("loads mappings from localStorage on construction", () => {
      const entries: [string, typeof mapping][] = [
        ["entry-xyz", { ...mapping, entryId: "entry-xyz" }],
      ];
      localStorage.setItem(STORAGE_KEY_ASSET_MAPPINGS, JSON.stringify(entries));

      const freshService = new PremiereService();

      expect(freshService.isImported("entry-xyz")).toBe(true);
      expect(freshService.getMapping("entry-xyz")).toEqual(entries[0][1]);
    });
  });
});
