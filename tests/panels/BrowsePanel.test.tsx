import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { BrowsePanel } from "../../src/panels/BrowsePanel";
import {
  KalturaMediaEntry,
  KalturaEntryStatus,
  KalturaMediaType,
  KalturaFlavorAsset,
} from "../../src/types/kaltura";

function makeEntry(overrides: Partial<KalturaMediaEntry> = {}): KalturaMediaEntry {
  return {
    id: "0_entry1",
    name: "Test Video",
    description: "A test",
    tags: "test",
    partnerId: 123,
    status: KalturaEntryStatus.READY,
    mediaType: KalturaMediaType.VIDEO,
    duration: 120,
    createdAt: 1700000000,
    updatedAt: 1700000000,
    ...overrides,
  };
}

function makeFlavor(overrides: Partial<KalturaFlavorAsset> = {}): KalturaFlavorAsset {
  return {
    id: "flv-1",
    entryId: "0_entry1",
    partnerId: 123,
    status: 2,
    size: 50000,
    width: 1920,
    height: 1080,
    bitrate: 4000,
    frameRate: 29.97,
    fileExt: "mp4",
    isWeb: true,
    isOriginal: false,
    ...overrides,
  };
}

const entries = [
  makeEntry({ id: "0_entry1", name: "Video One", duration: 60 }),
  makeEntry({ id: "0_entry2", name: "Video Two", duration: 180 }),
  makeEntry({ id: "0_entry3", name: "Video Three", duration: 300 }),
];

function mockMediaService(overrides: Record<string, unknown> = {}) {
  return {
    list: jest.fn().mockResolvedValue({ objects: entries, totalCount: 3 }),
    getEntryDetails: jest.fn().mockResolvedValue({
      entry: entries[0],
      flavors: [makeFlavor()],
      captions: [],
    }),
    ...overrides,
  };
}

function mockMetadataService() {
  return {
    updateEntry: jest.fn(),
    searchTags: jest.fn().mockResolvedValue([]),
    getCategories: jest.fn().mockResolvedValue([]),
  };
}

/** Simulate input on a custom element (sp-search etc.) */
function simulateInput(element: Element, value: string) {
  (element as unknown as { value: string }).value = value;
  const event = new Event("input", { bubbles: true });
  element.dispatchEvent(event);
}

const defaultProps = {
  mediaService: mockMediaService() as never,
  metadataService: mockMetadataService() as never,
  partnerId: 123,
  isImported: jest.fn().mockReturnValue(false),
  onSelectEntry: jest.fn(),
  onImportEntry: jest.fn(),
};

describe("BrowsePanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Initial render and loading ---

  it("shows loading spinner initially", () => {
    const service = mockMediaService({
      list: jest.fn().mockReturnValue(new Promise(() => {})),
    });
    render(<BrowsePanel {...defaultProps} mediaService={service as never} />);
    expect(screen.getByText("Loading assets...")).toBeTruthy();
  });

  it("renders asset grid after loading", async () => {
    render(<BrowsePanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Video One")).toBeTruthy();
    });
    expect(screen.getByText("Video Two")).toBeTruthy();
    expect(screen.getByText("Video Three")).toBeTruthy();
  });

  it("shows result count after loading", async () => {
    render(<BrowsePanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Showing 3 of 3 results")).toBeTruthy();
    });
  });

  // --- Empty state ---

  it("shows empty state when no assets exist", async () => {
    const service = mockMediaService({
      list: jest.fn().mockResolvedValue({ objects: [], totalCount: 0 }),
    });
    render(<BrowsePanel {...defaultProps} mediaService={service as never} />);
    await waitFor(() => {
      expect(screen.getByText("No assets yet")).toBeTruthy();
    });
    expect(screen.getByText("Your Kaltura library is empty.")).toBeTruthy();
  });

  it("shows 'No results found' when search yields nothing", async () => {
    const service = mockMediaService({
      list: jest.fn().mockResolvedValue({ objects: [], totalCount: 0 }),
    });
    jest.useFakeTimers();
    const { container } = render(<BrowsePanel {...defaultProps} mediaService={service as never} />);

    await act(async () => {
      await Promise.resolve(); // Flush initial load
    });

    const searchInput = container.querySelector("sp-search")!;
    await act(async () => {
      simulateInput(searchInput, "nonexistent");
      jest.advanceTimersByTime(400); // Past debounce
    });

    await waitFor(() => {
      expect(screen.getByText("No results found")).toBeTruthy();
    });
    jest.useRealTimers();
  });

  // --- Error handling ---

  it("shows error banner on API failure with retry", async () => {
    const service = mockMediaService({
      list: jest.fn().mockRejectedValue(new Error("Network fail")),
    });
    render(<BrowsePanel {...defaultProps} mediaService={service as never} />);

    await waitFor(() => {
      expect(screen.getByText("Network fail")).toBeTruthy();
    });
  });

  // --- View toggle ---

  it("switches between grid and list view", async () => {
    const { container } = render(<BrowsePanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Video One")).toBeTruthy();
    });

    // Toggle to list view
    const toggleBtn = container.querySelector('sp-action-button[title="Switch to list view"]');
    expect(toggleBtn).toBeTruthy();
    fireEvent.click(toggleBtn!);

    // After toggle, the button title changes
    const listToggleBtn = container.querySelector('sp-action-button[title="Switch to grid view"]');
    expect(listToggleBtn).toBeTruthy();
  });

  // --- Entry click → detail flyout ---

  it("opens detail flyout when entry is clicked", async () => {
    render(<BrowsePanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Video One")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Video One"));
    });

    await waitFor(() => {
      expect(screen.getByText("Details")).toBeTruthy();
      expect(screen.getByText("Import to Project")).toBeTruthy();
      expect(screen.getByText("Edit Metadata")).toBeTruthy();
    });
  });

  it("calls onSelectEntry when entry is clicked", async () => {
    const onSelectEntry = jest.fn();
    render(<BrowsePanel {...defaultProps} onSelectEntry={onSelectEntry} />);
    await waitFor(() => {
      expect(screen.getByText("Video One")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Video One"));
    });

    expect(onSelectEntry).toHaveBeenCalledWith(entries[0]);
  });

  it("returns to grid from detail flyout via Back button", async () => {
    render(<BrowsePanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Video One")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Video One"));
    });

    await waitFor(() => {
      expect(screen.getByText(/Back/)).toBeTruthy();
    });

    fireEvent.click(screen.getByText(/Back/));

    await waitFor(() => {
      expect(screen.getByText("Video One")).toBeTruthy();
      expect(screen.getByText("Video Two")).toBeTruthy();
    });
  });

  // --- Import behavior ---

  it("shows 'Re-import to Project' when entry is already imported", async () => {
    const isImported = jest.fn().mockReturnValue(true);
    render(<BrowsePanel {...defaultProps} isImported={isImported} />);
    await waitFor(() => {
      expect(screen.getByText("Video One")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Video One"));
    });

    await waitFor(() => {
      expect(screen.getByText("Re-import to Project")).toBeTruthy();
    });
  });

  // --- Content hold governance ---

  it("shows HOLD badge on held entries in grid", async () => {
    const heldEntry = makeEntry({
      id: "0_held",
      name: "Held Video",
      adminTags: "content_hold,hold_reason:legal_review",
    });
    const service = mockMediaService({
      list: jest.fn().mockResolvedValue({ objects: [heldEntry], totalCount: 1 }),
    });
    render(<BrowsePanel {...defaultProps} mediaService={service as never} />);
    await waitFor(() => {
      expect(screen.getByText("HOLD")).toBeTruthy();
    });
  });

  it("shows hold reason in detail flyout", async () => {
    const heldEntry = makeEntry({
      id: "0_held",
      name: "Held Video",
      adminTags: "content_hold,hold_reason:legal_review",
    });
    const service = mockMediaService({
      list: jest.fn().mockResolvedValue({ objects: [heldEntry], totalCount: 1 }),
      getEntryDetails: jest.fn().mockResolvedValue({
        entry: heldEntry,
        flavors: [makeFlavor()],
        captions: [],
      }),
    });
    render(<BrowsePanel {...defaultProps} mediaService={service as never} />);
    await waitFor(() => {
      expect(screen.getByText("Held Video")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Held Video"));
    });

    await waitFor(() => {
      expect(screen.getByText("Content Hold")).toBeTruthy();
      expect(screen.getByText(/legal_review/)).toBeTruthy();
      expect(screen.getByText("Import Blocked (Hold)")).toBeTruthy();
    });
  });

  // --- License expiry governance ---

  it("shows EXPIRED badge on entries with expired license", async () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredEntry = makeEntry({
      id: "0_exp",
      name: "Expired Video",
      endDate: now - 86400, // Expired yesterday
    });
    const service = mockMediaService({
      list: jest.fn().mockResolvedValue({ objects: [expiredEntry], totalCount: 1 }),
    });
    render(<BrowsePanel {...defaultProps} mediaService={service as never} />);
    await waitFor(() => {
      expect(screen.getByText("EXPIRED")).toBeTruthy();
    });
  });

  it("shows EXPIRING badge on entries expiring within 7 days", async () => {
    const now = Math.floor(Date.now() / 1000);
    const expiringEntry = makeEntry({
      id: "0_soon",
      name: "Expiring Video",
      endDate: now + 3 * 86400, // 3 days from now
    });
    const service = mockMediaService({
      list: jest.fn().mockResolvedValue({ objects: [expiringEntry], totalCount: 1 }),
    });
    render(<BrowsePanel {...defaultProps} mediaService={service as never} />);
    await waitFor(() => {
      expect(screen.getByText("EXPIRING")).toBeTruthy();
    });
  });

  // --- Imported indicator ---

  it("shows imported indicator on imported entries", async () => {
    const isImported = jest.fn().mockImplementation((id: string) => id === "0_entry1");
    render(<BrowsePanel {...defaultProps} isImported={isImported} />);
    await waitFor(() => {
      expect(screen.getByText("Video One")).toBeTruthy();
    });
    // The checkmark \u2713 is JSX text content (renders as literal character)
    const checkmarks = screen.getAllByText(/\u2713/);
    expect(checkmarks.length).toBeGreaterThanOrEqual(1);
  });

  // --- Filter bar ---

  it("renders filter bar", async () => {
    render(<BrowsePanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Filters")).toBeTruthy();
    });
  });

  // --- Offline mode ---

  it("shows offline banner when offlineService reports offline", async () => {
    const offlineService = {
      getIsOnline: jest.fn().mockReturnValue(false),
      isCached: jest.fn().mockReturnValue(false),
      cacheEntries: jest.fn(),
      getCachedEntries: jest.fn().mockReturnValue([{ entry: entries[0], cachedAt: Date.now() }]),
      getSyncStatus: jest
        .fn()
        .mockReturnValue({ isOnline: false, pendingOperations: 2, cacheEntryCount: 1 }),
      onStatusChange: jest.fn().mockReturnValue(() => {}),
    };
    render(<BrowsePanel {...defaultProps} offlineService={offlineService} />);
    await waitFor(() => {
      expect(screen.getByText(/Offline Mode/)).toBeTruthy();
    });
    expect(screen.getByText(/1 cached assets/)).toBeTruthy();
    expect(screen.getByText(/2 pending operations/)).toBeTruthy();
  });

  // --- Detail flyout sections ---

  it("shows flavor qualities in detail flyout", async () => {
    const flavors = [
      makeFlavor({ id: "f1", width: 1920, height: 1080, fileExt: "mp4", size: 50000 }),
      makeFlavor({
        id: "f2",
        width: 1280,
        height: 720,
        fileExt: "mp4",
        size: 25000,
        isOriginal: true,
        isWeb: false,
      }),
    ];
    const service = mockMediaService({
      getEntryDetails: jest.fn().mockResolvedValue({
        entry: entries[0],
        flavors,
        captions: [],
      }),
    });
    render(<BrowsePanel {...defaultProps} mediaService={service as never} />);
    await waitFor(() => {
      expect(screen.getByText("Video One")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Video One"));
    });

    await waitFor(() => {
      expect(screen.getByText(/Available Qualities \(2\)/)).toBeTruthy();
      expect(screen.getByText(/1920/)).toBeTruthy();
      expect(screen.getByText(/\(Original\)/)).toBeTruthy();
    });
  });

  it("shows caption tracks in detail flyout", async () => {
    const service = mockMediaService({
      getEntryDetails: jest.fn().mockResolvedValue({
        entry: entries[0],
        flavors: [makeFlavor()],
        captions: [
          {
            id: "cap-1",
            entryId: "0_entry1",
            label: "English",
            language: "en",
            format: 1,
            status: 2,
            isDefault: true,
            createdAt: 1700000000,
            updatedAt: 1700000000,
          },
        ],
      }),
    });
    render(<BrowsePanel {...defaultProps} mediaService={service as never} />);
    await waitFor(() => {
      expect(screen.getByText("Video One")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Video One"));
    });

    await waitFor(() => {
      expect(screen.getByText(/Caption Tracks \(1\)/)).toBeTruthy();
      expect(screen.getByText(/en .+ English/)).toBeTruthy();
      expect(screen.getByText(/\(Default\)/)).toBeTruthy();
    });
  });

  // --- Search ---

  it("calls mediaService.list with search text after debounce", async () => {
    jest.useFakeTimers();
    const service = mockMediaService();
    const { container } = render(<BrowsePanel {...defaultProps} mediaService={service as never} />);

    await act(async () => {
      await Promise.resolve(); // Flush initial load
    });

    const searchInput = container.querySelector("sp-search")!;
    await act(async () => {
      simulateInput(searchInput, "demo");
      jest.advanceTimersByTime(400);
    });

    await waitFor(() => {
      const calls = (service.list as jest.Mock).mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toEqual(expect.objectContaining({ searchTextMatchAnd: "demo" }));
    });
    jest.useRealTimers();
  });

  // --- Batch delete ---

  it("shows delete button when batchService is provided", async () => {
    const batchService = {
      batchDelete: jest.fn().mockResolvedValue({ total: 1, successful: 1 }),
      batchUpdateMetadata: jest.fn(),
    };
    render(<BrowsePanel {...defaultProps} batchService={batchService} />);
    await waitFor(() => {
      expect(screen.getByText("Video One")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Video One"));
    });

    await waitFor(() => {
      expect(screen.getByText("Edit Metadata")).toBeTruthy();
    });
    // Delete button has title="Delete entry"
    const deleteBtn = document.querySelector('[title="Delete entry"]');
    expect(deleteBtn).toBeTruthy();
  });

  // --- Edit metadata ---

  it("opens metadata editor when Edit Metadata is clicked", async () => {
    render(<BrowsePanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Video One")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Video One"));
    });

    await waitFor(() => {
      expect(screen.getByText("Edit Metadata")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Edit Metadata"));

    await waitFor(() => {
      // MetadataEditor heading
      expect(screen.getByText("Edit Metadata")).toBeTruthy();
      expect(screen.getByText("Save Changes")).toBeTruthy();
    });
  });
});
