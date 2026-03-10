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
    <div className="panel-root panel-padding" style={{ overflowY: "auto" }}>
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
      <div className="settings-section">
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

      <sp-divider size="s" className="settings-section-divider" />

      {/* Preferences */}
      <sp-detail size="M" style={{ marginBottom: "8px" }}>
        Preferences
      </sp-detail>

      <div style={{ marginBottom: 12 }}>
        <div className="form-label">Default Export Preset</div>
        <select
          className="native-select"
          value={settings.defaultExportPreset}
          onChange={(e) => updateSetting("defaultExportPreset", e.target.value)}
        >
          <option value="Match Source - Adaptive High Bitrate">
            Match Source - Adaptive High Bitrate
          </option>
          <option value="H.264 - Match Source - High Bitrate">H.264 - High Bitrate</option>
          <option value="H.264 - Match Source - Medium Bitrate">H.264 - Medium Bitrate</option>
          <option value="ProRes 422">ProRes 422</option>
          <option value="ProRes 422 HQ">ProRes 422 HQ</option>
        </select>
      </div>

      {hostAppInfo?.supportsVideo && (
        <div style={{ marginBottom: 12 }}>
          <div className="form-label">Default Caption Language</div>
          <select
            className="native-select"
            value={settings.defaultCaptionLanguage}
            onChange={(e) => updateSetting("defaultCaptionLanguage", e.target.value)}
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="ja">Japanese</option>
            <option value="zh">Chinese</option>
            <option value="ar">Arabic</option>
            <option value="pt">Portuguese</option>
            <option value="ko">Korean</option>
            <option value="it">Italian</option>
            <option value="ru">Russian</option>
            <option value="hi">Hindi</option>
          </select>
        </div>
      )}

      <sp-divider size="s" className="settings-section-divider" />

      {/* Cache & Storage */}
      <sp-detail size="M" style={{ padding: "0 0 8px" }}>
        Cache & Storage
      </sp-detail>
      <div className="text-muted" style={{ fontSize: 11, marginBottom: 8 }}>
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
        <div className="form-label">Max Cache Size (MB)</div>
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

      <div style={{ display: "flex", flexWrap: "wrap" }}>
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

      <sp-divider size="s" className="settings-section-divider" />

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
              <div style={{ display: "flex", marginBottom: "8px" }}>
                <sp-button variant="secondary" size="s" onClick={() => setShowAuditLog(false)}>
                  Hide Log
                </sp-button>
                <sp-button variant="secondary" size="s" onClick={handleClearAuditLog}>
                  Clear Log
                </sp-button>
              </div>
              <div className="audit-log">
                {auditEntries.length === 0 ? (
                  <div
                    className="text-muted-light"
                    style={{ padding: 12, textAlign: "center", fontSize: 11 }}
                  >
                    No audit entries yet
                  </div>
                ) : (
                  auditEntries.map((entry, i) => (
                    <div key={i} className="audit-entry">
                      <div className="flex-row gap-8">
                        <span className="audit-badge">{entry.action}</span>
                        <span className="text-muted-light">{formatTimestamp(entry.timestamp)}</span>
                      </div>
                      {entry.entryId && (
                        <div className="text-mono text-muted" style={{ marginTop: 2 }}>
                          {entry.entryId}
                        </div>
                      )}
                      {entry.details && (
                        <div className="text-muted" style={{ marginTop: 2 }}>
                          {entry.details}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <sp-divider size="s" className="settings-section-divider" />
        </>
      )}

      {/* About */}
      <sp-detail size="M" style={{ padding: "0 0 4px" }}>
        About
      </sp-detail>
      <div className="text-muted" style={{ fontSize: 11 }}>
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
