import { InteractiveService } from "../../src/services/InteractiveService";
import { KalturaClient } from "../../src/services/KalturaClient";

const mockRequest = jest.fn();
const client = { request: mockRequest } as unknown as KalturaClient;

describe("InteractiveService", () => {
  let service: InteractiveService;

  beforeEach(() => {
    service = new InteractiveService(client);
    jest.clearAllMocks();
  });

  describe("addChapter()", () => {
    it("creates a chapter cue point", async () => {
      mockRequest.mockResolvedValue({ id: "cue1", entryId: "0_abc" });

      const result = await service.addChapter("0_abc", {
        title: "Introduction",
        startTime: 0,
        description: "Opening segment",
      });

      expect(result.id).toBe("cue1");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          service: "cuePoint_cuePoint",
          action: "add",
        }),
      );
    });
  });

  describe("addQuizPoint()", () => {
    it("creates a quiz cue point with answers", async () => {
      mockRequest.mockResolvedValue({ id: "quiz1" });

      const result = await service.addQuizPoint("0_abc", {
        question: "What color is the sky?",
        startTime: 30,
        answers: [
          { text: "Blue", isCorrect: true },
          { text: "Red", isCorrect: false },
        ],
      });

      expect(result.id).toBe("quiz1");
    });
  });

  describe("addHotspot()", () => {
    it("creates a hotspot cue point", async () => {
      mockRequest.mockResolvedValue({ id: "hot1" });

      const result = await service.addHotspot("0_abc", {
        startTime: 10,
        endTime: 20,
        label: "Click here",
        link: "https://example.com",
        x: 50,
        y: 50,
        width: 100,
        height: 50,
      });

      expect(result.id).toBe("hot1");
    });
  });

  describe("addCTA()", () => {
    it("creates a CTA cue point", async () => {
      mockRequest.mockResolvedValue({ id: "cta1" });

      const result = await service.addCTA("0_abc", {
        startTime: 60,
        label: "Sign up now",
        url: "https://example.com/signup",
        buttonText: "Sign Up",
      });

      expect(result.id).toBe("cta1");
    });
  });

  describe("listCuePoints()", () => {
    it("lists all cue points for an entry", async () => {
      mockRequest.mockResolvedValue({
        objects: [
          { id: "cue1", entryId: "0_abc", tags: "chapter" },
          { id: "cue2", entryId: "0_abc", tags: "quiz" },
        ],
        totalCount: 2,
      });

      const result = await service.listCuePoints("0_abc");
      expect(result).toHaveLength(2);
    });

    it("filters by type", async () => {
      mockRequest.mockResolvedValue({ objects: [], totalCount: 0 });

      await service.listCuePoints("0_abc", "chapter");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            filter: expect.objectContaining({
              tagsLike: "premiere-panel-chapter",
            }),
          }),
        }),
      );
    });
  });

  describe("deleteCuePoint()", () => {
    it("deletes a cue point", async () => {
      mockRequest.mockResolvedValue({});

      await service.deleteCuePoint("cue1");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          service: "cuePoint_cuePoint",
          action: "delete",
          params: { id: "cue1" },
        }),
      );
    });
  });

  describe("listLiveRecordings()", () => {
    it("lists recordings for a live entry", async () => {
      mockRequest.mockResolvedValue({
        objects: [{ id: "rec1", duration: 3600, createdAt: 1700000000, status: 2 }],
        totalCount: 1,
      });

      const result = await service.listLiveRecordings("0_live");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("rec1");
    });
  });

  describe("convertToVod()", () => {
    it("converts recording to VOD", async () => {
      mockRequest.mockResolvedValue({ id: "0_vod", name: "VOD Entry" });

      const result = await service.convertToVod("rec1", 10, 3590);
      expect(result.id).toBe("0_vod");
    });
  });

  describe("syncMarkersToChapters()", () => {
    it("creates chapter cue points from markers", async () => {
      mockRequest.mockResolvedValue({ id: "cue_new" });

      const result = await service.syncMarkersToChapters("0_abc", [
        { name: "Intro", start: 0, comments: "Introduction", colorIndex: 0 },
        { name: "Main", start: 60, comments: "Main section", colorIndex: 0 },
      ]);

      expect(result.created).toBe(2);
      expect(mockRequest).toHaveBeenCalledTimes(2);
    });
  });
});
