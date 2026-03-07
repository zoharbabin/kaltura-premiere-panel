import React, { useState, useEffect, useCallback } from "react";
import { PluginSettings } from "../types";
import { HostService, HostAppInfo } from "../services/HostService";
import {
  DEFAULT_SERVICE_URL,
  DEFAULT_CACHE_SIZE_MB,
  PLUGIN_VERSION,
  PLUGIN_NAME,
  STORAGE_KEY_SETTINGS,
  STORAGE_KEY_ASSET_MAPPINGS,
} from "../utils/constants";
import { formatFileSize } from "../utils/format";
import { ConfirmDialog } from "../components";

/** Duck-typed AuditService for audit trail display */
interface AuditServiceLike {
  getLocalLog(): {
    action: string;
    entryId?: string;
    details?: string;
    timestamp: number;
  }[];
  clearLocalLog(): void;
}

/** Duck-typed OfflineService for cache config */
interface OfflineServiceLike {
  getSyncStatus(): {
    cacheEntryCount: number;
    cacheSizeMB: number;
    pendingOperations: number;
  };
  clearCache(): void;
  clearQueue(): void;
}

interface SettingsPanelProps {
  currentServerUrl: string;
  currentPartnerId: number | null;
  userName: string | null;
  userEmail: string | null;
  hostService: HostService;
  offlineService?: OfflineServiceLike;
  auditService?: AuditServiceLike;
  onLogout: () => void;
  onServerUrlChange?: (url: string) => void;
}

const defaultSettings: PluginSettings = {
  serverUrl: DEFAULT_SERVICE_URL,
  partnerId: null,
  defaultExportPreset: "Match Source - Adaptive High Bitrate",
  defaultCaptionLanguage: "en",
  downloadLocation: "",
  cacheEnabled: true,
  maxCacheSizeMB: DEFAULT_CACHE_SIZE_MB,
};

function loadSettings(): PluginSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (stored) return { ...defaultSettings, ...JSON.parse(stored) };
  } catch {
    // ignore
  }
  return defaultSettings;
}

function saveSettings(settings: PluginSettings): void {
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
}

function estimateCacheSize(): number {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("kaltura_")) {
        total += (localStorage.getItem(key) || "").length * 2;
      }
    }
  } catch {
    // ignore
  }
  return total;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  currentServerUrl,
  currentPartnerId,
  userName,
  userEmail,
  hostService,
  offlineService,
  auditService,
  onLogout,
  onServerUrlChange: _onServerUrlChange,
}) => {
  const [settings, setSettings] = useState<PluginSettings>(loadSettings);
  const [hostAppInfo, setHostAppInfo] = useState<HostAppInfo | null>(null);
  const [cacheSize, setCacheSize] = useState(estimateCacheSize());
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [mappingCount, setMappingCount] = useState(0);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [auditEntries, setAuditEntries] = useState<
    { action: string; entryId?: string; details?: string; timestamp: number }[]
  >([]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    setHostAppInfo(hostService.getAppInfo());
    setMappingCount(hostService.getAllMappings().size);
  }, [hostService]);

  const updateSetting = useCallback(
    <K extends keyof PluginSettings>(key: K, value: PluginSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleClearThumbnailCache = useCallback(() => {
    localStorage.removeItem("kaltura_thumbnail_cache");
    localStorage.removeItem("kaltura_search_cache");
    offlineService?.clearCache();
    setCacheSize(estimateCacheSize());
  }, [offlineService]);

  const handleClearAssetMappings = useCallback(() => {
    hostService.clearMappings();
    localStorage.removeItem(STORAGE_KEY_ASSET_MAPPINGS);
    setMappingCount(0);
    setCacheSize(estimateCacheSize());
  }, [hostService]);

  const handleLogout = useCallback(() => {
    setShowLogoutConfirm(false);
    onLogout();
  }, [onLogout]);

  const handleSupportLink = useCallback(() => {
    const url = "https://github.com/zoharbabin/kaltura-premiere-panel/issues";
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const uxp = require("uxp");
      uxp.shell.openExternal(url);
    } catch {
      window.open(url, "_blank");
    }
  }, []);

  const handleShowAuditLog = useCallback(() => {
    if (auditService) {
      setAuditEntries(auditService.getLocalLog().slice().reverse());
    }
    setShowAuditLog(true);
  }, [auditService]);

  const handleClearAuditLog = useCallback(() => {
    auditService?.clearLocalLog();
    setAuditEntries([]);
  }, [auditService]);

  const offlineStatus = offlineService?.getSyncStatus();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflowY: "auto",
        padding: "8px",
      }}
    >
      {/* Logout confirmation */}
      {showLogoutConfirm && (
        <ConfirmDialog
          title="Sign Out"
          message="Are you sure you want to sign out? Any cached data will be preserved."
          confirmLabel="Sign Out"
          variant="negative"
          onConfirm={handleLogout}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}

      {/* Account */}
      <sp-detail size="M" style={{ padding: "8px 0 4px" }}>
        Account
      </sp-detail>
      <div style={{ padding: "4px 0", fontSize: "12px" }}>
        {userName && (
          <div>
            <strong>User:</strong> {userName}
          </div>
        )}
        {userEmail && (
          <div>
            <strong>Email:</strong> {userEmail}
          </div>
        )}
        <div>
          <strong>Server:</strong> {currentServerUrl}
        </div>
        {currentPartnerId && (
          <div>
            <strong>Partner ID:</strong> {currentPartnerId}
          </div>
        )}
      </div>
      <sp-button
        variant="secondary"
        size="s"
        onClick={() => setShowLogoutConfirm(true)}
        style={{ marginTop: "8px" }}
      >
        Sign Out
      </sp-button>

      <sp-divider size="s" style={{ margin: "16px 0" }} />

      {/* Preferences */}
      <sp-detail size="M" style={{ padding: "0 0 8px" }}>
        Preferences
      </sp-detail>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <sp-detail size="S">Default Export Preset</sp-detail>
          <sp-picker
            size="s"
            value={settings.defaultExportPreset}
            onChange={(e: Event) =>
              updateSetting("defaultExportPreset", (e.target as HTMLSelectElement).value)
            }
            style={{ width: "100%" }}
          >
            <sp-menu-item value="Match Source - Adaptive High Bitrate">
              Match Source - Adaptive High Bitrate
            </sp-menu-item>
            <sp-menu-item value="H.264 - Match Source - High Bitrate">
              H.264 - High Bitrate
            </sp-menu-item>
            <sp-menu-item value="H.264 - Match Source - Medium Bitrate">
              H.264 - Medium Bitrate
            </sp-menu-item>
            <sp-menu-item value="ProRes 422">ProRes 422</sp-menu-item>
            <sp-menu-item value="ProRes 422 HQ">ProRes 422 HQ</sp-menu-item>
          </sp-picker>
        </div>

        {hostAppInfo?.supportsVideo && (
          <div>
            <sp-detail size="S">Default Caption Language</sp-detail>
            <sp-picker
              size="s"
              value={settings.defaultCaptionLanguage}
              onChange={(e: Event) =>
                updateSetting("defaultCaptionLanguage", (e.target as HTMLSelectElement).value)
              }
              style={{ width: "100%" }}
            >
              <sp-menu-item value="en">English</sp-menu-item>
              <sp-menu-item value="es">Spanish</sp-menu-item>
              <sp-menu-item value="fr">French</sp-menu-item>
              <sp-menu-item value="de">German</sp-menu-item>
              <sp-menu-item value="ja">Japanese</sp-menu-item>
              <sp-menu-item value="zh">Chinese</sp-menu-item>
              <sp-menu-item value="ar">Arabic</sp-menu-item>
              <sp-menu-item value="pt">Portuguese</sp-menu-item>
              <sp-menu-item value="ko">Korean</sp-menu-item>
              <sp-menu-item value="it">Italian</sp-menu-item>
              <sp-menu-item value="ru">Russian</sp-menu-item>
              <sp-menu-item value="hi">Hindi</sp-menu-item>
            </sp-picker>
          </div>
        )}
      </div>

      <sp-divider size="s" style={{ margin: "16px 0" }} />

      {/* Cache & Storage */}
      <sp-detail size="M" style={{ padding: "0 0 8px" }}>
        Cache & Storage
      </sp-detail>
      <div
        style={{
          fontSize: "11px",
          color: "var(--spectrum-global-color-gray-600)",
          marginBottom: "8px",
        }}
      >
        <div>Cache size: {formatFileSize(cacheSize)}</div>
        <div>Imported assets: {mappingCount}</div>
        {offlineStatus && (
          <>
            <div>Offline cached entries: {offlineStatus.cacheEntryCount}</div>
            <div>Offline cache: {offlineStatus.cacheSizeMB.toFixed(1)} MB</div>
            {offlineStatus.pendingOperations > 0 && (
              <div>Pending sync operations: {offlineStatus.pendingOperations}</div>
            )}
          </>
        )}
      </div>

      {/* Offline cache size setting */}
      <div style={{ marginBottom: "8px" }}>
        <sp-detail size="S">Max Cache Size (MB)</sp-detail>
        <sp-textfield
          type="number"
          value={String(settings.maxCacheSizeMB)}
          onInput={(e: Event) => {
            const val = parseInt((e.target as HTMLInputElement).value, 10);
            if (!isNaN(val) && val > 0) updateSetting("maxCacheSizeMB", val);
          }}
          style={{ width: "80px" }}
        />
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <sp-button variant="secondary" size="s" onClick={handleClearThumbnailCache}>
          Clear Cache
        </sp-button>
        <sp-button variant="secondary" size="s" onClick={handleClearAssetMappings}>
          Clear Mappings
        </sp-button>
        {offlineService && offlineStatus && offlineStatus.pendingOperations > 0 && (
          <sp-button
            variant="secondary"
            size="s"
            onClick={() => {
              offlineService.clearQueue();
              setCacheSize(estimateCacheSize());
            }}
          >
            Clear Pending Ops
          </sp-button>
        )}
      </div>

      <sp-divider size="s" style={{ margin: "16px 0" }} />

      {/* Audit Trail */}
      {auditService && (
        <>
          <sp-detail size="M" style={{ padding: "0 0 8px" }}>
            Audit Trail
          </sp-detail>

          {!showAuditLog ? (
            <sp-button variant="secondary" size="s" onClick={handleShowAuditLog}>
              View Audit Log ({auditService.getLocalLog().length} entries)
            </sp-button>
          ) : (
            <div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                <sp-button variant="secondary" size="s" onClick={() => setShowAuditLog(false)}>
                  Hide Log
                </sp-button>
                <sp-button variant="secondary" size="s" onClick={handleClearAuditLog}>
                  Clear Log
                </sp-button>
              </div>
              <div
                style={{
                  maxHeight: "200px",
                  overflowY: "auto",
                  border: "1px solid var(--spectrum-global-color-gray-300)",
                  borderRadius: "4px",
                  padding: "4px",
                }}
              >
                {auditEntries.length === 0 ? (
                  <div
                    style={{
                      padding: "12px",
                      textAlign: "center",
                      fontSize: "11px",
                      color: "var(--spectrum-global-color-gray-500)",
                    }}
                  >
                    No audit entries yet
                  </div>
                ) : (
                  auditEntries.map((entry, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "4px 6px",
                        borderBottom:
                          i < auditEntries.length - 1
                            ? "1px solid var(--spectrum-global-color-gray-200)"
                            : "none",
                        fontSize: "10px",
                      }}
                    >
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <span
                          style={{
                            padding: "1px 4px",
                            borderRadius: "2px",
                            backgroundColor: "var(--spectrum-global-color-blue-100)",
                            color: "var(--spectrum-global-color-blue-700)",
                            fontWeight: 600,
                            fontSize: "9px",
                            textTransform: "uppercase",
                          }}
                        >
                          {entry.action}
                        </span>
                        <span style={{ color: "var(--spectrum-global-color-gray-500)" }}>
                          {formatTimestamp(entry.timestamp)}
                        </span>
                      </div>
                      {entry.entryId && (
                        <div
                          style={{
                            fontFamily: "monospace",
                            color: "var(--spectrum-global-color-gray-600)",
                            marginTop: "2px",
                          }}
                        >
                          {entry.entryId}
                        </div>
                      )}
                      {entry.details && (
                        <div
                          style={{
                            color: "var(--spectrum-global-color-gray-600)",
                            marginTop: "2px",
                          }}
                        >
                          {entry.details}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <sp-divider size="s" style={{ margin: "16px 0" }} />
        </>
      )}

      {/* About */}
      <sp-detail size="M" style={{ padding: "0 0 4px" }}>
        About
      </sp-detail>
      <div style={{ fontSize: "11px", color: "var(--spectrum-global-color-gray-600)" }}>
        <div>
          <strong>{PLUGIN_NAME}</strong>
        </div>
        <div>Plugin Version: {PLUGIN_VERSION}</div>
        <div>
          Host: {hostAppInfo?.name ?? "Unknown"} {hostAppInfo?.version ?? ""}
        </div>
        <div>License: AGPL-3.0</div>
      </div>
      <sp-action-button quiet size="s" onClick={handleSupportLink} style={{ marginTop: "8px" }}>
        Report an Issue
      </sp-action-button>
    </div>
  );
};
