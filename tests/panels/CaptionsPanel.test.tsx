import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { CaptionsPanel } from "../../src/panels/CaptionsPanel";
import { KalturaCaptionType, KalturaVendorTaskStatus } from "../../src/types/kaltura";

const mockCaptions = [
  {
    id: "cap-1",
    language: "en",
    label: "English",
    format: KalturaCaptionType.SRT,
    isDefault: true,
    createdAt: 1700000000,
    accuracy: 95,
  },
  {
    id: "cap-2",
    language: "es",
    label: "Spanish",
    format: KalturaCaptionType.WEBVTT,
    isDefault: false,
    createdAt: 1700001000,
  },
];

const mockTasks = [
  {
    id: "task-1",
    entryId: "e-1",
    catalogItemId: 100,
    status: KalturaVendorTaskStatus.PROCESSING,
    sourceLanguage: "en",
    createdAt: 1700002000,
  },
];

const mockCatalogItems = [
  { id: 100, name: "Machine Captioning", serviceType: 2, serviceFeature: 1, turnAroundTime: 30 },
  { id: 101, name: "Human Captioning", serviceType: 1, serviceFeature: 1, turnAroundTime: 1440 },
  { id: 102, name: "Machine Translation", serviceType: 2, serviceFeature: 2, turnAroundTime: 15 },
];

function mockCaptionService(overrides: Record<string, unknown> = {}) {
  return {
    listCaptions: jest.fn().mockResolvedValue(mockCaptions),
    listTasks: jest.fn().mockResolvedValue(mockTasks),
    listReachCatalogItems: jest.fn().mockResolvedValue(mockCatalogItems),
    triggerCaptioning: jest.fn().mockResolvedValue({
      id: "task-new",
      entryId: "e-1",
      catalogItemId: 100,
      status: KalturaVendorTaskStatus.PENDING,
      sourceLanguage: "en",
      createdAt: Date.now() / 1000,
    }),
    triggerTranslation: jest.fn().mockResolvedValue({
      id: "task-tr",
      entryId: "e-1",
      catalogItemId: 102,
      status: KalturaVendorTaskStatus.PENDING,
      sourceLanguage: "en",
      targetLanguage: "fr",
      createdAt: Date.now() / 1000,
    }),
    getTaskStatusLabel: jest.fn().mockImplementation((status: number) => {
      const labels: Record<number, string> = {
        [KalturaVendorTaskStatus.PENDING]: "Pending",
        [KalturaVendorTaskStatus.PROCESSING]: "Processing",
        [KalturaVendorTaskStatus.READY]: "Ready",
        [KalturaVendorTaskStatus.ERROR]: "Error",
      };
      return labels[status] || "Unknown";
    }),
    ...overrides,
  } as never;
}

describe("CaptionsPanel", () => {
  it("shows empty state when no entryId", () => {
    render(<CaptionsPanel captionService={mockCaptionService()} entryId={null} entryName={null} />);
    expect(screen.getByText("No entry selected")).toBeTruthy();
  });

  it("shows loading spinner while fetching", () => {
    const service = mockCaptionService({
      listCaptions: jest.fn().mockReturnValue(new Promise(() => {})),
    });
    render(<CaptionsPanel captionService={service} entryId="e-1" entryName="Video" />);
    expect(screen.getByText("Loading captions...")).toBeTruthy();
  });

  it("renders caption tracks after loading", async () => {
    const service = mockCaptionService();
    render(<CaptionsPanel captionService={service} entryId="e-1" entryName="Test Video" />);

    await waitFor(() => {
      expect(screen.getByText("Tracks (2)")).toBeTruthy();
    });

    expect(screen.getByText(/EN — English/)).toBeTruthy();
    expect(screen.getByText(/ES — Spanish/)).toBeTruthy();
    expect(screen.getByText("Default")).toBeTruthy();
  });

  it("shows pending tasks with status", async () => {
    const service = mockCaptionService();
    render(<CaptionsPanel captionService={service} entryId="e-1" entryName="Video" />);

    await waitFor(() => {
      expect(screen.getByText("Processing")).toBeTruthy();
    });
  });

  it("shows order captions tab", async () => {
    const service = mockCaptionService();
    render(<CaptionsPanel captionService={service} entryId="e-1" entryName="Video" />);

    await waitFor(() => {
      expect(screen.getByText("Order Captions")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Order Captions"));
    expect(screen.getByText("Source Language")).toBeTruthy();
    expect(screen.getByText("Service Level")).toBeTruthy();
  });

  it("shows translate tab when captions exist", async () => {
    const service = mockCaptionService();
    render(<CaptionsPanel captionService={service} entryId="e-1" entryName="Video" />);

    await waitFor(() => {
      expect(screen.getByText("Translate")).toBeTruthy();
    });
  });

  it("hides translate tab when no captions", async () => {
    const service = mockCaptionService({
      listCaptions: jest.fn().mockResolvedValue([]),
      listTasks: jest.fn().mockResolvedValue([]),
    });
    render(<CaptionsPanel captionService={service} entryId="e-1" entryName="Video" />);

    await waitFor(() => {
      expect(screen.getByText("Tracks (0)")).toBeTruthy();
    });
    expect(screen.queryByText("Translate")).toBeNull();
  });

  it("degrades gracefully when a data source fails", async () => {
    const service = mockCaptionService({
      listCaptions: jest.fn().mockRejectedValue(new Error("API error")),
    });
    render(<CaptionsPanel captionService={service} entryId="e-1" entryName="Video" />);

    // Individual promise failure is caught — panel shows empty tracks instead of error
    await waitFor(() => {
      expect(screen.getByText("Tracks (0)")).toBeTruthy();
    });
  });
});
