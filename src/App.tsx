import React, { Suspense, useMemo, useState, useCallback, useEffect, useRef } from "react";
import { TabId, KalturaMediaEntry, KalturaFlavorAsset } from "./types";
import {
  KalturaClient,
  AuthService,
  MediaService,
  UploadService,
  DownloadService,
  MetadataService,
  CaptionService,
  NotificationService,
  ReviewService,
  AnalyticsService,
  InteractiveService,
  BatchService,
  PublishWorkflowService,
  SearchService,
  AuditService,
  OfflineService,
  ProxyService,
  createHostService,
} from "./services";
import { useAuth } from "./hooks";
import { LoginPanel, BrowsePanel, PublishPanel } from "./panels";
import { StatusBar, LoadingSpinner } from "./components";

// Lazy-load panels that are not immediately visible on startup
const CaptionsPanel = React.lazy(() =>
  import("./panels/CaptionsPanel").then((m) => ({ default: m.CaptionsPanel })),
);
const ReviewPanel = React.lazy(() =>
  import("./panels/ReviewPanel").then((m) => ({ default: m.ReviewPanel })),
);
const AnalyticsPanel = React.lazy(() =>
  import("./panels/AnalyticsPanel").then((m) => ({ default: m.AnalyticsPanel })),
);
const InteractivePanel = React.lazy(() =>
  import("./panels/InteractivePanel").then((m) => ({ default: m.InteractivePanel })),
);
const SettingsPanel = React.lazy(() =>
  import("./panels/SettingsPanel").then((m) => ({ default: m.SettingsPanel })),
);
import { DEFAULT_SERVICE_URL } from "./utils/constants";
import { createLogger } from "./utils/logger";

const log = createLogger("App");
const PARTNER_ID = 0; // Set by login

/** Tabs shown in the overflow menu (entry-specific or secondary) */
const OVERFLOW_TABS: { id: TabId; label: string; requiresVideo?: boolean }[] = [
  { id: "captions", label: "Captions", requiresVideo: true },
  { id: "review", label: "Review" },
  { id: "analytics", label: "Analytics", requiresVideo: true },
  { id: "interactive", label: "Interactive", requiresVideo: true },
];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>("browse");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedEntryName, setSelectedEntryName] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<{ message: string; isError: boolean } | null>(
    null,
  );
  const [showOverflow, setShowOverflow] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Close overflow menu on outside click
  useEffect(() => {
    if (!showOverflow) return;
    const handleClick = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflow(false);
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [showOverflow]);

  // Initialize services (memoized)
  const client = useMemo(
    () => new KalturaClient({ serviceUrl: DEFAULT_SERVICE_URL, partnerId: PARTNER_ID }),
    [],
  );
  const authService = useMemo(() => new AuthService(client), [client]);
  const mediaService = useMemo(() => new MediaService(client), [client]);
  const uploadService = useMemo(() => new UploadService(client), [client]);
  const hostService = useMemo(() => createHostService(), []);
  const hostAppInfo = useMemo(() => hostService.getAppInfo(), [hostService]);
  const metadataService = useMemo(() => new MetadataService(client), [client]);
  const downloadService = useMemo(
    () => new DownloadService(client, mediaService, hostService),
    [client, mediaService, hostService],
  );
  const captionService = useMemo(() => new CaptionService(client), [client]);
  const notificationService = useMemo(() => new NotificationService(client), [client]);
  const reviewService = useMemo(
    () => new ReviewService(client, hostService),
    [client, hostService],
  );
  const analyticsService = useMemo(() => new AnalyticsService(client), [client]);
  const interactiveService = useMemo(() => new InteractiveService(client), [client]);
  const batchService = useMemo(
    () => new BatchService(client, mediaService, captionService),
    [client, mediaService, captionService],
  );
  const publishWorkflowService = useMemo(
    () => new PublishWorkflowService(client, mediaService),
    [client, mediaService],
  );
  const searchService = useMemo(() => new SearchService(client), [client]);
  const auditService = useMemo(() => new AuditService(client), [client]);
  const proxyService = useMemo(
    () => new ProxyService(client, mediaService, hostService),
    [client, mediaService, hostService],
  );
  const offlineService = useMemo(() => new OfflineService(), []);

  // Suppress unused-var warnings for services wired but not directly referenced
  void notificationService;

  const { authState, login, loginWithSso, cancelSso, logout, isLoading, error, clearError } =
    useAuth(client, authService);

  // Update client when auth changes
  React.useEffect(() => {
    if (authState.partnerId) {
      client.configure({ partnerId: authState.partnerId });
    }
  }, [authState.partnerId, client]);

  React.useEffect(() => {
    if (authState.isAuthenticated) {
      auditService.logAction("login", undefined, `User: ${authState.user?.email}`);
      hostService.syncWithProject?.();
    }
  }, [authState.isAuthenticated, authState.user?.email, auditService, hostService]);

  const handleServerUrlChange = useCallback(
    (url: string) => {
      client.configure({ serviceUrl: url });
    },
    [client],
  );

  const handleSelectEntry = useCallback((entry: KalturaMediaEntry) => {
    setSelectedEntryId(entry.id);
    setSelectedEntryName(entry.name);
  }, []);

  const handleImportEntry = useCallback(
    async (entry: KalturaMediaEntry, flavor: KalturaFlavorAsset) => {
      if (!authState.partnerId) return;
      setImportStatus({ message: `Downloading "${entry.name}"...`, isError: false });
      try {
        log.info("Importing entry", { entryId: entry.id, flavorId: flavor.id });
        await downloadService.downloadAndImport(entry.id, flavor);
        auditService.logAction("import", entry.id, `Imported flavor ${flavor.id}`);
        setImportStatus({
          message: `"${entry.name}" imported to "Kaltura Assets" bin in the Project panel.`,
          isError: false,
        });
        setTimeout(() => setImportStatus(null), 4000);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Import failed";
        log.error("Import failed", err);
        setImportStatus({ message: `Import failed: ${message}`, isError: true });
      }
    },
    [authState.partnerId, downloadService, auditService],
  );

  const handlePublished = useCallback((entry: KalturaMediaEntry) => {
    setSelectedEntryId(entry.id);
    setSelectedEntryName(entry.name);
    // Defer tab switch — UXP SWC crash prevention (see docs/UXP_LESSONS_LEARNED.md)
    setTimeout(() => setActiveTab("browse"), 0);
  }, []);

  const handleTabSwitch = useCallback((id: TabId) => {
    // Defer all tab switches to prevent SWC assertion crashes
    setTimeout(() => setActiveTab(id), 0);
  }, []);

  const handleOverflowTab = useCallback(
    (id: TabId) => {
      setShowOverflow(false);
      handleTabSwitch(id);
    },
    [handleTabSwitch],
  );

  // Check if the active tab is in the overflow menu
  const isOverflowTabActive = OVERFLOW_TABS.some((t) => t.id === activeTab);

  // Filter overflow tabs by host capabilities
  const visibleOverflowTabs = OVERFLOW_TABS.filter(
    (t) => !t.requiresVideo || hostAppInfo.supportsVideo,
  );

  // Auth gate
  if (isLoading && !authState.isAuthenticated) {
    return <LoadingSpinner label="Loading..." size="large" />;
  }

  if (!authState.isAuthenticated) {
    return (
      <div className="panel-root">
        <div style={{ flexGrow: 1, flexShrink: 1, flexBasis: "0%" }}>
          <LoginPanel
            onLogin={login}
            onSsoLogin={loginWithSso}
            onCancelSso={cancelSso}
            onServerUrlChange={handleServerUrlChange}
            isLoading={isLoading}
            error={error}
            onClearError={clearError}
          />
        </div>
        <StatusBar connectionState={authState.connectionState} />
      </div>
    );
  }

  return (
    <div className="panel-root">
      {/* Tab bar: 3 primary + overflow */}
      <div className="tab-bar">
        <TabButton id="browse" label="Browse" active={activeTab} onClick={handleTabSwitch} />
        <TabButton id="publish" label="Publish" active={activeTab} onClick={handleTabSwitch} />
        <TabButton id="settings" label="Settings" active={activeTab} onClick={handleTabSwitch} />

        {/* Overflow menu for entry-specific tabs */}
        <div className="tab-overflow" ref={overflowRef}>
          <div
            role="button"
            tabIndex={0}
            className={`tab-overflow-trigger${isOverflowTabActive ? " tab-overflow-trigger--active" : ""}`}
            onClick={() => setShowOverflow((prev) => !prev)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setShowOverflow(false);
              if (e.key === "Enter" || e.key === " ") setShowOverflow((prev) => !prev);
            }}
            aria-label="More tabs"
            aria-expanded={showOverflow}
          >
            {"\u00B7\u00B7\u00B7"}
          </div>
          {showOverflow && (
            <div className="tab-overflow-menu" role="menu">
              {visibleOverflowTabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`tab-overflow-item${activeTab === tab.id ? " tab-overflow-item--active" : ""}`}
                  role="menuitem"
                  tabIndex={0}
                  onClick={() => handleOverflowTab(tab.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleOverflowTab(tab.id);
                    if (e.key === "Escape") setShowOverflow(false);
                  }}
                >
                  {tab.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tab content */}
      <div className="tab-content">
        {activeTab === "browse" && authState.partnerId && (
          <BrowsePanel
            mediaService={mediaService}
            metadataService={metadataService}
            searchService={searchService}
            batchService={batchService}
            auditService={auditService}
            offlineService={offlineService}
            proxyService={proxyService}
            partnerId={authState.partnerId}
            userId={authState.user?.id}
            isImported={(id) => hostService.isImported(id)}
            onSelectEntry={handleSelectEntry}
            onImportEntry={handleImportEntry}
          />
        )}
        {activeTab === "publish" && (
          <PublishPanel
            mediaService={mediaService}
            uploadService={uploadService}
            metadataService={metadataService}
            premiereService={hostService}
            publishWorkflowService={publishWorkflowService}
            auditService={auditService}
            onPublished={handlePublished}
          />
        )}
        <Suspense fallback={<LoadingSpinner label="Loading..." />}>
          {activeTab === "captions" && (
            <CaptionsPanel
              captionService={captionService}
              entryId={selectedEntryId}
              entryName={selectedEntryName}
            />
          )}
          {activeTab === "review" && (
            <ReviewPanel
              reviewService={reviewService}
              entryId={selectedEntryId}
              entryName={selectedEntryName}
            />
          )}
          {activeTab === "analytics" && (
            <AnalyticsPanel
              analyticsService={analyticsService}
              entryId={selectedEntryId}
              entryName={selectedEntryName}
            />
          )}
          {activeTab === "interactive" && (
            <InteractivePanel
              interactiveService={interactiveService}
              premiereService={hostService}
              entryId={selectedEntryId}
              entryName={selectedEntryName}
            />
          )}
          {activeTab === "settings" && (
            <SettingsPanel
              currentServerUrl={authState.serverUrl}
              currentPartnerId={authState.partnerId}
              userName={authState.user?.fullName ?? null}
              userEmail={authState.user?.email ?? null}
              hostService={hostService}
              offlineService={offlineService}
              auditService={auditService}
              onLogout={logout}
              onServerUrlChange={handleServerUrlChange}
            />
          )}
        </Suspense>
      </div>

      {/* Import status */}
      {importStatus && (
        <div
          className={`import-banner ${importStatus.isError ? "import-banner--error" : "import-banner--success"}`}
        >
          <span>{importStatus.message}</span>
          {importStatus.isError && (
            <button className="alert-dismiss" onClick={() => setImportStatus(null)}>
              {"\u2715"}
            </button>
          )}
        </div>
      )}

      {/* Status bar */}
      <StatusBar connectionState={authState.connectionState} />
    </div>
  );
};

// --- Tab button sub-component ---

interface TabButtonProps {
  id: TabId;
  label: string;
  active: TabId;
  onClick: (id: TabId) => void;
}

const TabButton: React.FC<TabButtonProps> = ({ id, label, active, onClick }) => (
  <div
    role="button"
    tabIndex={0}
    onClick={() => onClick(id)}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") onClick(id);
    }}
    className={`tab-btn${active === id ? " tab-btn--active" : ""}`}
  >
    {label}
  </div>
);
