/**
 * SettingsCommand — opens a modal dialog with local-only plugin settings.
 *
 * Uses vanilla JS (no React) per Adobe's modal dialog pattern since
 * command entrypoints do not have a persistent DOM.
 *
 * Contains: Preferences, Cache & Storage, Audit Trail, About.
 * No auth required — all data is local.
 */
import { HostService, HostAppInfo } from "../services/HostService";
import { OfflineService } from "../services/OfflineService";
import { AuditService } from "../services/AuditService";
import {
  DEFAULT_SERVICE_URL,
  DEFAULT_CACHE_SIZE_MB,
  PLUGIN_VERSION,
  PLUGIN_NAME,
  STORAGE_KEY_SETTINGS,
  STORAGE_KEY_ASSET_MAPPINGS,
  ISSUES_URL,
} from "../utils/constants";
import { formatFileSize } from "../utils/format";
import type { PluginSettings } from "../types";

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

export async function runSettingsCommand(
  hostService: HostService,
  offlineService: OfflineService,
  auditService: AuditService,
): Promise<void> {
  const settings = loadSettings();
  const hostAppInfo: HostAppInfo | null = hostService.getAppInfo();
  const cacheSize = estimateCacheSize();
  const mappingCount = hostService.getAllMappings().size;
  const offlineStatus = offlineService.getSyncStatus();
  const auditEntries = auditService.getLocalLog().slice().reverse().slice(0, 50);

  const dialog = document.createElement("dialog");
  dialog.id = "kaltura-settings-dialog";

  dialog.innerHTML = `
    <div style="padding: 16px; min-width: 320px; max-width: 500px;">
      <sp-heading size="S" style="margin-bottom: 12px;">Settings</sp-heading>

      <!-- Preferences -->
      <sp-detail size="M" style="padding: 8px 0 4px;">Preferences</sp-detail>

      <div style="margin-bottom: 12px;">
        <div style="font-size: 11px; color: #999; margin-bottom: 4px;">Default Export Preset</div>
        <select id="settings-export-preset" style="width: 100%; padding: 4px; background: #2a2a2a; color: #e0e0e0; border: 1px solid #444; border-radius: 4px;">
          <option value="Match Source - Adaptive High Bitrate">Match Source - Adaptive High Bitrate</option>
          <option value="H.264 - Match Source - High Bitrate">H.264 - High Bitrate</option>
          <option value="H.264 - Match Source - Medium Bitrate">H.264 - Medium Bitrate</option>
          <option value="ProRes 422">ProRes 422</option>
          <option value="ProRes 422 HQ">ProRes 422 HQ</option>
        </select>
      </div>

      <div style="margin-bottom: 12px;">
        <div style="font-size: 11px; color: #999; margin-bottom: 4px;">Default Caption Language</div>
        <select id="settings-caption-lang" style="width: 100%; padding: 4px; background: #2a2a2a; color: #e0e0e0; border: 1px solid #444; border-radius: 4px;">
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

      <div style="height: 1px; background: #444; margin: 12px 0;"></div>

      <!-- Cache & Storage -->
      <sp-detail size="M" style="padding: 0 0 8px;">Cache & Storage</sp-detail>
      <div style="font-size: 11px; color: #999; margin-bottom: 8px;">
        <div>Cache size: <span id="settings-cache-size">${formatFileSize(cacheSize)}</span></div>
        <div>Imported assets: ${mappingCount}</div>
        <div>Offline cached entries: ${offlineStatus.cacheEntryCount}</div>
        <div>Offline cache: ${offlineStatus.cacheSizeMB.toFixed(1)} MB</div>
        ${offlineStatus.pendingOperations > 0 ? `<div>Pending sync operations: ${offlineStatus.pendingOperations}</div>` : ""}
      </div>

      <div style="margin-bottom: 8px;">
        <div style="font-size: 11px; color: #999; margin-bottom: 4px;">Max Cache Size (MB)</div>
        <input id="settings-cache-max" type="number" value="${settings.maxCacheSizeMB}"
          style="width: 80px; padding: 4px; background: #2a2a2a; color: #e0e0e0; border: 1px solid #444; border-radius: 4px;" />
      </div>

      <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">
        <sp-button id="settings-clear-cache" variant="secondary" size="s">Clear Cache</sp-button>
        <sp-button id="settings-clear-mappings" variant="secondary" size="s">Clear Mappings</sp-button>
      </div>

      <div style="height: 1px; background: #444; margin: 12px 0;"></div>

      <!-- Audit Trail -->
      <sp-detail size="M" style="padding: 0 0 8px;">Audit Trail</sp-detail>
      <div id="settings-audit" style="max-height: 120px; overflow-y: auto; font-size: 10px; margin-bottom: 8px;">
        ${
          auditEntries.length === 0
            ? '<div style="color: #666; text-align: center; padding: 8px;">No audit entries yet</div>'
            : auditEntries
                .map(
                  (e) =>
                    `<div style="padding: 2px 0; border-bottom: 1px solid #333;">
                      <span style="background: #333; padding: 1px 4px; border-radius: 2px; font-size: 9px;">${e.action}</span>
                      <span style="color: #888; margin-left: 4px;">${formatTimestamp(e.timestamp)}</span>
                      ${e.entryId ? `<div style="color: #777; font-family: monospace; font-size: 9px;">${e.entryId}</div>` : ""}
                    </div>`,
                )
                .join("")
        }
      </div>
      <sp-button id="settings-clear-audit" variant="secondary" size="s">Clear Audit Log</sp-button>

      <div style="height: 1px; background: #444; margin: 12px 0;"></div>

      <!-- About -->
      <sp-detail size="M" style="padding: 0 0 4px;">About</sp-detail>
      <div style="font-size: 11px; color: #999;">
        <div><strong>${PLUGIN_NAME}</strong></div>
        <div>Plugin Version: ${PLUGIN_VERSION}</div>
        <div>Host: ${hostAppInfo?.name ?? "Unknown"} ${hostAppInfo?.version ?? ""}</div>
        <div>License: AGPL-3.0</div>
      </div>
      <sp-button id="settings-support" variant="secondary" size="s" style="margin-top: 8px;">Report an Issue</sp-button>

      <div style="height: 1px; background: #444; margin: 16px 0 12px;"></div>

      <!-- Dialog actions -->
      <div style="display: flex; justify-content: flex-end;">
        <sp-button id="settings-close" variant="cta" size="s">Done</sp-button>
      </div>
    </div>
  `.trim();

  document.body.appendChild(dialog);

  // Set initial values
  const exportPreset = dialog.querySelector("#settings-export-preset") as HTMLSelectElement;
  const captionLang = dialog.querySelector("#settings-caption-lang") as HTMLSelectElement;
  const cacheMaxInput = dialog.querySelector("#settings-cache-max") as HTMLInputElement;

  exportPreset.value = settings.defaultExportPreset;
  captionLang.value = settings.defaultCaptionLanguage;

  // Wire up event listeners
  const closeBtn = dialog.querySelector("#settings-close")!;
  closeBtn.addEventListener("click", () => dialog.close("ok"));

  const clearCacheBtn = dialog.querySelector("#settings-clear-cache")!;
  clearCacheBtn.addEventListener("click", () => {
    localStorage.removeItem("kaltura_thumbnail_cache");
    localStorage.removeItem("kaltura_search_cache");
    offlineService.clearCache();
    const sizeEl = dialog.querySelector("#settings-cache-size");
    if (sizeEl) sizeEl.textContent = formatFileSize(estimateCacheSize());
  });

  const clearMappingsBtn = dialog.querySelector("#settings-clear-mappings")!;
  clearMappingsBtn.addEventListener("click", () => {
    hostService.clearMappings();
    localStorage.removeItem(STORAGE_KEY_ASSET_MAPPINGS);
  });

  const clearAuditBtn = dialog.querySelector("#settings-clear-audit")!;
  clearAuditBtn.addEventListener("click", () => {
    auditService.clearLocalLog();
    const auditEl = dialog.querySelector("#settings-audit");
    if (auditEl)
      auditEl.innerHTML =
        '<div style="color: #666; text-align: center; padding: 8px;">No audit entries yet</div>';
  });

  const supportBtn = dialog.querySelector("#settings-support")!;
  supportBtn.addEventListener("click", () => {
    try {
      const uxp = require("uxp");
      uxp.shell.openExternal(ISSUES_URL);
    } catch {
      window.open(ISSUES_URL, "_blank");
    }
  });

  // Show modal
  try {
    await (
      dialog as HTMLDialogElement & { uxpShowModal: (opts: unknown) => Promise<string> }
    ).uxpShowModal({
      title: "Kaltura Settings",
      resize: "both",
      size: { width: 420, height: 580 },
    });
  } catch {
    // Dialog cancelled via Esc or title bar close — that's fine
  }

  // Save settings on close
  const newSettings: PluginSettings = {
    ...settings,
    defaultExportPreset: exportPreset.value,
    defaultCaptionLanguage: captionLang.value,
    maxCacheSizeMB: Math.max(1, parseInt(cacheMaxInput.value, 10) || DEFAULT_CACHE_SIZE_MB),
  };
  saveSettings(newSettings);

  // Clean up DOM
  if (dialog.parentNode) {
    dialog.parentNode.removeChild(dialog);
  }
}
