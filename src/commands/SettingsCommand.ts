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
  DEFAULT_CACHE_SIZE_MB,
  PLUGIN_VERSION,
  PLUGIN_NAME,
  STORAGE_KEY_ASSET_MAPPINGS,
  ISSUES_URL,
} from "../utils/constants";
import { formatFileSize } from "../utils/format";
import { loadSettings, saveSettings, estimateCacheSize, formatTimestamp } from "../utils/settings";
import { translate, detectLocale } from "../i18n";
import type { PluginSettings } from "../types";

/** Escape HTML to prevent XSS when rendering user/API data into innerHTML. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function runSettingsCommand(
  hostService: HostService,
  offlineService: OfflineService,
  auditService: AuditService,
): Promise<void> {
  const locale = detectLocale();
  const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
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
      <sp-heading size="S" style="margin-bottom: 12px;">${escapeHtml(t("command.settings"))}</sp-heading>

      <!-- Preferences -->
      <sp-detail size="M" style="padding: 8px 0 4px;">${escapeHtml(t("settings.preferences"))}</sp-detail>

      <div style="margin-bottom: 12px;">
        <div style="font-size: 11px; color: #999; margin-bottom: 4px;">${escapeHtml(t("settings.exportPreset"))}</div>
        <select id="settings-export-preset" style="width: 100%; padding: 4px; background: #2a2a2a; color: #e0e0e0; border: 1px solid #444; border-radius: 4px;">
          <option value="Match Source - Adaptive High Bitrate">${escapeHtml(t("settings.presetMatchSource"))}</option>
          <option value="H.264 - Match Source - High Bitrate">${escapeHtml(t("settings.presetH264High"))}</option>
          <option value="H.264 - Match Source - Medium Bitrate">${escapeHtml(t("settings.presetH264Medium"))}</option>
          <option value="ProRes 422">${escapeHtml(t("settings.presetProRes422"))}</option>
          <option value="ProRes 422 HQ">${escapeHtml(t("settings.presetProRes422HQ"))}</option>
        </select>
      </div>

      <div style="margin-bottom: 12px;">
        <div style="font-size: 11px; color: #999; margin-bottom: 4px;">${escapeHtml(t("settings.captionLanguage"))}</div>
        <select id="settings-caption-lang" style="width: 100%; padding: 4px; background: #2a2a2a; color: #e0e0e0; border: 1px solid #444; border-radius: 4px;">
          <option value="en">${escapeHtml(t("lang.english"))}</option>
          <option value="es">${escapeHtml(t("lang.spanish"))}</option>
          <option value="fr">${escapeHtml(t("lang.french"))}</option>
          <option value="de">${escapeHtml(t("lang.german"))}</option>
          <option value="ja">${escapeHtml(t("lang.japanese"))}</option>
          <option value="zh">${escapeHtml(t("lang.chinese"))}</option>
          <option value="ar">${escapeHtml(t("lang.arabic"))}</option>
          <option value="pt">${escapeHtml(t("lang.portuguese"))}</option>
          <option value="ko">${escapeHtml(t("lang.korean"))}</option>
          <option value="it">${escapeHtml(t("lang.italian"))}</option>
          <option value="ru">${escapeHtml(t("lang.russian"))}</option>
          <option value="hi">${escapeHtml(t("lang.hindi"))}</option>
        </select>
      </div>

      <div style="height: 1px; background: #444; margin: 12px 0;"></div>

      <!-- Cache & Storage -->
      <sp-detail size="M" style="padding: 0 0 8px;">${escapeHtml(t("settings.cacheStorage"))}</sp-detail>
      <div style="font-size: 11px; color: #999; margin-bottom: 8px;">
        <div><span id="settings-cache-size">${escapeHtml(t("settings.cacheSize", { size: formatFileSize(cacheSize) }))}</span></div>
        <div>${escapeHtml(t("settings.importedAssets", { count: mappingCount }))}</div>
        <div>${escapeHtml(t("settings.offlineCachedEntries", { count: offlineStatus.cacheEntryCount }))}</div>
        <div>${escapeHtml(t("settings.offlineCacheSize", { size: offlineStatus.cacheSizeMB.toFixed(1) }))}</div>
        ${offlineStatus.pendingOperations > 0 ? `<div>${escapeHtml(t("settings.pendingSyncOps", { count: offlineStatus.pendingOperations }))}</div>` : ""}
      </div>

      <div style="margin-bottom: 8px;">
        <div style="font-size: 11px; color: #999; margin-bottom: 4px;">${escapeHtml(t("settings.maxCacheSize"))}</div>
        <input id="settings-cache-max" type="number" value="${settings.maxCacheSizeMB}"
          style="width: 80px; padding: 4px; background: #2a2a2a; color: #e0e0e0; border: 1px solid #444; border-radius: 4px;" />
      </div>

      <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">
        <sp-button id="settings-clear-cache" variant="secondary" size="s">${escapeHtml(t("settings.clearCache"))}</sp-button>
        <sp-button id="settings-clear-mappings" variant="secondary" size="s">${escapeHtml(t("settings.clearMappings"))}</sp-button>
      </div>

      <div style="height: 1px; background: #444; margin: 12px 0;"></div>

      <!-- Audit Trail -->
      <sp-detail size="M" style="padding: 0 0 8px;">${escapeHtml(t("settings.auditTrail"))}</sp-detail>
      <div id="settings-audit" style="max-height: 120px; overflow-y: auto; font-size: 10px; margin-bottom: 8px;">
        ${
          auditEntries.length === 0
            ? `<div style="color: #666; text-align: center; padding: 8px;">${escapeHtml(t("settings.noAuditEntries"))}</div>`
            : auditEntries
                .map(
                  (e) =>
                    `<div style="padding: 2px 0; border-bottom: 1px solid #333;">
                      <span style="background: #333; padding: 1px 4px; border-radius: 2px; font-size: 9px;">${escapeHtml(e.action)}</span>
                      <span style="color: #888; margin-left: 4px;">${escapeHtml(formatTimestamp(e.timestamp))}</span>
                      ${e.entryId ? `<div style="color: #777; font-family: monospace; font-size: 9px;">${escapeHtml(e.entryId)}</div>` : ""}
                    </div>`,
                )
                .join("")
        }
      </div>
      <sp-button id="settings-clear-audit" variant="secondary" size="s">${escapeHtml(t("settings.clearLog"))}</sp-button>

      <div style="height: 1px; background: #444; margin: 12px 0;"></div>

      <!-- About -->
      <sp-detail size="M" style="padding: 0 0 4px;">${escapeHtml(t("settings.about"))}</sp-detail>
      <div style="font-size: 11px; color: #999;">
        <div><strong>${PLUGIN_NAME}</strong></div>
        <div>${escapeHtml(t("settings.pluginVersion", { version: PLUGIN_VERSION }))}</div>
        <div>${escapeHtml(t("settings.host", { name: hostAppInfo?.name ?? "Unknown", version: hostAppInfo?.version ?? "" }))}</div>
        <div>${escapeHtml(t("settings.license"))}</div>
      </div>
      <sp-button id="settings-support" variant="secondary" size="s" style="margin-top: 8px;">${escapeHtml(t("settings.reportIssue"))}</sp-button>

      <div style="height: 1px; background: #444; margin: 16px 0 12px;"></div>

      <!-- Dialog actions -->
      <div style="display: flex; justify-content: flex-end;">
        <sp-button id="settings-close" variant="cta" size="s">${escapeHtml(t("command.done"))}</sp-button>
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
    if (sizeEl)
      sizeEl.textContent = t("settings.cacheSize", { size: formatFileSize(estimateCacheSize()) });
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
      auditEl.innerHTML = `<div style="color: #666; text-align: center; padding: 8px;">${escapeHtml(t("settings.noAuditEntries"))}</div>`;
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
      title: t("command.settings"),
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
