import { KalturaClient } from "./KalturaClient";
import { MediaService } from "./MediaService";
import { KalturaFlavorAsset, KalturaListResponse } from "../types/kaltura";
import { ImportResult } from "../types/premiere";
import { createLogger } from "../utils/logger";

const log = createLogger("ProxyService");

const MIN_PROXY_HEIGHT = 720;

/** Minimal host interface — only the methods ProxyService actually uses */
interface ProxyHostService {
  importFile(filePath: string): Promise<ImportResult>;
  storeMapping(entryId: string, localPath: string): void;
}

export interface ProxyDownloadResult {
  localPath: string;
  proxyFlavor: KalturaFlavorAsset;
  entryId: string;
}

export interface ReconnectResult {
  originalFlavor: KalturaFlavorAsset;
  downloadUrl: string;
}

/**
 * Manages proxy workflow: download low-res proxies for editing,
 * then reconnect to original quality for final output.
 */
export class ProxyService {
  private loadedProxies = new Map<string, ProxyDownloadResult>();

  constructor(
    private client: KalturaClient,
    private mediaService: MediaService,
    private hostService: ProxyHostService,
  ) {}

  /**
   * Find the best proxy flavor for an entry.
   * Selects the lowest resolution flavor that is >= 720p height.
   * If none meet that threshold, returns the lowest resolution available.
   */
  async getProxyFlavor(entryId: string): Promise<KalturaFlavorAsset | null> {
    const flavors = await this.getFlavors(entryId);

    if (flavors.length === 0) {
      log.warn("No flavors found for entry", { entryId });
      return null;
    }

    // Filter out original flavors
    const transcoded = flavors.filter((f) => !f.isOriginal);
    const candidates = transcoded.length > 0 ? transcoded : flavors;

    // Sort by height ascending
    const sorted = [...candidates].sort((a, b) => a.height - b.height);

    // Prefer lowest resolution >= 720p
    const aboveThreshold = sorted.find((f) => f.height >= MIN_PROXY_HEIGHT);
    if (aboveThreshold) {
      log.info("Selected proxy flavor", {
        entryId,
        flavorId: aboveThreshold.id,
        resolution: `${aboveThreshold.width}x${aboveThreshold.height}`,
      });
      return aboveThreshold;
    }

    // Fall back to lowest available
    const lowest = sorted[0];
    log.info("No flavor >= 720p, using lowest available", {
      entryId,
      flavorId: lowest.id,
      resolution: `${lowest.width}x${lowest.height}`,
    });
    return lowest;
  }

  /**
   * Find the highest quality flavor for an entry (highest bitrate).
   */
  async getOriginalFlavor(entryId: string): Promise<KalturaFlavorAsset | null> {
    const flavors = await this.getFlavors(entryId);

    if (flavors.length === 0) {
      log.warn("No flavors found for entry", { entryId });
      return null;
    }

    // Prefer the original source flavor
    const original = flavors.find((f) => f.isOriginal);
    if (original) {
      log.info("Found original flavor", { entryId, flavorId: original.id });
      return original;
    }

    // Fall back to highest bitrate
    const sorted = [...flavors].sort((a, b) => b.bitrate - a.bitrate);
    const best = sorted[0];
    log.info("No original flavor, using highest bitrate", {
      entryId,
      flavorId: best.id,
      bitrate: best.bitrate,
    });
    return best;
  }

  /**
   * Download a proxy version of the entry and import it into Premiere.
   * Returns the local path, proxy flavor info, and entry ID.
   */
  async downloadProxy(
    entryId: string,
    onProgress?: (percent: number) => void,
  ): Promise<ProxyDownloadResult> {
    const existing = this.loadedProxies.get(entryId);
    if (existing) {
      log.info("Proxy already loaded, reusing", { entryId });
      return existing;
    }

    const proxyFlavor = await this.getProxyFlavor(entryId);
    if (!proxyFlavor) {
      throw new Error(`No proxy flavor available for entry ${entryId}`);
    }

    log.info("Downloading proxy", {
      entryId,
      flavorId: proxyFlavor.id,
      resolution: `${proxyFlavor.width}x${proxyFlavor.height}`,
    });

    const downloadUrl = await this.mediaService.getFlavorDownloadUrl(entryId, proxyFlavor.id);
    const fileName = `proxy_${entryId}_${proxyFlavor.id}.${proxyFlavor.fileExt || "mp4"}`;
    const localPath = await this.downloadFile(downloadUrl, fileName, onProgress);

    const importResult = await this.hostService.importFile(localPath);
    if (!importResult.success) {
      throw new Error(importResult.error || "Failed to import proxy into host app");
    }

    const result: ProxyDownloadResult = {
      localPath,
      proxyFlavor,
      entryId,
    };

    this.loadedProxies.set(entryId, result);
    this.hostService.storeMapping(entryId, localPath);

    log.info("Proxy downloaded and imported", { entryId, localPath });
    return result;
  }

  /**
   * Reconnect an entry to its original (highest quality) flavor.
   * Returns the original flavor info and download URL for Premiere to relink.
   */
  async reconnectToOriginal(entryId: string): Promise<ReconnectResult> {
    const originalFlavor = await this.getOriginalFlavor(entryId);
    if (!originalFlavor) {
      throw new Error(`No original flavor available for entry ${entryId}`);
    }

    log.info("Reconnecting to original", {
      entryId,
      flavorId: originalFlavor.id,
      bitrate: originalFlavor.bitrate,
    });

    const downloadUrl = await this.mediaService.getFlavorDownloadUrl(entryId, originalFlavor.id);

    // Update the mapping to reflect original quality
    this.hostService.storeMapping(entryId, downloadUrl);

    // Remove from loaded proxies since we are switching to original
    this.loadedProxies.delete(entryId);

    log.info("Reconnected to original", { entryId, flavorId: originalFlavor.id });

    return {
      originalFlavor,
      downloadUrl,
    };
  }

  /** Check if a proxy for this entry is currently loaded */
  isProxyLoaded(entryId: string): boolean {
    return this.loadedProxies.has(entryId);
  }

  private async getFlavors(entryId: string): Promise<KalturaFlavorAsset[]> {
    const response = await this.client.request<KalturaListResponse<KalturaFlavorAsset>>({
      service: "flavorAsset",
      action: "list",
      params: {
        filter: {
          objectType: "KalturaFlavorAssetFilter",
          entryIdEqual: entryId,
        },
      },
    });

    return response.objects || [];
  }

  private async downloadFile(
    url: string,
    fileName: string,
    onProgress?: (percent: number) => void,
  ): Promise<string> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status}`);
    }

    const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error("Download stream not available");
    }

    const chunks: Uint8Array[] = [];
    let loaded = 0;

    let readDone = false;
    while (!readDone) {
      const { done, value } = await reader.read();
      if (done) {
        readDone = true;
        break;
      }

      chunks.push(value);
      loaded += value.length;

      if (onProgress && contentLength > 0) {
        onProgress(Math.round((loaded / contentLength) * 100));
      }
    }

    return this.saveTempFile(fileName, chunks);
  }

  private async writeBinary(
    file: { write: (data: unknown, opts?: unknown) => Promise<void> },
    data: Uint8Array,
    formats: { binary: unknown },
  ): Promise<void> {
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    try {
      await file.write(buf, { format: formats.binary });
      return;
    } catch {
      /* fall through */
    }
    try {
      await file.write(data, { format: formats.binary });
      return;
    } catch {
      /* fall through */
    }
    try {
      await file.write(buf);
      return;
    } catch {
      /* fall through */
    }
    await file.write(data);
  }

  private async saveTempFile(fileName: string, chunks: Uint8Array[]): Promise<string> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const uxp = require("uxp");
      const fs = uxp.storage.localFileSystem;
      let folder;
      try {
        folder = await fs.getDataFolder();
      } catch {
        folder = await fs.getTemporaryFolder();
      }
      const file = await folder.createFile(fileName, { overwrite: true });
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const merged = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      await this.writeBinary(file, merged, uxp.storage.formats);

      let resolvedPath: string | undefined = file.nativePath;
      if (!resolvedPath || typeof resolvedPath !== "string") {
        const folderPath = folder.nativePath;
        if (folderPath && typeof folderPath === "string") {
          const sep = folderPath.includes("\\") ? "\\" : "/";
          resolvedPath = `${folderPath}${sep}${fileName}`;
        }
      }
      if (!resolvedPath || typeof resolvedPath !== "string") {
        throw new Error(
          `UXP file entry has no valid nativePath (got ${typeof file.nativePath}: ${String(file.nativePath)})`,
        );
      }

      log.info("Saved proxy file for import", { resolvedPath, size: totalLength });
      return resolvedPath;
    } catch (err) {
      log.error("UXP file save failed", err);
      throw new Error(
        `Failed to save proxy file: ${err instanceof Error ? err.message : "UXP storage not available"}`,
      );
    }
  }
}
