/**
 * Shared settings utilities used by both SettingsPanel (React) and
 * SettingsCommand (vanilla JS modal dialog).
 */
import { PluginSettings } from "../types";
import { DEFAULT_SERVICE_URL, DEFAULT_CACHE_SIZE_MB, STORAGE_KEY_SETTINGS } from "./constants";

export const defaultSettings: PluginSettings = {
  serverUrl: DEFAULT_SERVICE_URL,
  partnerId: null,
  defaultExportPreset: "Match Source - Adaptive High Bitrate",
  defaultCaptionLanguage: "en",
  downloadLocation: "",
  cacheEnabled: true,
  maxCacheSizeMB: DEFAULT_CACHE_SIZE_MB,
};

export function loadSettings(): PluginSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (stored) return { ...defaultSettings, ...JSON.parse(stored) };
  } catch {
    // ignore
  }
  return defaultSettings;
}

export function saveSettings(settings: PluginSettings): void {
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
}

export function estimateCacheSize(): number {
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

export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
