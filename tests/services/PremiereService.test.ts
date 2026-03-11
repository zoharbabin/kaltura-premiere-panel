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
        guid: { toString: () => "seq-1" },
        getEndTime: jest.fn().mockResolvedValue(null),
        getSettings: jest.fn().mockResolvedValue({
          videoFrameRate: { seconds: 1 / 29.97 },
          videoFrameWidth: 1920,
          videoFrameHeight: 1080,
        }),
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
        getItems: jest.fn().mockResolvedValue([]),
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
      // importFiles(filePaths, suppressUI=true, targetBin=undefined)
      expect(mockProject.importFiles).toHaveBeenCalledWith(
        ["/path/to/video.mp4"],
        true,
        null,
        false,
      );
    });

    it("returns failure for invalid file paths", async () => {
      const result = await service.importFiles([undefined as unknown as string]);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining("Invalid file path"),
      });
    });

    it("retries to root when bin import fails", async () => {
      const mockBin = {
        name: "Kaltura Assets",
        type: 2,
        getItems: jest.fn().mockResolvedValue([]),
      };
      const mockRootItem = {
        getItems: jest.fn().mockResolvedValue([mockBin]),
        createBinAction: jest.fn(),
      };
      const importFiles = jest
        .fn()
        .mockRejectedValueOnce(new Error("Illegal Parameter type"))
        .mockResolvedValueOnce(true);
      const mockProject = {
        name: "TestProject",
        getRootItem: jest.fn().mockResolvedValue(mockRootItem),
        importFiles,
        executeTransaction: jest.fn(),
      };
      pp.Project.getActiveProject.mockResolvedValue(mockProject);

      const result = await service.importFiles(["/path/to/video.mp4"]);

      expect(result).toEqual({ success: true });
      // First call with bin, then retry with null
      expect(importFiles).toHaveBeenCalledTimes(2);
      expect(importFiles).toHaveBeenLastCalledWith(["/path/to/video.mp4"], true, null, false);
    });

    it("falls back to minimal importFiles call when all retries fail", async () => {
      const mockBin = {
        name: "Kaltura Assets",
        type: 2,
        getItems: jest.fn().mockResolvedValue([]),
      };
      const mockRootItem = {
        getItems: jest.fn().mockResolvedValue([mockBin]),
        createBinAction: jest.fn(),
      };
      const importFiles = jest
        .fn()
        .mockRejectedValueOnce(new Error("Illegal Parameter type"))
        .mockRejectedValueOnce(new Error("Illegal Parameter type"))
        .mockResolvedValueOnce(true);
      const mockProject = {
        name: "TestProject",
        getRootItem: jest.fn().mockResolvedValue(mockRootItem),
        importFiles,
        executeTransaction: jest.fn(),
      };
      pp.Project.getActiveProject.mockResolvedValue(mockProject);

      const result = await service.importFiles(["/path/to/video.mp4"]);

      expect(result).toEqual({ success: true });
      expect(importFiles).toHaveBeenCalledTimes(3);
      // Final call: minimal params (just filePaths)
      expect(importFiles).toHaveBeenLastCalledWith(["/path/to/video.mp4"]);
    });

    it("returns failure with error message when all import attempts throw", async () => {
      const mockRootItem = {
        getItems: jest.fn().mockResolvedValue([]),
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

  describe("importTranscriptToClip", () => {
    const mapping = {
      entryId: "entry-abc",
      flavorId: "flavor-1",
      localPath: "/tmp/video.mp4",
      importDate: Date.now(),
      isProxy: false,
    };

    const segments = [
      { startTime: 0, endTime: 5, text: "Hello world" },
      { startTime: 5, endTime: 10, text: "Second segment here" },
    ];

    function setupProjectMock(overrides?: {
      lockedAccessReturn?: boolean;
      findClipByName?: boolean;
    }) {
      const mockClip = {
        name: "video.mp4",
        type: 1,
        getMediaFilePath: jest.fn().mockResolvedValue("/tmp/video.mp4"),
      };
      const mockRootItem = {
        name: "Root",
        type: 3,
        getItems: jest
          .fn()
          .mockResolvedValue(overrides?.findClipByName === false ? [] : [mockClip]),
      };
      const mockProject = {
        name: "TestProject",
        getRootItem: jest.fn().mockResolvedValue(mockRootItem),
        lockedAccess: jest.fn().mockImplementation((fn: () => void) => {
          fn();
          return overrides?.lockedAccessReturn ?? true;
        }),
        executeTransaction: jest.fn().mockImplementation((fn: (ca: unknown) => void) => {
          const compoundAction = { addAction: jest.fn() };
          fn(compoundAction);
        }),
      };
      pp.Project.getActiveProject.mockResolvedValue(mockProject);
      return { mockProject, mockClip, mockRootItem };
    }

    it("returns error when video is not imported (no mapping)", async () => {
      const result = await service.importTranscriptToClip("unknown-entry", segments);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining("not imported"),
      });
    });

    it("returns error when clip cannot be found in project", async () => {
      service.saveMapping("entry-abc", mapping);
      setupProjectMock({ findClipByName: false });

      const result = await service.importTranscriptToClip("entry-abc", segments);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining("Could not find"),
      });
    });

    it("imports transcript successfully via TextSegments.importFromJSON callback", async () => {
      service.saveMapping("entry-abc", mapping);
      setupProjectMock();

      const result = await service.importTranscriptToClip("entry-abc", segments);

      expect(result).toEqual({ success: true });
      expect(pp.TextSegments.importFromJSON).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
      );
      expect(pp.Transcript.createImportTextSegmentsAction).toHaveBeenCalled();
    });

    it("builds correct Adobe transcript JSON with word-level timing", async () => {
      service.saveMapping("entry-abc", mapping);
      setupProjectMock();

      await service.importTranscriptToClip("entry-abc", segments);

      const jsonArg = pp.TextSegments.importFromJSON.mock.calls[0][0];
      const parsed = JSON.parse(jsonArg);

      expect(parsed.language).toBe("en-us");
      expect(parsed.segments).toHaveLength(2);
      expect(parsed.speakers).toHaveLength(1);
      expect(parsed.speakers[0].id).toMatch(/^[0-9a-f-]+$/);

      // First segment: "Hello world" → 2 words
      const seg0 = parsed.segments[0];
      expect(seg0.start).toBe(0);
      expect(seg0.duration).toBe(5);
      expect(seg0.words).toHaveLength(2);
      expect(seg0.words[0].text).toBe("Hello");
      expect(seg0.words[1].text).toBe("world");
      expect(seg0.words[1].eos).toBe(true);
    });

    it("returns failure when lockedAccess returns false", async () => {
      service.saveMapping("entry-abc", mapping);
      setupProjectMock({ lockedAccessReturn: false });

      const result = await service.importTranscriptToClip("entry-abc", segments);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining("Failed to import"),
      });
    });

    it("returns failure when TextSegments.importFromJSON throws", async () => {
      service.saveMapping("entry-abc", mapping);
      setupProjectMock();
      pp.TextSegments.importFromJSON.mockImplementationOnce(() => {
        throw new Error("Parse error");
      });

      const result = await service.importTranscriptToClip("entry-abc", segments);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining("Failed to import"),
      });
    });

    it("maps speaker IDs to unique UUIDs", async () => {
      service.saveMapping("entry-abc", mapping);
      setupProjectMock();

      const segmentsWithSpeakers = [
        { startTime: 0, endTime: 5, text: "Hello", speakerId: "spk-1" },
        { startTime: 5, endTime: 10, text: "World", speakerId: "spk-2" },
        { startTime: 10, endTime: 15, text: "Again", speakerId: "spk-1" },
      ];

      await service.importTranscriptToClip("entry-abc", segmentsWithSpeakers);

      const jsonArg = pp.TextSegments.importFromJSON.mock.calls[0][0];
      const parsed = JSON.parse(jsonArg);

      expect(parsed.speakers).toHaveLength(3); // default + 2 speakers
      const speakerIds = new Set(parsed.speakers.map((s: { id: string }) => s.id));
      expect(speakerIds.size).toBe(3); // All unique
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
