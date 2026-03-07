import React, { useMemo, useState, useCallback } from "react";
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
  createHostService,
} from "./services";
import { useAuth } from "./hooks";
import {
  LoginPanel,
  BrowsePanel,
  PublishPanel,
  CaptionsPanel,
  ReviewPanel,
  AnalyticsPanel,
  InteractivePanel,
  SettingsPanel,
} from "./panels";
import { StatusBar, LoadingSpinner } from "./components";
import { DEFAULT_SERVICE_URL } from "./utils/constants";
import { createLogger } from "./utils/logger";

const log = createLogger("App");
const PARTNER_ID = 0; // Set by login

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>("browse");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedEntryName, setSelectedEntryName] = useState<string | null>(null);

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
    () => new DownloadService(client, mediaService, hostService as never),
    [client, mediaService, hostService],
  );
  const captionService = useMemo(() => new CaptionService(client), [client]);
  const notificationService = useMemo(() => new NotificationService(client), [client]);
  const reviewService = useMemo(
    () => new ReviewService(client, hostService as never),
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
  const offlineService = useMemo(() => new OfflineService(), []);

  const { authState, login, loginWithSso, cancelSso, logout, isLoading, error, clearError } =
    useAuth(client, authService);

  // Update client when auth changes; log auth events
  React.useEffect(() => {
    if (authState.partnerId) {
      client.configure({ partnerId: authState.partnerId });
    }
  }, [authState.partnerId, client]);

  React.useEffect(() => {
    if (authState.isAuthenticated) {
      auditService.logAction("login", undefined, `User: ${authState.user?.email}`);
    }
  }, [authState.isAuthenticated, authState.user?.email, auditService]);

  // Connect/disconnect notification service with auth state
  React.useEffect(() => {
    if (authState.isAuthenticated) {
      notificationService.connect();
    } else {
      notificationService.disconnect();
    }
    return () => notificationService.disconnect();
  }, [authState.isAuthenticated, notificationService]);

  // Watch selected entry for real-time notifications
  React.useEffect(() => {
    if (selectedEntryId) {
      notificationService.watchEntry(selectedEntryId);
      return () => notificationService.unwatchEntry(selectedEntryId);
    }
  }, [selectedEntryId, notificationService]);

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
      try {
        log.info("Importing entry", { entryId: entry.id, flavorId: flavor.id });
        await downloadService.downloadAndImport(entry.id, flavor);
        auditService.logAction("import", entry.id, `Imported flavor ${flavor.id}`);
      } catch (err) {
        log.error("Import failed", err);
      }
    },
    [authState.partnerId, downloadService, auditService],
  );

  const handlePublished = useCallback((entry: KalturaMediaEntry) => {
    setSelectedEntryId(entry.id);
    setSelectedEntryName(entry.name);
    setActiveTab("browse");
  }, []);

  // Auth gate
  if (isLoading && !authState.isAuthenticated) {
    return <LoadingSpinner label="Loading..." size="large" />;
  }

  if (!authState.isAuthenticated) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ flex: 1 }}>
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--spectrum-global-color-gray-300)",
          padding: "0 4px",
        }}
      >
        <TabButton id="browse" label="Browse" active={activeTab} onClick={setActiveTab} />
        <TabButton id="publish" label="Publish" active={activeTab} onClick={setActiveTab} />
        {hostAppInfo.supportsVideo && (
          <TabButton id="captions" label="Captions" active={activeTab} onClick={setActiveTab} />
        )}
        <TabButton id="review" label="Review" active={activeTab} onClick={setActiveTab} />
        {hostAppInfo.supportsVideo && (
          <TabButton id="analytics" label="Analytics" active={activeTab} onClick={setActiveTab} />
        )}
        {hostAppInfo.supportsVideo && (
          <TabButton
            id="interactive"
            label="Interactive"
            active={activeTab}
            onClick={setActiveTab}
          />
        )}
        <TabButton id="settings" label="Settings" active={activeTab} onClick={setActiveTab} />
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {activeTab === "browse" && authState.partnerId && (
          <BrowsePanel
            mediaService={mediaService}
            metadataService={metadataService}
            searchService={searchService}
            batchService={batchService}
            auditService={auditService}
            offlineService={offlineService}
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
            premiereService={hostService as never}
            publishWorkflowService={publishWorkflowService}
            auditService={auditService}
            onPublished={handlePublished}
          />
        )}
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
            premiereService={hostService as never}
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
      </div>

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
  <button
    onClick={() => onClick(id)}
    style={{
      padding: "8px 12px",
      border: "none",
      borderBottom:
        active === id ? "2px solid var(--spectrum-global-color-blue-500)" : "2px solid transparent",
      background: "transparent",
      color:
        active === id
          ? "var(--spectrum-global-color-gray-900)"
          : "var(--spectrum-global-color-gray-600)",
      cursor: "pointer",
      fontSize: "12px",
      fontWeight: active === id ? 600 : 400,
    }}
  >
    {label}
  </button>
);
