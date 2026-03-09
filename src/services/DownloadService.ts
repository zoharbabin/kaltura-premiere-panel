import { KalturaClient } from "./KalturaClient";
import { KalturaFlavorAsset } from "../types/kaltura";
import { AssetMapping, ImportResult } from "../types/premiere";
import { MediaService } from "./MediaService";
import { NetworkError } from "../utils/errors";
import { MAX_CONCURRENT_DOWNLOADS } from "../utils/constants";
import { createLogger } from "../utils/logger";

/** Minimal host interface needed by DownloadService */
interface DownloadHostService {
  importFile(filePath: string): Promise<ImportResult>;
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
      log.info("Download response", {
        contentType,
        contentLength,
        hasBody: !!response.body,
      });

      // Try streaming for progress, fall back to arrayBuffer() for reliability
      let downloadedData: Uint8Array;
      const reader = response.body?.getReader();

      if (reader) {
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

        // Merge chunks into a single Uint8Array
        downloadedData = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
          downloadedData.set(chunk, offset);
          offset += chunk.length;
        }
      } else {
        // Fallback: read entire response as ArrayBuffer (no progress)
        log.warn("No stream reader, using arrayBuffer() fallback");
        const buf = await response.arrayBuffer();
        downloadedData = new Uint8Array(buf);
        if (downloadedData.length === 0) {
          throw new NetworkError("Download returned empty response (0 bytes)");
        }
      }

      // Verify the first bytes look like a valid media container (MP4/MOV: ftyp box)
      if (downloadedData.length >= 8) {
        const magic = String.fromCharCode(...downloadedData.slice(4, 8));
        log.info("File header magic", { magic, first16: Array.from(downloadedData.slice(0, 16)) });
      }

      // Save file and import into host app
      const tempPath = await this.saveTempFile(request.fileName, downloadedData);
      log.info("File saved, importing into project", { tempPath, size: downloadedData.length });
      const importResult = await this.hostService.importFile(tempPath);

      if (!importResult.success) {
        const errDetail = importResult.error || "Unknown error";
        log.error("Host import rejected file", {
          tempPath,
          error: errDetail,
          size: downloadedData.length,
        });
        throw new Error(
          `Import failed: ${errDetail}\n` +
            `Path: ${tempPath}\n` +
            `Downloaded: ${downloadedData.length} bytes\n` +
            `Content-Type: ${contentType}\n` +
            `URL: ${downloadUrl.substring(0, 120)}`,
        );
      }

      const mapping: AssetMapping = {
        entryId: request.entryId,
        flavorId: request.flavorId,
        localPath: tempPath,
        importDate: Date.now(),
        isProxy: false,
      };

      this.hostService.storeMapping(request.entryId, tempPath);
      log.info("Download and import complete", {
        entryId: request.entryId,
        size: downloadedData.length,
      });

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

  /**
   * Write a diagnostic text log file alongside the media file.
   * Text writes are known to work in UXP (Adobe samples use them).
   */
  private async writeDiagnosticLog(
    folder: {
      createFile: (
        n: string,
        o: { overwrite: boolean },
      ) => Promise<{ write: (d: string) => Promise<void>; nativePath?: string }>;
    },
    fileName: string,
    diagnostics: string,
  ): Promise<void> {
    try {
      const logFile = await folder.createFile(`${fileName}.diagnostic.txt`, { overwrite: true });
      await logFile.write(diagnostics);
      log.info("Diagnostic log written", { path: logFile.nativePath });
    } catch (e) {
      log.warn("Could not write diagnostic log", e);
    }
  }

  private async saveTempFile(fileName: string, data: Uint8Array): Promise<string> {
    const diag: string[] = [];
    diag.push(`[${new Date().toISOString()}] saveTempFile start`);
    diag.push(`fileName: ${fileName}`);
    diag.push(`data.byteLength: ${data.byteLength}`);
    diag.push(`data.constructor: ${data.constructor?.name}`);
    diag.push(`first16bytes: [${Array.from(data.slice(0, 16)).join(",")}]`);
    if (data.length >= 8) {
      diag.push(`magic(4-8): ${String.fromCharCode(...data.slice(4, 8))}`);
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const uxp = require("uxp");
      const lfs = uxp.storage.localFileSystem;
      let folder;
      try {
        folder = await lfs.getDataFolder();
        diag.push(`folder: getDataFolder() => nativePath=${folder.nativePath}`);
      } catch (e) {
        folder = await lfs.getTemporaryFolder();
        diag.push(`folder: getTemporaryFolder() (getDataFolder failed: ${e})`);
      }

      // Strategy A: Use require('fs') to write directly to disk (bypasses UXP storage API)
      const folderPath = folder.nativePath;
      if (folderPath && typeof folderPath === "string") {
        const sep = folderPath.includes("\\") ? "\\" : "/";
        const fullPath = `${folderPath}${sep}${fileName}`;
        diag.push(`fullPath: ${fullPath}`);

        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const nodeFs = require("fs");
          diag.push("require('fs') available: true");
          const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
          nodeFs.writeFileSync(fullPath, buf);
          diag.push(`fs.writeFileSync completed`);

          // Verify
          const stats = nodeFs.statSync(fullPath);
          diag.push(`fs.statSync size: ${stats.size}`);
          if (stats.size === data.byteLength) {
            diag.push("SUCCESS: fs.writeFileSync wrote correct size");
            await this.writeDiagnosticLog(folder, fileName, diag.join("\n"));
            log.info("Saved file via require('fs')", { fullPath, size: stats.size });
            return fullPath;
          }
          diag.push(`WARNING: size mismatch (expected ${data.byteLength}, got ${stats.size})`);
        } catch (fsErr) {
          const msg = fsErr instanceof Error ? fsErr.message : String(fsErr);
          diag.push(`require('fs') failed: ${msg}`);
        }
      }

      // Strategy B: UXP file.write() with multiple approaches
      const file = await folder.createFile(fileName, { overwrite: true });
      diag.push(`file.nativePath: ${file.nativePath} (type: ${typeof file.nativePath})`);

      const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      diag.push(`ArrayBuffer byteLength: ${buf.byteLength}`);
      diag.push(`formats.binary value: ${JSON.stringify(uxp.storage.formats.binary)}`);

      const strategies = [
        {
          name: "ArrayBuffer+format",
          fn: () => file.write(buf, { format: uxp.storage.formats.binary }),
        },
        {
          name: "Uint8Array+format",
          fn: () => file.write(data, { format: uxp.storage.formats.binary }),
        },
        { name: "ArrayBuffer-noformat", fn: () => file.write(buf) },
        {
          name: "Blob+format",
          fn: () =>
            file.write(new Blob([buf as ArrayBuffer], { type: "application/octet-stream" }), {
              format: uxp.storage.formats.binary,
            }),
        },
        { name: "Uint8Array-noformat", fn: () => file.write(data) },
      ];

      for (const strategy of strategies) {
        try {
          await strategy.fn();
          diag.push(`strategy ${strategy.name}: write() resolved`);

          // Check if file has data by reading back
          try {
            const readBack = await file.read({ format: uxp.storage.formats.binary });
            const size = readBack instanceof ArrayBuffer ? readBack.byteLength : 0;
            diag.push(
              `strategy ${strategy.name}: read-back size=${size} type=${typeof readBack} isAB=${readBack instanceof ArrayBuffer}`,
            );
            if (size > 0) {
              diag.push(`SUCCESS: strategy ${strategy.name} wrote ${size} bytes`);
              break;
            }
            diag.push(`strategy ${strategy.name}: 0-byte file, trying next`);
            // Re-create file for next attempt
            await folder.createFile(fileName, { overwrite: true });
          } catch (readErr) {
            const readMsg = readErr instanceof Error ? readErr.message : String(readErr);
            diag.push(`strategy ${strategy.name}: read-back failed: ${readMsg}`);
          }
        } catch (writeErr) {
          const writeMsg = writeErr instanceof Error ? writeErr.message : String(writeErr);
          diag.push(`strategy ${strategy.name}: write() threw: ${writeMsg}`);
        }
      }

      // Write diagnostic log as text (guaranteed to work)
      await this.writeDiagnosticLog(folder, fileName, diag.join("\n"));

      // Resolve path
      let resolvedPath: string | undefined = file.nativePath;
      if (!resolvedPath || typeof resolvedPath !== "string") {
        if (folderPath && typeof folderPath === "string") {
          const sep = folderPath.includes("\\") ? "\\" : "/";
          resolvedPath = `${folderPath}${sep}${fileName}`;
        }
      }

      if (!resolvedPath || typeof resolvedPath !== "string") {
        throw new Error(`No valid path. Diagnostics:\n${diag.join("\n")}`);
      }

      log.info("Saved file for import", { resolvedPath, size: data.byteLength });
      return resolvedPath;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      diag.push(`FATAL: ${errMsg}`);
      log.error("File save failed", { diagnostics: diag.join(" | ") });
      throw new Error(`Failed to save file. Diagnostics:\n${diag.join("\n")}`);
    }
  }
}
