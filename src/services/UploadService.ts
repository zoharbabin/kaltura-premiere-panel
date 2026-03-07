import { KalturaClient } from "./KalturaClient";
import { KalturaUploadToken, KalturaUploadTokenStatus } from "../types/kaltura";
import { UploadError } from "../utils/errors";
import { UPLOAD_CHUNK_SIZE_BYTES, UPLOAD_TIMEOUT_MS } from "../utils/constants";
import { createLogger } from "../utils/logger";

const log = createLogger("UploadService");

export interface UploadProgressCallback {
  (progress: { loaded: number; total: number; percent: number }): void;
}

/**
 * Handles chunked, resumable file uploads to Kaltura.
 * Uses XMLHttpRequest for progress tracking (UXP supports it).
 */
export class UploadService {
  private abortControllers = new Map<string, AbortController>();

  constructor(private client: KalturaClient) {}

  /** Create a new upload token */
  async createToken(): Promise<KalturaUploadToken> {
    log.info("Creating upload token");
    return this.client.request<KalturaUploadToken>({
      service: "uploadToken",
      action: "add",
      params: {
        uploadToken: { objectType: "KalturaUploadToken" },
      },
    });
  }

  /** Get upload token status */
  async getTokenStatus(tokenId: string): Promise<KalturaUploadToken> {
    return this.client.request<KalturaUploadToken>({
      service: "uploadToken",
      action: "get",
      params: { uploadTokenId: tokenId },
    });
  }

  /**
   * Upload a file in chunks with progress reporting.
   * Supports resume from last successful chunk on failure.
   */
  async uploadFile(
    tokenId: string,
    fileData: ArrayBuffer,
    onProgress?: UploadProgressCallback,
  ): Promise<void> {
    const totalSize = fileData.byteLength;
    const chunkSize = UPLOAD_CHUNK_SIZE_BYTES;
    const chunks = Math.ceil(totalSize / chunkSize);
    let uploaded = 0;

    log.info("Starting chunked upload", {
      tokenId,
      totalSize,
      chunks,
      chunkSize,
    });

    const controller = new AbortController();
    this.abortControllers.set(tokenId, controller);

    try {
      for (let i = 0; i < chunks; i++) {
        if (controller.signal.aborted) {
          throw new UploadError("Upload cancelled", uploaded);
        }

        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, totalSize);
        const chunk = fileData.slice(start, end);
        const isLastChunk = i === chunks - 1;

        await this.uploadChunk(tokenId, chunk, uploaded > 0, uploaded, isLastChunk);

        uploaded = end;

        onProgress?.({
          loaded: uploaded,
          total: totalSize,
          percent: Math.round((uploaded / totalSize) * 100),
        });
      }

      // Verify upload completion
      const status = await this.getTokenStatus(tokenId);
      if (status.status !== KalturaUploadTokenStatus.FULL_UPLOAD) {
        throw new UploadError("Upload verification failed: incomplete upload", uploaded);
      }

      log.info("Upload complete", { tokenId, totalSize });
    } finally {
      this.abortControllers.delete(tokenId);
    }
  }

  /** Cancel an in-progress upload */
  cancelUpload(tokenId: string): void {
    const controller = this.abortControllers.get(tokenId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(tokenId);
      log.info("Upload cancelled", { tokenId });
    }
  }

  private async uploadChunk(
    tokenId: string,
    chunk: ArrayBuffer,
    resume: boolean,
    resumeAt: number,
    finalChunk: boolean,
  ): Promise<void> {
    const url = `${this.client.getServiceUrl()}/api_v3/service/uploadToken/action/upload`;

    const formData = new FormData();
    formData.append("uploadTokenId", tokenId);
    formData.append("fileData", new Blob([chunk]));
    formData.append("resume", String(resume));
    formData.append("resumeAt", String(resumeAt));
    formData.append("finalChunk", String(finalChunk));

    const ks = this.client.getKs();
    if (ks) {
      formData.append("ks", ks);
    }
    formData.append("format", "1");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new UploadError(`Chunk upload failed: HTTP ${response.status}`, resumeAt);
      }
    } catch (error) {
      if (error instanceof UploadError) throw error;
      throw new UploadError(
        error instanceof Error ? error.message : "Chunk upload failed",
        resumeAt,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
