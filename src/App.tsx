import React, { useMemo, useState, useCallback } from "react";
import { TabId, KalturaMediaEntry } from "./types";
import {
  KalturaClient,
  AuthService,
  MediaService,
  UploadService,
  PremiereService,
} from "./services";
import { useAuth } from "./hooks";
import { LoginPanel, BrowsePanel, PublishPanel, SettingsPanel } from "./panels";
import { StatusBar, LoadingSpinner } from "./components";
import { DEFAULT_SERVICE_URL } from "./utils/constants";

const PARTNER_ID = 0; // Will be set by login

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>("browse");

  // Initialize services (memoized — created once)
  const client = useMemo(
    () => new KalturaClient({ serviceUrl: DEFAULT_SERVICE_URL, partnerId: PARTNER_ID }),
    [],
  );
  const authService = useMemo(() => new AuthService(client), [client]);
  const mediaService = useMemo(() => new MediaService(client), [client]);
  const uploadService = useMemo(() => new UploadService(client), [client]);
  const premiereService = useMemo(() => new PremiereService(), []);

  const { authState, login, logout, isLoading, error, clearError } = useAuth(client, authService);

  // Update client partner ID when auth changes
  React.useEffect(() => {
    if (authState.partnerId) {
      client.configure({ partnerId: authState.partnerId });
    }
  }, [authState.partnerId, client]);

  const handleSelectEntry = useCallback((_entry: KalturaMediaEntry) => {
    // Future: track selected entry for context
  }, []);

  const handleImportEntry = useCallback(
    async (entry: KalturaMediaEntry) => {
      // Simplified import — full implementation in Phase 1 import issue
      if (!authState.partnerId) return;
      try {
        const flavors = (await mediaService.getEntryDetails(entry.id)).flavors;
        if (flavors.length === 0) return;

        const url = await mediaService.getFlavorDownloadUrl(flavors[0].id);
        // In Premiere runtime: download + import
        // For now, log the URL
        premiereService.saveMapping(entry.id, {
          entryId: entry.id,
          flavorId: flavors[0].id,
          localPath: url,
          importDate: Date.now(),
          isProxy: !flavors[0].isOriginal,
        });
      } catch (err) {
        console.error("Import failed", err);
      }
    },
    [authState.partnerId, mediaService, premiereService],
  );

  const handlePublished = useCallback((_entry: KalturaMediaEntry) => {
    setActiveTab("browse");
  }, []);

  // Auth gate
  if (isLoading && !authState.isAuthenticated) {
    return <LoadingSpinner label="Loading…" size="large" />;
  }

  if (!authState.isAuthenticated) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ flex: 1 }}>
          <LoginPanel
            onLogin={login}
            isLoading={isLoading}
            error={error}
            onClearError={clearError}
          />
        </div>
        <StatusBar connectionState={authState.connectionState} />
      </div>
    );
  }

  // Main panel with tabs
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
        <TabButton id="settings" label="Settings" active={activeTab} onClick={setActiveTab} />
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {activeTab === "browse" && authState.partnerId && (
          <BrowsePanel
            mediaService={mediaService}
            partnerId={authState.partnerId}
            isImported={(id) => premiereService.isImported(id)}
            onSelectEntry={handleSelectEntry}
            onImportEntry={handleImportEntry}
          />
        )}
        {activeTab === "publish" && (
          <PublishPanel
            mediaService={mediaService}
            uploadService={uploadService}
            premiereService={premiereService}
            onPublished={handlePublished}
          />
        )}
        {activeTab === "settings" && (
          <SettingsPanel
            currentServerUrl={authState.serverUrl}
            currentPartnerId={authState.partnerId}
            userName={authState.user?.fullName ?? null}
            userEmail={authState.user?.email ?? null}
            onLogout={logout}
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
