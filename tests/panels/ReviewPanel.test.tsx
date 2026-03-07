import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { ReviewPanel } from "../../src/panels/ReviewPanel";

const mockAnnotations = [
  {
    id: "ann-1",
    entryId: "e-1",
    text: "Great intro sequence",
    startTime: 10,
    endTime: 20,
    userId: "reviewer1",
    createdAt: 1700000000,
    updatedAt: 1700000000,
  },
  {
    id: "ann-2",
    entryId: "e-1",
    text: "Audio levels too low here",
    startTime: 45,
    userId: "reviewer2",
    createdAt: 1700001000,
    updatedAt: 1700001000,
  },
  {
    id: "reply-1",
    entryId: "e-1",
    text: "Fixed!",
    startTime: 0,
    userId: "editor1",
    parentId: "ann-2",
    createdAt: 1700002000,
    updatedAt: 1700002000,
  },
];

function mockReviewService(overrides: Record<string, unknown> = {}) {
  return {
    listAnnotations: jest.fn().mockResolvedValue(mockAnnotations),
    addAnnotation: jest.fn().mockResolvedValue({
      id: "ann-new",
      entryId: "e-1",
      text: "New comment",
      startTime: 0,
      userId: "me",
      createdAt: Date.now() / 1000,
      updatedAt: Date.now() / 1000,
    }),
    deleteAnnotation: jest.fn().mockResolvedValue(undefined),
    syncToMarkers: jest.fn().mockResolvedValue({ created: 2, updated: 0, skipped: 0, errors: [] }),
    syncFromMarkers: jest
      .fn()
      .mockResolvedValue({ created: 1, updated: 0, skipped: 0, errors: [] }),
    ...overrides,
  };
}

describe("ReviewPanel", () => {
  it("shows empty state when no entryId", () => {
    render(<ReviewPanel reviewService={mockReviewService()} entryId={null} entryName={null} />);
    expect(screen.getByText("No entry selected")).toBeTruthy();
  });

  it("shows loading spinner while fetching annotations", () => {
    const service = mockReviewService({
      listAnnotations: jest.fn().mockReturnValue(new Promise(() => {})),
    });
    render(<ReviewPanel reviewService={service} entryId="e-1" entryName="Video" />);
    expect(screen.getByText("Loading comments...")).toBeTruthy();
  });

  it("renders annotations after loading", async () => {
    const service = mockReviewService();
    render(<ReviewPanel reviewService={service} entryId="e-1" entryName="Test Video" />);

    await waitFor(() => {
      expect(screen.getByText("Great intro sequence")).toBeTruthy();
    });
    expect(screen.getByText("Audio levels too low here")).toBeTruthy();
    expect(screen.getByText("reviewer1")).toBeTruthy();
    expect(screen.getByText("reviewer2")).toBeTruthy();
  });

  it("renders replies nested under parent", async () => {
    const service = mockReviewService();
    render(<ReviewPanel reviewService={service} entryId="e-1" entryName="Video" />);

    await waitFor(() => {
      expect(screen.getByText("Fixed!")).toBeTruthy();
    });
    expect(screen.getByText("editor1")).toBeTruthy();
  });

  it("shows entry name in header", async () => {
    const service = mockReviewService();
    render(<ReviewPanel reviewService={service} entryId="e-1" entryName="My Video" />);

    await waitFor(() => {
      expect(screen.getByText("My Video")).toBeTruthy();
    });
  });

  it("shows sync buttons", async () => {
    const service = mockReviewService();
    render(<ReviewPanel reviewService={service} entryId="e-1" entryName="Video" />);

    await waitFor(() => {
      expect(screen.getByText("Pull to Markers")).toBeTruthy();
    });
    expect(screen.getByText("Push from Markers")).toBeTruthy();
  });

  it("shows error when loading fails", async () => {
    const service = mockReviewService({
      listAnnotations: jest.fn().mockRejectedValue(new Error("Fetch failed")),
    });
    render(<ReviewPanel reviewService={service} entryId="e-1" entryName="Video" />);

    await waitFor(() => {
      expect(screen.getByText("Fetch failed")).toBeTruthy();
    });
  });

  it("shows empty state for no annotations", async () => {
    const service = mockReviewService({
      listAnnotations: jest.fn().mockResolvedValue([]),
    });
    render(<ReviewPanel reviewService={service} entryId="e-1" entryName="Video" />);

    await waitFor(() => {
      expect(screen.getByText("No comments")).toBeTruthy();
    });
  });
});
