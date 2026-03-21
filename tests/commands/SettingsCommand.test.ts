import { runSettingsCommand } from "../../src/commands/SettingsCommand";

describe("SettingsCommand", () => {
  const mockHostService = {
    getAppInfo: jest.fn().mockReturnValue({
      id: "premierepro",
      name: "Premiere Pro",
      version: "25.6.0",
      supportsVideo: true,
      supportsAudio: true,
      supportsSequences: true,
      supportsMarkers: true,
    }),
    isAvailable: jest.fn().mockReturnValue(true),
    getVersion: jest.fn().mockReturnValue("25.6.0"),
    getAllMappings: jest.fn().mockReturnValue(new Map()),
    clearMappings: jest.fn(),
    isImported: jest.fn().mockReturnValue(false),
    importFile: jest.fn(),
    storeMapping: jest.fn(),
    addMarkers: jest.fn(),
    getMarkers: jest.fn(),
  };

  const mockOfflineService = {
    getSyncStatus: jest.fn().mockReturnValue({
      isOnline: true,
      pendingOperations: 0,
      cacheEntryCount: 5,
      cacheSizeMB: 12.3,
    }),
    clearCache: jest.fn(),
    clearQueue: jest.fn(),
    getIsOnline: jest.fn().mockReturnValue(true),
    onStatusChange: jest.fn().mockReturnValue(() => {}),
    isCached: jest.fn().mockReturnValue(false),
    cacheEntries: jest.fn(),
    getCachedEntries: jest.fn().mockReturnValue([]),
  };

  const mockAuditService = {
    getLocalLog: jest.fn().mockReturnValue([
      { action: "login", timestamp: Date.now() - 60000 },
      { action: "import", entryId: "1_abc123", timestamp: Date.now() },
    ]),
    clearLocalLog: jest.fn(),
    logAction: jest.fn().mockResolvedValue(undefined),
    listAccessControlProfiles: jest.fn().mockResolvedValue([]),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock uxpShowModal on dialog elements
    const origCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "dialog") {
        const el = origCreateElement(tag) as HTMLDialogElement & {
          uxpShowModal: (opts: unknown) => Promise<string>;
        };
        el.uxpShowModal = jest.fn().mockResolvedValue("ok");
        return el;
      }
      return origCreateElement(tag);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Clean up any dialogs left in DOM
    document.querySelectorAll("#kaltura-settings-dialog").forEach((el) => el.remove());
  });

  it("creates and removes a dialog element", async () => {
    await runSettingsCommand(
      mockHostService as never,
      mockOfflineService as never,
      mockAuditService as never,
    );

    // Dialog should be cleaned up
    expect(document.querySelector("#kaltura-settings-dialog")).toBeNull();
  });

  it("renders plugin version in dialog", async () => {
    const promise = runSettingsCommand(
      mockHostService as never,
      mockOfflineService as never,
      mockAuditService as never,
    );

    // Check dialog was added to DOM before uxpShowModal resolves
    const dialog = document.querySelector("#kaltura-settings-dialog");
    expect(dialog).toBeTruthy();
    expect(dialog?.innerHTML).toContain("Plugin Version:");

    await promise;
  });

  it("renders host app info", async () => {
    const promise = runSettingsCommand(
      mockHostService as never,
      mockOfflineService as never,
      mockAuditService as never,
    );

    const dialog = document.querySelector("#kaltura-settings-dialog");
    expect(dialog?.innerHTML).toContain("Premiere Pro");

    await promise;
  });

  it("renders audit entries", async () => {
    const promise = runSettingsCommand(
      mockHostService as never,
      mockOfflineService as never,
      mockAuditService as never,
    );

    const dialog = document.querySelector("#kaltura-settings-dialog");
    expect(dialog?.innerHTML).toContain("import");
    expect(dialog?.innerHTML).toContain("1_abc123");

    await promise;
  });

  it("shows 'No audit entries' when log is empty", async () => {
    mockAuditService.getLocalLog.mockReturnValueOnce([]);

    const promise = runSettingsCommand(
      mockHostService as never,
      mockOfflineService as never,
      mockAuditService as never,
    );

    const dialog = document.querySelector("#kaltura-settings-dialog");
    expect(dialog?.innerHTML).toContain("No audit entries yet");

    await promise;
  });

  it("saves settings when dialog closes", async () => {
    await runSettingsCommand(
      mockHostService as never,
      mockOfflineService as never,
      mockAuditService as never,
    );

    const stored = localStorage.getItem("kaltura_settings");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.defaultExportPreset).toBeTruthy();
    expect(parsed.defaultCaptionLanguage).toBeTruthy();
  });
});
