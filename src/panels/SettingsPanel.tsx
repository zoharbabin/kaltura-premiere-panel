import React, { useState, useEffect, useCallback } from "react";
import { PluginSettings } from "../types";
import {
  DEFAULT_SERVICE_URL,
  DEFAULT_CACHE_SIZE_MB,
  PLUGIN_VERSION,
  PLUGIN_NAME,
  STORAGE_KEY_SETTINGS,
} from "../utils/constants";

interface SettingsPanelProps {
  currentServerUrl: string;
  currentPartnerId: number | null;
  userName: string | null;
  userEmail: string | null;
  onLogout: () => void;
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

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  currentServerUrl,
  currentPartnerId,
  userName,
  userEmail,
  onLogout,
}) => {
  const [settings, setSettings] = useState<PluginSettings>(loadSettings);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const updateSetting = useCallback(
    <K extends keyof PluginSettings>(key: K, value: PluginSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleClearCache = useCallback(() => {
    localStorage.removeItem("kaltura_thumbnail_cache");
    localStorage.removeItem("kaltura_search_cache");
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
      <sp-button variant="secondary" size="s" onClick={onLogout} style={{ marginTop: "8px" }}>
        Sign Out
      </sp-button>

      <sp-divider size="s" style={{ margin: "16px 0" }} />

      {/* Preferences */}
      <sp-detail size="M" style={{ padding: "0 0 8px" }}>
        Preferences
      </sp-detail>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
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
          </sp-picker>
        </div>
      </div>

      <sp-divider size="s" style={{ margin: "16px 0" }} />

      {/* Cache */}
      <sp-detail size="M" style={{ padding: "0 0 8px" }}>
        Cache
      </sp-detail>
      <sp-button variant="secondary" size="s" onClick={handleClearCache}>
        Clear Cache
      </sp-button>

      <sp-divider size="s" style={{ margin: "16px 0" }} />

      {/* About */}
      <sp-detail size="M" style={{ padding: "0 0 4px" }}>
        About
      </sp-detail>
      <div style={{ fontSize: "11px", color: "var(--spectrum-global-color-gray-600)" }}>
        <div>{PLUGIN_NAME}</div>
        <div>Version {PLUGIN_VERSION}</div>
        <div>License: AGPL-3.0</div>
      </div>
    </div>
  );
};
