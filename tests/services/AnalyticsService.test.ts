import { AnalyticsService } from "../../src/services/AnalyticsService";
import { KalturaClient } from "../../src/services/KalturaClient";

const mockRequest = jest.fn();
const client = { request: mockRequest } as unknown as KalturaClient;

describe("AnalyticsService", () => {
  let service: AnalyticsService;

  beforeEach(() => {
    service = new AnalyticsService(client);
    jest.clearAllMocks();
  });

  describe("getViewerStats()", () => {
    it("returns viewer statistics", async () => {
      mockRequest.mockResolvedValue({
        columns:
          "plays;unique_viewers;avg_completion_rate;avg_view_duration;peak_concurrent_viewers",
        results: "1500;800;75.5;180;50",
      });

      const stats = await service.getViewerStats("0_abc");
      expect(stats.totalPlays).toBe(1500);
      expect(stats.uniqueViewers).toBe(800);
      expect(stats.avgCompletionRate).toBeCloseTo(75.5);
      expect(stats.avgViewDuration).toBe(180);
      expect(stats.peakConcurrentViewers).toBe(50);
    });
  });

  describe("getEngagementData()", () => {
    it("returns engagement data points", async () => {
      mockRequest.mockResolvedValue({
        columns: "time;plays;drop_off;avg_view_drop_off",
        results: "0;100;5;95\n10;95;10;85\n20;85;15;70",
      });

      const data = await service.getEngagementData("0_abc", "10seconds");
      expect(data.entryId).toBe("0_abc");
      expect(data.dataPoints.length).toBeGreaterThan(0);
    });

    it("calls analytics.query API", async () => {
      mockRequest.mockResolvedValue({ columns: "", results: "" });

      await service.getEngagementData("0_abc");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          service: "analytics",
          action: "query",
        }),
      );
    });
  });

  describe("getTopMoments()", () => {
    it("returns top replayed moments", async () => {
      mockRequest.mockResolvedValue({
        columns: "time;replays;plays",
        results: "20;200;300\n40;180;280\n10;150;250",
      });

      const moments = await service.getTopMoments("0_abc", 3);
      expect(moments.length).toBeLessThanOrEqual(3);
      expect(moments[0].replayCount).toBe(200);
      expect(moments[0].startTime).toBe(20);
    });
  });

  describe("getDropOffPoints()", () => {
    it("identifies significant drop-off points", async () => {
      mockRequest.mockResolvedValue({
        columns: "time;plays;drop_off;avg_view_drop_off",
        results: "0;100;5;95\n10;95;30;65\n20;65;5;60",
      });

      const dropoffs = await service.getDropOffPoints("0_abc", 20);
      for (const point of dropoffs) {
        expect(point.dropOffRate).toBeGreaterThanOrEqual(20);
      }
    });
  });
});
