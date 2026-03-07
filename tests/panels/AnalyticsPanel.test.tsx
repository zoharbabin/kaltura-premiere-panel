import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AnalyticsPanel } from "../../src/panels/AnalyticsPanel";

const mockStats = {
  totalPlays: 1500,
  uniqueViewers: 800,
  avgCompletionRate: 72,
  avgViewDuration: 185,
  peakConcurrentViewers: 45,
};

const mockMoments = [
  { startTime: 30, endTime: 45, replayCount: 120, label: "Key Insight" },
  { startTime: 90, endTime: 100, replayCount: 85 },
];

const mockDropoffs = [{ timestamp: 60, dropOffRate: 25, viewersBefore: 200, viewersAfter: 150 }];

function mockAnalyticsService(overrides: Record<string, unknown> = {}) {
  return {
    getViewerStats: jest.fn().mockResolvedValue(mockStats),
    getTopMoments: jest.fn().mockResolvedValue(mockMoments),
    getDropOffPoints: jest.fn().mockResolvedValue(mockDropoffs),
    ...overrides,
  };
}

describe("AnalyticsPanel", () => {
  it("shows empty state when no entryId", () => {
    render(
      <AnalyticsPanel analyticsService={mockAnalyticsService()} entryId={null} entryName={null} />,
    );
    expect(screen.getByText("No entry selected")).toBeTruthy();
  });

  it("shows loading spinner while fetching data", () => {
    const service = mockAnalyticsService({
      getViewerStats: jest.fn().mockReturnValue(new Promise(() => {})),
      getTopMoments: jest.fn().mockReturnValue(new Promise(() => {})),
      getDropOffPoints: jest.fn().mockReturnValue(new Promise(() => {})),
    });
    render(<AnalyticsPanel analyticsService={service} entryId="e-1" entryName="Video" />);
    expect(screen.getByText("Loading analytics...")).toBeTruthy();
  });

  it("renders overview stats after loading", async () => {
    const service = mockAnalyticsService();
    render(<AnalyticsPanel analyticsService={service} entryId="e-1" entryName="My Video" />);

    await waitFor(() => {
      expect(screen.getByText("1,500")).toBeTruthy();
    });
    expect(screen.getByText("Total Plays")).toBeTruthy();
    expect(screen.getByText("800")).toBeTruthy();
    expect(screen.getByText("72%")).toBeTruthy();
  });

  it("renders top moments tab", async () => {
    const service = mockAnalyticsService();
    render(<AnalyticsPanel analyticsService={service} entryId="e-1" entryName="Video" />);

    await waitFor(() => {
      expect(screen.getByText("Top Moments (2)")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Top Moments (2)"));
    expect(screen.getByText("120 replays")).toBeTruthy();
    expect(screen.getByText("Key Insight")).toBeTruthy();
  });

  it("renders drop-off tab", async () => {
    const service = mockAnalyticsService();
    render(<AnalyticsPanel analyticsService={service} entryId="e-1" entryName="Video" />);

    await waitFor(() => {
      expect(screen.getByText("Drop-off (1)")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Drop-off (1)"));
    expect(screen.getByText("-25% drop")).toBeTruthy();
  });

  it("displays error on fetch failure", async () => {
    const service = mockAnalyticsService({
      getViewerStats: jest.fn().mockRejectedValue(new Error("API error")),
    });
    render(<AnalyticsPanel analyticsService={service} entryId="e-1" entryName="Video" />);

    await waitFor(() => {
      expect(screen.getByText("API error")).toBeTruthy();
    });
  });
});
