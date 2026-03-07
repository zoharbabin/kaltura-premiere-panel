import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsPanel } from "../../src/panels/SettingsPanel";
import { PLUGIN_VERSION } from "../../src/utils/constants";

const mockHostService = {
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
  getActiveSequence: jest.fn(),
  importFile: jest.fn(),
  addMarkers: jest.fn(),
  isImported: jest.fn().mockReturnValue(false),
  storeMapping: jest.fn(),
  getAllMappings: jest.fn().mockReturnValue(new Map()),
  clearMappings: jest.fn(),
};

const mockAuditService = {
  getLocalLog: jest.fn().mockReturnValue([
    { action: "login", timestamp: 1700000000000, details: "User: test@example.com" },
    {
      action: "import",
      entryId: "0_abc",
      timestamp: 1700001000000,
      details: "Imported flavor xyz",
    },
  ]),
  clearLocalLog: jest.fn(),
};

const mockOfflineService = {
  getSyncStatus: jest.fn().mockReturnValue({
    cacheEntryCount: 5,
    cacheSizeMB: 2.5,
    pendingOperations: 1,
  }),
  clearCache: jest.fn(),
  clearQueue: jest.fn(),
};

const defaultProps = {
  currentServerUrl: "https://www.kaltura.com",
  currentPartnerId: 12345,
  userName: "Test User",
  userEmail: "test@example.com",
  hostService: mockHostService as never,
  onLogout: jest.fn(),
};

describe("SettingsPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders account section with user name and email", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText("Account")).toBeTruthy();
    expect(screen.getByText("Test User")).toBeTruthy();
    expect(screen.getByText("test@example.com")).toBeTruthy();
  });

  it("shows server URL", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText("https://www.kaltura.com")).toBeTruthy();
  });

  it("shows partner ID", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText("12345")).toBeTruthy();
  });

  it("shows host app name and version in about section", () => {
    render(<SettingsPanel {...defaultProps} />);
    // "Premiere Pro" appears in host line
    expect(screen.getByText(/Premiere Pro/)).toBeTruthy();
    expect(screen.getByText(/25\.2\.0/)).toBeTruthy();
  });

  it("shows plugin version", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText(`Plugin Version: ${PLUGIN_VERSION}`)).toBeTruthy();
  });

  it("shows sign out button", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText("Sign Out")).toBeTruthy();
  });

  it("shows clear cache and clear mappings buttons", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText("Clear Cache")).toBeTruthy();
    expect(screen.getByText("Clear Mappings")).toBeTruthy();
  });

  it("shows about section with license info", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText("About")).toBeTruthy();
    expect(screen.getByText("License: AGPL-3.0")).toBeTruthy();
  });

  it("shows offline cache stats when offlineService provided", () => {
    render(<SettingsPanel {...defaultProps} offlineService={mockOfflineService} />);
    expect(screen.getByText(/Offline cached entries: 5/)).toBeTruthy();
    expect(screen.getByText(/2\.5 MB/)).toBeTruthy();
    expect(screen.getByText(/Pending sync operations: 1/)).toBeTruthy();
  });

  it("shows max cache size setting", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText("Max Cache Size (MB)")).toBeTruthy();
  });

  it("shows audit trail section when auditService provided", () => {
    render(<SettingsPanel {...defaultProps} auditService={mockAuditService} />);
    expect(screen.getByText("Audit Trail")).toBeTruthy();
    expect(screen.getByText(/View Audit Log \(2 entries\)/)).toBeTruthy();
  });

  it("displays audit log entries when View is clicked", () => {
    render(<SettingsPanel {...defaultProps} auditService={mockAuditService} />);
    const viewButton = screen.getByText(/View Audit Log/);
    fireEvent.click(viewButton);

    expect(screen.getByText("login")).toBeTruthy();
    expect(screen.getByText("import")).toBeTruthy();
    expect(screen.getByText("0_abc")).toBeTruthy();
  });

  it("clears audit log", () => {
    render(<SettingsPanel {...defaultProps} auditService={mockAuditService} />);
    fireEvent.click(screen.getByText(/View Audit Log/));
    fireEvent.click(screen.getByText("Clear Log"));
    expect(mockAuditService.clearLocalLog).toHaveBeenCalled();
  });

  it("hides caption language picker for Audition host", () => {
    const auditionHost = {
      ...mockHostService,
      getAppInfo: jest.fn().mockReturnValue({
        id: "audition",
        name: "Audition",
        version: "25.2.0",
        supportsVideo: false,
        supportsAudio: true,
        supportsSequences: true,
        supportsMarkers: true,
      }),
    };
    render(<SettingsPanel {...defaultProps} hostService={auditionHost as never} />);
    expect(screen.queryByText("Default Caption Language")).toBeNull();
  });

  it("shows Clear Pending Ops button when there are pending operations", () => {
    render(<SettingsPanel {...defaultProps} offlineService={mockOfflineService} />);
    expect(screen.getByText("Clear Pending Ops")).toBeTruthy();
  });
});
