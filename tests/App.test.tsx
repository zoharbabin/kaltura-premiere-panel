import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";

/**
 * Integration tests for the multi-panel architecture.
 * Tests BrowsePanelRoot and PublishPanelRoot as the main entry points.
 */

// Control whether session restore returns authenticated
let mockRestoreSession: jest.Mock;

jest.mock("../src/services/singleton", () => {
  const mockClient = {
    request: jest.fn().mockResolvedValue({}),
    setKs: jest.fn(),
    configure: jest.fn(),
    getServiceUrl: jest.fn().mockReturnValue("https://test.kaltura.com"),
  };

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

  const authSvc = new AuthServiceImpl();

  return {
    client: mockClient,
    authService: authSvc,
    mediaService: {
      list: jest.fn().mockResolvedValue({ objects: [], totalCount: 0 }),
      get: jest.fn(),
      add: jest.fn(),
      update: jest.fn(),
      getFlavorDownloadUrl: jest.fn(),
      eSearchBrowse: jest
        .fn()
        .mockResolvedValue({ entries: [], totalCount: 0, highlights: new Map() }),
      getEntryDetails: jest.fn(),
    },
    uploadService: { createToken: jest.fn() },
    downloadService: {
      downloadAndImport: jest.fn(),
      downloadAndImportEntry: jest.fn(),
      activeCount: 0,
      queueLength: 0,
    },
    metadataService: {
      listCategories: jest.fn().mockResolvedValue([]),
    },
    captionService: {
      listCaptions: jest.fn().mockResolvedValue([]),
      downloadCaptionAsSrt: jest.fn().mockResolvedValue(""),
    },
    searchService: {},
    batchService: { batchDelete: jest.fn() },
    publishWorkflowService: {},
    auditService: {
      logAction: jest.fn().mockResolvedValue(undefined),
      listAccessControlProfiles: jest.fn().mockResolvedValue([]),
      getLocalLog: jest.fn().mockReturnValue([]),
      clearLocalLog: jest.fn(),
    },
    offlineService: {
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
      clearCache: jest.fn(),
      clearQueue: jest.fn(),
    },
    hostService: {
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
      syncWithProject: jest.fn(),
      getActiveSequence: jest.fn().mockResolvedValue(null),
    },
  };
});

jest.mock("../src/services", () => ({
  KalturaClient: jest.fn(),
  AuthService: jest.fn(),
  MediaService: jest.fn(),
  UploadService: jest.fn(),
  DownloadService: jest.fn(),
  MetadataService: jest.fn(),
  CaptionService: jest.fn(),
  BatchService: jest.fn(),
  PublishWorkflowService: jest.fn(),
  SearchService: jest.fn(),
  AuditService: jest.fn(),
  OfflineService: jest.fn(),
  createHostService: jest.fn(),
}));

import { BrowsePanelRoot } from "../src/panels/BrowsePanelRoot";
import { PublishPanelRoot } from "../src/panels/PublishPanelRoot";

describe("Multi-panel architecture", () => {
  beforeEach(() => {
    // Default: no session to restore (unauthenticated)
    mockRestoreSession = jest.fn().mockResolvedValue(null);
  });

  describe("BrowsePanelRoot", () => {
    it("shows login panel when not authenticated", async () => {
      await act(async () => {
        render(<BrowsePanelRoot />);
      });

      await waitFor(() => {
        expect(screen.getByText(/Disconnected/)).toBeTruthy();
      });
    });

    it("shows status bar with version", async () => {
      await act(async () => {
        render(<BrowsePanelRoot />);
      });

      await waitFor(() => {
        expect(screen.getByText(/^v\d/)).toBeTruthy();
      });
    });

    it("renders browse content after session restore", async () => {
      mockRestoreSession = jest.fn().mockResolvedValue({
        ks: "test_ks",
        partnerId: 12345,
        user: { id: "user1", email: "test@test.com", fullName: "Test User" },
      });

      await act(async () => {
        render(<BrowsePanelRoot />);
      });

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Search media library...")).toBeTruthy();
      });
    });
  });

  describe("PublishPanelRoot", () => {
    it("shows login panel when not authenticated", async () => {
      await act(async () => {
        render(<PublishPanelRoot />);
      });

      await waitFor(() => {
        expect(screen.getByText(/Disconnected/)).toBeTruthy();
      });
    });

    it("renders publish form after session restore", async () => {
      mockRestoreSession = jest.fn().mockResolvedValue({
        ks: "test_ks",
        partnerId: 12345,
        user: { id: "user1", email: "test@test.com", fullName: "Test User" },
      });

      await act(async () => {
        render(<PublishPanelRoot />);
      });

      await waitFor(() => {
        expect(screen.getByText("Publish to Kaltura")).toBeTruthy();
      });
    });
  });
});
