import React, { useState, useEffect, useCallback } from "react";
import { PluginSettings } from "../types";
import { PremiereService } from "../services/PremiereService";
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

interface SettingsPanelProps {
  currentServerUrl: string;
  currentPartnerId: number | null;
  userName: string | null;
  userEmail: string | null;
  premiereService: PremiereService;
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

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  currentServerUrl,
  currentPartnerId,
  userName,
  userEmail,
  premiereService,
  onLogout,
  onServerUrlChange: _onServerUrlChange,
}) => {
  const [settings, setSettings] = useState<PluginSettings>(loadSettings);
  const [premiereVersion, setPremiereVersion] = useState<string>("N/A");
  const [cacheSize, setCacheSize] = useState(estimateCacheSize());
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [mappingCount, setMappingCount] = useState(0);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    setPremiereVersion(premiereService.getVersion());
    setMappingCount(premiereService.getAllMappings().size);
  }, [premiereService]);

  const updateSetting = useCallback(
    <K extends keyof PluginSettings>(key: K, value: PluginSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleClearThumbnailCache = useCallback(() => {
    localStorage.removeItem("kaltura_thumbnail_cache");
    localStorage.removeItem("kaltura_search_cache");
    setCacheSize(estimateCacheSize());
  }, []);

  const handleClearAssetMappings = useCallback(() => {
    premiereService.clearMappings();
    localStorage.removeItem(STORAGE_KEY_ASSET_MAPPINGS);
    setMappingCount(0);
    setCacheSize(estimateCacheSize());
  }, [premiereService]);

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
      </div>

      <sp-divider size="s" style={{ margin: "16px 0" }} />

      {/* Cache */}
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
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <sp-button variant="secondary" size="s" onClick={handleClearThumbnailCache}>
          Clear Cache
        </sp-button>
        <sp-button variant="secondary" size="s" onClick={handleClearAssetMappings}>
          Clear Mappings
        </sp-button>
      </div>

      <sp-divider size="s" style={{ margin: "16px 0" }} />

      {/* About */}
      <sp-detail size="M" style={{ padding: "0 0 4px" }}>
        About
      </sp-detail>
      <div style={{ fontSize: "11px", color: "var(--spectrum-global-color-gray-600)" }}>
        <div>
          <strong>{PLUGIN_NAME}</strong>
        </div>
        <div>Plugin Version: {PLUGIN_VERSION}</div>
        <div>Premiere Pro: {premiereVersion}</div>
        <div>License: AGPL-3.0</div>
      </div>
      <sp-action-button quiet size="s" onClick={handleSupportLink} style={{ marginTop: "8px" }}>
        Report an Issue
      </sp-action-button>
    </div>
  );
};
