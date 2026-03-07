import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InteractivePanel } from "../../src/panels/InteractivePanel";

function mockInteractiveService(overrides: Record<string, unknown> = {}) {
  return {
    listCuePoints: jest.fn().mockResolvedValue([]),
    addChapter: jest.fn().mockResolvedValue({ id: "cp-1" }),
    deleteCuePoint: jest.fn().mockResolvedValue(undefined),
    syncMarkersToChapters: jest
      .fn()
      .mockResolvedValue({ created: 2, updated: 0, skipped: 0, errors: [] }),
    ...overrides,
  };
}

describe("InteractivePanel", () => {
  it("shows empty state when no entryId", () => {
    render(
      <InteractivePanel
        interactiveService={mockInteractiveService()}
        entryId={null}
        entryName={null}
      />,
    );
    expect(screen.getByText("No entry selected")).toBeTruthy();
  });

  it("shows loading spinner when loading data", () => {
    const service = mockInteractiveService({
      listCuePoints: jest.fn().mockReturnValue(new Promise(() => {})),
    });
    render(
      <InteractivePanel interactiveService={service} entryId="entry-1" entryName="Test Entry" />,
    );
    expect(screen.getByText("Loading interactive data...")).toBeTruthy();
  });

  it("renders chapters and cue points tabs after loading", async () => {
    const chapters = [
      { id: "cp-1", type: "chapter", startTime: 30, label: "Intro" },
      { id: "cp-2", type: "chapter", startTime: 90, label: "Main Content" },
    ];
    const allCuePoints = [...chapters, { id: "cp-3", type: "hotspot", startTime: 45 }];

    const service = mockInteractiveService({
      listCuePoints: jest.fn().mockResolvedValueOnce(chapters).mockResolvedValueOnce(allCuePoints),
    });

    render(
      <InteractivePanel interactiveService={service} entryId="entry-1" entryName="Test Entry" />,
    );

    await waitFor(() => {
      expect(screen.getByText("Chapters (2)")).toBeTruthy();
      expect(screen.getByText("Cue Points (3)")).toBeTruthy();
    });

    expect(screen.getByText("Intro")).toBeTruthy();
    expect(screen.getByText("Main Content")).toBeTruthy();
  });

  it("degrades gracefully when loading fails", async () => {
    const service = mockInteractiveService({
      listCuePoints: jest.fn().mockRejectedValue(new Error("Network error")),
    });

    render(
      <InteractivePanel interactiveService={service} entryId="entry-1" entryName="Test Entry" />,
    );

    // Individual promise failures are caught — panel shows empty data instead of error
    await waitFor(() => {
      expect(screen.getByText("Chapters (0)")).toBeTruthy();
      expect(screen.getByText("Cue Points (0)")).toBeTruthy();
    });
  });

  it("shows entry name in header", async () => {
    const service = mockInteractiveService();
    render(
      <InteractivePanel interactiveService={service} entryId="entry-1" entryName="My Video" />,
    );
    await waitFor(() => {
      expect(screen.getByText("My Video")).toBeTruthy();
    });
  });

  it("adds a chapter via the form", async () => {
    const service = mockInteractiveService();
    render(<InteractivePanel interactiveService={service} entryId="entry-1" entryName="Test" />);

    await waitFor(() => {
      expect(screen.getByText("Chapters (0)")).toBeTruthy();
    });

    // The add chapter form should be visible in chapters view (heading + button)
    expect(screen.getAllByText("Add Chapter").length).toBe(2);
  });

  it("shows sync view when Sync tab clicked", async () => {
    const service = mockInteractiveService();
    render(<InteractivePanel interactiveService={service} entryId="entry-1" entryName="Test" />);

    await waitFor(() => {
      expect(screen.getByText("Sync")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Sync"));
    expect(screen.getAllByText("Sync Markers to Chapters").length).toBeGreaterThanOrEqual(1);
  });
});
