import { KalturaClient } from "./KalturaClient";
import { KalturaFlavorAsset } from "../types/kaltura";
import { AssetMapping, ImportResult } from "../types/premiere";
import { MediaService } from "./MediaService";
import { NetworkError } from "../utils/errors";
import { MAX_CONCURRENT_DOWNLOADS } from "../utils/constants";
import { createLogger } from "../utils/logger";

/** Minimal host interface needed by DownloadService */
interface DownloadHostService {
  importFile(filePath: string, fileEntry?: unknown): Promise<ImportResult>;
  isImported(entryId: string): boolean;
  storeMapping(entryId: string, localPath: string): void;
}

const log = createLogger("DownloadService");

export interface DownloadProgress {
  entryId: string;
  loaded: number;
  total: number;
  percent: number;
  speed: number;
}

export interface DownloadRequest {
  entryId: string;
  flavorId: string;
  fileName: string;
}

interface ActiveDownload {
  request: DownloadRequest;
  controller: AbortController;
  startTime: number;
}

/**
 * Manages downloading Kaltura assets and importing them into Premiere.
 * Supports concurrent download limiting and progress tracking.
 */
export class DownloadService {
  private activeDownloads = new Map<string, ActiveDownload>();
  private downloadQueue: DownloadRequest[] = [];
  private onProgressCallbacks = new Map<string, (progress: DownloadProgress) => void>();

  constructor(
    private client: KalturaClient,
    private mediaService: MediaService,
    private hostService: DownloadHostService,
  ) {}

  /** Get the number of active downloads */
  get activeCount(): number {
    return this.activeDownloads.size;
  }

  /** Get the download queue length */
  get queueLength(): number {
    return this.downloadQueue.length;
  }

  /**
   * Download and import a Kaltura asset into Premiere.
   * Returns the local file path of the downloaded asset.
   */
  async downloadAndImport(
    entryId: string,
    flavor: KalturaFlavorAsset,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<AssetMapping> {
    const fileName = `${entryId}_${flavor.id}.${flavor.fileExt || "mp4"}`;
    const request: DownloadRequest = { entryId, flavorId: flavor.id, fileName };

    if (onProgress) {
      this.onProgressCallbacks.set(entryId, onProgress);
    }

    if (this.activeDownloads.size >= MAX_CONCURRENT_DOWNLOADS) {
      log.info("Download queued", { entryId, queuePosition: this.downloadQueue.length + 1 });
      this.downloadQueue.push(request);
      return new Promise((resolve, reject) => {
        const check = setInterval(async () => {
          if (this.activeDownloads.has(entryId)) {
            clearInterval(check);
          }
          const idx = this.downloadQueue.indexOf(request);
          if (idx === -1 && !this.activeDownloads.has(entryId)) {
            clearInterval(check);
            try {
              const result = await this.executeDownload(request);
              resolve(result);
            } catch (err) {
              reject(err);
            }
          }
        }, 500);
      });
    }

    return this.executeDownload(request);
  }

  /** Cancel a download */
  cancelDownload(entryId: string): void {
    const active = this.activeDownloads.get(entryId);
    if (active) {
      active.controller.abort();
      this.activeDownloads.delete(entryId);
      this.onProgressCallbacks.delete(entryId);
      log.info("Download cancelled", { entryId });
      this.processQueue();
    }

    const queueIdx = this.downloadQueue.findIndex((r) => r.entryId === entryId);
    if (queueIdx !== -1) {
      this.downloadQueue.splice(queueIdx, 1);
    }
  }

  /** Cancel all downloads */
  cancelAll(): void {
    for (const [entryId, active] of this.activeDownloads) {
      active.controller.abort();
      log.info("Download cancelled", { entryId });
    }
    this.activeDownloads.clear();
    this.downloadQueue = [];
    this.onProgressCallbacks.clear();
  }

  private async executeDownload(request: DownloadRequest): Promise<AssetMapping> {
    const controller = new AbortController();
    const active: ActiveDownload = {
      request,
      controller,
      startTime: Date.now(),
    };
    this.activeDownloads.set(request.entryId, active);

    try {
      log.info("Starting download", { entryId: request.entryId, flavorId: request.flavorId });

      const downloadUrl = await this.mediaService.getFlavorDownloadUrl(
        request.entryId,
        request.flavorId,
      );
      log.info("Download URL", { url: downloadUrl.substring(0, 100) });
      const response = await fetch(downloadUrl, {
        signal: controller.signal,
        redirect: "follow",
      });

      if (!response.ok) {
        throw new NetworkError(`Download failed: HTTP ${response.status} ${response.statusText}`);
      }

      // Verify response is actual media content, not an error page
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html") || contentType.includes("text/xml")) {
        throw new NetworkError(
          `Download returned non-media content (${contentType}). The flavor may not be available.`,
        );
      }

      const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
      const reader = response.body?.getReader();

      if (!reader) {
        throw new NetworkError("Download stream not available");
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

        const elapsed = (Date.now() - active.startTime) / 1000;
        const speed = elapsed > 0 ? loaded / elapsed : 0;
        const progressCallback = this.onProgressCallbacks.get(request.entryId);
        progressCallback?.({
          entryId: request.entryId,
          loaded,
          total: contentLength,
          percent: contentLength > 0 ? Math.round((loaded / contentLength) * 100) : 0,
          speed,
        });
      }

      if (loaded === 0) {
        throw new NetworkError("Download returned empty response (0 bytes)");
      }

      // Save file and import into host app
      const { path: tempPath, entry: fileEntry } = await this.saveTempFile(
        request.fileName,
        chunks,
      );
      log.info("File saved, importing into project", {
        tempPath,
        size: loaded,
        hasEntry: !!fileEntry,
      });
      const importResult = await this.hostService.importFile(tempPath, fileEntry);

      if (!importResult.success) {
        const errDetail = importResult.error || "Unknown error";
        log.error("Host import rejected file", { tempPath, error: errDetail, size: loaded });
        throw new Error(`Import into project failed: ${errDetail}`);
      }

      const mapping: AssetMapping = {
        entryId: request.entryId,
        flavorId: request.flavorId,
        localPath: tempPath,
        importDate: Date.now(),
        isProxy: false,
      };

      this.hostService.storeMapping(request.entryId, tempPath);
      log.info("Download and import complete", { entryId: request.entryId, size: loaded });

      return mapping;
    } finally {
      this.activeDownloads.delete(request.entryId);
      this.onProgressCallbacks.delete(request.entryId);
      this.processQueue();
    }
  }

  private processQueue(): void {
    while (this.downloadQueue.length > 0 && this.activeDownloads.size < MAX_CONCURRENT_DOWNLOADS) {
      const next = this.downloadQueue.shift();
      if (next) {
        this.executeDownload(next).catch((err) => {
          log.error("Queued download failed", err);
        });
      }
    }
  }

  private async saveTempFile(
    fileName: string,
    chunks: Uint8Array[],
  ): Promise<{ path: string; entry: unknown }> {
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const uxp = require("uxp");
      const fs = uxp.storage.localFileSystem;
      const tempFolder = await fs.getTemporaryFolder();
      const file = await tempFolder.createFile(fileName, { overwrite: true });
      // CRITICAL: must specify binary format — UXP defaults to utf8 text mode
      // which corrupts video data and causes Premiere import to fail
      await file.write(merged.buffer, { format: uxp.storage.formats.binary });
      log.info("Saved temp file", { path: file.nativePath, size: totalLength });
      // Return the UXP File Entry — Premiere's importFiles() requires Entry objects,
      // not string paths (passing strings causes "Illegal Parameter type" error)
      return { path: file.nativePath, entry: file };
    } catch (err) {
      log.error("UXP file save failed", err);
      throw new Error(
        `Failed to save downloaded file: ${err instanceof Error ? err.message : "UXP storage not available"}`,
      );
    }
  }
}
