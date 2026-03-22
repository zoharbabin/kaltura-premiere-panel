import React, { useState, useEffect, useCallback } from "react";
import { PluginSettings } from "../types";
import { HostService, HostAppInfo } from "../services/HostService";
import {
  PLUGIN_VERSION,
  PLUGIN_NAME,
  STORAGE_KEY_ASSET_MAPPINGS,
  ISSUES_URL,
} from "../utils/constants";
import { formatFileSize } from "../utils/format";
import { loadSettings, saveSettings, estimateCacheSize, formatTimestamp } from "../utils/settings";
import { ConfirmDialog } from "../components";
import { useTranslation } from "../i18n";

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
  currentServerUrl?: string;
  currentPartnerId?: number | null;
  userName?: string | null;
  userEmail?: string | null;
  hostService: HostService;
  offlineService?: OfflineServiceLike;
  auditService?: AuditServiceLike;
  onLogout?: () => void;
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
}) => {
  const { t } = useTranslation();
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
    onLogout?.();
  }, [onLogout]);

  const handleSupportLink = useCallback(() => {
    const url = ISSUES_URL;
    try {
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
    <div className="panel-scroll">
      {/* Logout confirmation */}
      {showLogoutConfirm && (
        <ConfirmDialog
          title={t("settings.signOutTitle")}
          message={t("settings.confirmSignOut")}
          confirmLabel={t("settings.signOut")}
          variant="negative"
          onConfirm={handleLogout}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}

      {/* Account */}
      <sp-detail size="M" style={{ padding: "8px 0 4px" }}>
        {t("settings.account")}
      </sp-detail>
      <div className="settings-section">
        {userName && (
          <div>
            <strong>{t("settings.user")}</strong> {userName}
          </div>
        )}
        {userEmail && (
          <div>
            <strong>{t("settings.email")}</strong> {userEmail}
          </div>
        )}
        <div>
          <strong>{t("settings.server")}</strong> {currentServerUrl}
        </div>
        {currentPartnerId && (
          <div>
            <strong>{t("settings.partnerId")}</strong> {currentPartnerId}
          </div>
        )}
      </div>
      <sp-button
        variant="secondary"
        size="s"
        onClick={() => setShowLogoutConfirm(true)}
        style={{ marginTop: "8px" }}
      >
        {t("settings.signOut")}
      </sp-button>

      <sp-divider size="s" className="settings-section-divider" />

      {/* Preferences */}
      <sp-detail size="M" style={{ marginBottom: "8px" }}>
        {t("settings.preferences")}
      </sp-detail>

      <div style={{ marginBottom: 12 }}>
        <div className="form-label">{t("settings.exportPreset")}</div>
        <select
          className="native-select"
          value={settings.defaultExportPreset}
          onChange={(e) => updateSetting("defaultExportPreset", e.target.value)}
        >
          <option value="Match Source - Adaptive High Bitrate">
            {t("settings.presetMatchSource")}
          </option>
          <option value="H.264 - Match Source - High Bitrate">
            {t("settings.presetH264High")}
          </option>
          <option value="H.264 - Match Source - Medium Bitrate">
            {t("settings.presetH264Medium")}
          </option>
          <option value="ProRes 422">{t("settings.presetProRes422")}</option>
          <option value="ProRes 422 HQ">{t("settings.presetProRes422HQ")}</option>
        </select>
      </div>

      {hostAppInfo?.supportsVideo && (
        <div style={{ marginBottom: 12 }}>
          <div className="form-label">{t("settings.captionLanguage")}</div>
          <select
            className="native-select"
            value={settings.defaultCaptionLanguage}
            onChange={(e) => updateSetting("defaultCaptionLanguage", e.target.value)}
          >
            <option value="en">{t("lang.english")}</option>
            <option value="es">{t("lang.spanish")}</option>
            <option value="fr">{t("lang.french")}</option>
            <option value="de">{t("lang.german")}</option>
            <option value="ja">{t("lang.japanese")}</option>
            <option value="zh">{t("lang.chinese")}</option>
            <option value="ar">{t("lang.arabic")}</option>
            <option value="pt">{t("lang.portuguese")}</option>
            <option value="ko">{t("lang.korean")}</option>
            <option value="it">{t("lang.italian")}</option>
            <option value="ru">{t("lang.russian")}</option>
            <option value="hi">{t("lang.hindi")}</option>
          </select>
        </div>
      )}

      <sp-divider size="s" className="settings-section-divider" />

      {/* Cache & Storage */}
      <sp-detail size="M" style={{ padding: "0 0 8px" }}>
        {t("settings.cacheStorage")}
      </sp-detail>
      <div className="text-muted" style={{ fontSize: 11, marginBottom: 8 }}>
        <div>{t("settings.cacheSize", { size: formatFileSize(cacheSize) })}</div>
        <div>{t("settings.importedAssets", { count: mappingCount })}</div>
        {offlineStatus && (
          <>
            <div>
              {t("settings.offlineCachedEntries", { count: offlineStatus.cacheEntryCount })}
            </div>
            <div>
              {t("settings.offlineCacheSize", { size: offlineStatus.cacheSizeMB.toFixed(1) })}
            </div>
            {offlineStatus.pendingOperations > 0 && (
              <div>{t("settings.pendingSyncOps", { count: offlineStatus.pendingOperations })}</div>
            )}
          </>
        )}
      </div>

      {/* Offline cache size setting */}
      <div style={{ marginBottom: "8px" }}>
        <div className="form-label">{t("settings.maxCacheSize")}</div>
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
          {t("settings.clearCache")}
        </sp-button>
        <sp-button variant="secondary" size="s" onClick={handleClearAssetMappings}>
          {t("settings.clearMappings")}
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
            {t("settings.clearPendingOps")}
          </sp-button>
        )}
      </div>

      <sp-divider size="s" className="settings-section-divider" />

      {/* Audit Trail */}
      {auditService && (
        <>
          <sp-detail size="M" style={{ padding: "0 0 8px" }}>
            {t("settings.auditTrail")}
          </sp-detail>

          {!showAuditLog ? (
            <sp-button variant="secondary" size="s" onClick={handleShowAuditLog}>
              {t("settings.viewAuditLog", { count: auditService.getLocalLog().length })}
            </sp-button>
          ) : (
            <div>
              <div style={{ display: "flex", marginBottom: "8px" }}>
                <sp-button variant="secondary" size="s" onClick={() => setShowAuditLog(false)}>
                  {t("settings.hideLog")}
                </sp-button>
                <sp-button variant="secondary" size="s" onClick={handleClearAuditLog}>
                  {t("settings.clearLog")}
                </sp-button>
              </div>
              <div className="audit-log">
                {auditEntries.length === 0 ? (
                  <div
                    className="text-muted-light"
                    style={{ padding: 12, textAlign: "center", fontSize: 11 }}
                  >
                    {t("settings.noAuditEntries")}
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
        {t("settings.about")}
      </sp-detail>
      <div className="text-muted" style={{ fontSize: 11 }}>
        <div>
          <strong>{PLUGIN_NAME}</strong>
        </div>
        <div>{t("settings.pluginVersion", { version: PLUGIN_VERSION })}</div>
        <div>
          {t("settings.host", {
            name: hostAppInfo?.name ?? "Unknown",
            version: hostAppInfo?.version ?? "",
          })}
        </div>
        <div>{t("settings.license")}</div>
      </div>
      <sp-action-button quiet size="s" onClick={handleSupportLink} style={{ marginTop: "8px" }}>
        {t("settings.reportIssue")}
      </sp-action-button>
    </div>
  );
};
