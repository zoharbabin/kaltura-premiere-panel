import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { App } from "../src/App";

// Control whether session restore returns authenticated
let mockRestoreSession: jest.Mock;

jest.mock("../src/services", () => {
  const mockClient = {
    request: jest.fn().mockResolvedValue({}),
    setKs: jest.fn(),
    configure: jest.fn(),
    getServiceUrl: jest.fn().mockReturnValue("https://test.kaltura.com"),
  };

  // Use a getter so tests can swap mockRestoreSession before rendering
  const AuthServiceImpl = jest.fn().mockImplementation(() => ({
    get restoreSession() {
      return mockRestoreSession;
    },
    loginWithCredentials: jest.fn().mockResolvedValue({
      ks: "test_ks",
      partnerId: 12345,
      user: { id: "user1", email: "test@test.com", fullName: "Test User" },
    }),
    loginWithSso: jest.fn(),
    logout: jest.fn().mockResolvedValue(undefined),
  }));

  return {
    KalturaClient: jest.fn().mockImplementation(() => mockClient),
    AuthService: AuthServiceImpl,
    MediaService: jest.fn().mockImplementation(() => ({
      list: jest.fn().mockResolvedValue({ objects: [], totalCount: 0 }),
      get: jest.fn(),
      add: jest.fn(),
      update: jest.fn(),
      getFlavorDownloadUrl: jest.fn(),
    })),
    UploadService: jest.fn().mockImplementation(() => ({ createToken: jest.fn() })),
    DownloadService: jest.fn().mockImplementation(() => ({
      downloadAndImport: jest.fn(),
      activeCount: 0,
      queueLength: 0,
    })),
    MetadataService: jest.fn().mockImplementation(() => ({
      listCategories: jest.fn().mockResolvedValue([]),
    })),
    CaptionService: jest.fn().mockImplementation(() => ({
      listCaptions: jest.fn().mockResolvedValue([]),
      listTasks: jest.fn().mockResolvedValue([]),
      listReachCatalogItems: jest.fn().mockResolvedValue([]),
      getTaskStatusLabel: jest.fn().mockReturnValue("Unknown"),
    })),
    NotificationService: jest.fn().mockImplementation(() => ({
      connect: jest.fn(),
      disconnect: jest.fn(),
      watchEntry: jest.fn(),
      unwatchEntry: jest.fn(),
    })),
    ReviewService: jest.fn().mockImplementation(() => ({
      listAnnotations: jest.fn().mockResolvedValue([]),
    })),
    AnalyticsService: jest.fn().mockImplementation(() => ({
      getViewerStats: jest.fn().mockResolvedValue(null),
      getTopMoments: jest.fn().mockResolvedValue([]),
      getDropOffPoints: jest.fn().mockResolvedValue([]),
    })),
    InteractiveService: jest.fn().mockImplementation(() => ({
      listCuePoints: jest.fn().mockResolvedValue([]),
    })),
    BatchService: jest.fn().mockImplementation(() => ({ batchDelete: jest.fn() })),
    PublishWorkflowService: jest.fn().mockImplementation(() => ({})),
    SearchService: jest.fn().mockImplementation(() => ({})),
    AuditService: jest.fn().mockImplementation(() => ({
      logAction: jest.fn().mockResolvedValue(undefined),
      listAccessControlProfiles: jest.fn().mockResolvedValue([]),
    })),
    OfflineService: jest.fn().mockImplementation(() => ({
      getIsOnline: jest.fn().mockReturnValue(true),
      onStatusChange: jest.fn().mockReturnValue(() => {}),
      getSyncStatus: jest.fn().mockReturnValue({
        isOnline: true,
        pendingOperations: 0,
        cacheEntryCount: 0,
      }),
      isCached: jest.fn().mockReturnValue(false),
      cacheEntries: jest.fn(),
      getCachedEntries: jest.fn().mockReturnValue([]),
    })),
    ProxyService: jest.fn().mockImplementation(() => ({
      isProxyLoaded: jest.fn().mockReturnValue(false),
    })),
    createHostService: jest.fn().mockReturnValue({
      getAppInfo: jest.fn().mockReturnValue({
        id: "premierepro",
        name: "Premiere Pro",
        version: "25.2.0",
        supportsVideo: true,
        supportsAudio: true,
        supportsSequences: true,
        supportsMarkers: true,
      }),
      isAvailable: jest.fn().mockReturnValue(true),
      getVersion: jest.fn().mockReturnValue("25.2.0"),
      isImported: jest.fn().mockReturnValue(false),
      importFile: jest.fn().mockResolvedValue({ success: true }),
      storeMapping: jest.fn(),
      addMarkers: jest.fn().mockResolvedValue(undefined),
      getMarkers: jest.fn().mockResolvedValue([]),
      getAllMappings: jest.fn().mockReturnValue(new Map()),
      clearMappings: jest.fn(),
    }),
  };
});

describe("App", () => {
  beforeEach(() => {
    // Default: no session to restore (unauthenticated)
    mockRestoreSession = jest.fn().mockResolvedValue(null);
  });

  it("shows login panel when not authenticated", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Kaltura for Adobe/i)).toBeTruthy();
    });
  });

  it("shows status bar with version in login view", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText(/^v\d/)).toBeTruthy();
    });
  });

  it("renders primary tabs and overflow trigger after session restore", async () => {
    mockRestoreSession = jest.fn().mockResolvedValue({
      ks: "test_ks",
      partnerId: 12345,
      user: { id: "user1", email: "test@test.com", fullName: "Test User" },
    });

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Browse")).toBeTruthy();
    });

    // Primary tabs visible directly
    expect(screen.getByText("Publish")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();

    // Overflow trigger is present (entry-specific tabs are inside the overflow menu)
    expect(screen.getByLabelText("More tabs")).toBeTruthy();
  });

  it("shows Browse tab content by default when authenticated", async () => {
    mockRestoreSession = jest.fn().mockResolvedValue({
      ks: "test_ks",
      partnerId: 12345,
      user: { id: "user1", email: "test@test.com", fullName: "Test User" },
    });

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Browse")).toBeTruthy();
    });
  });
});
