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

  /** Create a new upload token with file metadata */
  async createToken(fileName?: string, fileSize?: number): Promise<KalturaUploadToken> {
    log.info("Creating upload token", { fileName, fileSize });
    const uploadToken: Record<string, unknown> = { objectType: "KalturaUploadToken" };
    if (fileName) uploadToken.fileName = fileName;
    if (fileSize !== undefined) uploadToken.fileSize = fileSize;
    return this.client.request<KalturaUploadToken>({
      service: "uploadToken",
      action: "add",
      params: { uploadToken },
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
      const tokenStatus = await this.getTokenStatus(tokenId);
      log.info("Upload token status after upload", {
        tokenId,
        status: tokenStatus.status,
        uploadedFileSize: tokenStatus.uploadedFileSize,
        expectedSize: totalSize,
        fileName: tokenStatus.fileName,
      });

      if (tokenStatus.status !== KalturaUploadTokenStatus.FULL_UPLOAD) {
        throw new UploadError(
          `Upload verification failed: status=${tokenStatus.status} (expected ${KalturaUploadTokenStatus.FULL_UPLOAD}), ` +
            `uploaded=${tokenStatus.uploadedFileSize ?? "unknown"}/${totalSize} bytes`,
          uploaded,
        );
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

  /**
   * Upload a single chunk to Kaltura.
   *
   * UXP's FormData + Blob is unreliable for binary uploads — Kaltura returns
   * UPLOAD_ERROR because the file data arrives empty. We build the multipart
   * request body manually to ensure the binary data is transmitted correctly.
   */
  private uploadChunk(
    tokenId: string,
    chunk: ArrayBuffer,
    resume: boolean,
    resumeAt: number,
    finalChunk: boolean,
  ): Promise<void> {
    // Send uploadTokenId and ks as URL query params (per Kaltura API convention)
    const ks = this.client.getKs();
    const queryParams = new URLSearchParams({
      uploadTokenId: tokenId,
      format: "1",
    });
    if (ks) queryParams.set("ks", ks);
    const url = `${this.client.getServiceUrl()}/api_v3/service/uploadToken/action/upload?${queryParams.toString()}`;
    const chunkBytes = new Uint8Array(chunk);

    log.info("Uploading chunk", {
      tokenId,
      chunkByteLength: chunk.byteLength,
      firstBytes: Array.from(chunkBytes.slice(0, 8))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" "),
      resume,
      resumeAt,
      finalChunk,
    });

    // Build multipart body manually — UXP's FormData+Blob doesn't transmit
    // binary data reliably to Kaltura.
    const boundary = `----KalturaUpload${Date.now()}${Math.random().toString(36).slice(2)}`;

    // Multipart fields: resume/finalChunk use "1"/"0" (not "true"/"false")
    const fields: Record<string, string> = {
      resume: resume ? "1" : "0",
      resumeAt: String(resumeAt),
      finalChunk: finalChunk ? "1" : "0",
    };

    // UXP lacks TextEncoder — convert ASCII strings to Uint8Array manually
    const strToBytes = (s: string): Uint8Array => {
      const arr = new Uint8Array(s.length);
      for (let j = 0; j < s.length; j++) arr[j] = s.charCodeAt(j);
      return arr;
    };

    // Build the multipart body parts
    const parts: Uint8Array[] = [];

    // Add text fields
    for (const [key, value] of Object.entries(fields)) {
      const fieldHeader = `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`;
      parts.push(strToBytes(fieldHeader));
    }

    // Add file field
    const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="fileData"; filename="chunk.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`;
    parts.push(strToBytes(fileHeader));
    parts.push(chunkBytes);
    parts.push(strToBytes("\r\n"));

    // Closing boundary
    parts.push(strToBytes(`--${boundary}--\r\n`));

    // Concatenate all parts into a single Uint8Array
    const totalLength = parts.reduce((sum, p) => sum + p.byteLength, 0);
    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      body.set(part, offset);
      offset += part.byteLength;
    }

    log.info("Multipart body built", {
      boundary,
      totalBodySize: body.byteLength,
      chunkDataSize: chunkBytes.byteLength,
      fieldCount: Object.keys(fields).length,
    });

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.timeout = UPLOAD_TIMEOUT_MS;
      xhr.setRequestHeader("Content-Type", `multipart/form-data; boundary=${boundary}`);

      xhr.onload = () => {
        let responseBody: Record<string, unknown> | null = null;
        try {
          responseBody = JSON.parse(xhr.responseText) as Record<string, unknown>;
        } catch {
          log.warn("Non-JSON response from upload", {
            status: xhr.status,
            responseText: xhr.responseText?.slice(0, 500),
          });
        }

        log.info("Upload chunk response", {
          httpStatus: xhr.status,
          responseObjectType: responseBody?.objectType,
          responseCode: responseBody?.code,
          responseMessage: responseBody?.message,
          uploadedFileSize: responseBody?.uploadedFileSize,
          responseStatus: responseBody?.status,
        });

        if (xhr.status < 200 || xhr.status >= 300) {
          const detail = responseBody?.message
            ? String(responseBody.message)
            : `HTTP ${xhr.status}`;
          reject(new UploadError(`Chunk upload failed: ${detail}`, resumeAt));
          return;
        }

        // Check for Kaltura API error in the response body
        if (
          responseBody &&
          (responseBody.objectType === "KalturaAPIException" || responseBody.code)
        ) {
          const errMsg = String(responseBody.message || responseBody.code || "Unknown API error");
          log.error("Kaltura API error in chunk upload", {
            code: responseBody.code,
            message: responseBody.message,
            objectType: responseBody.objectType,
            args: responseBody.args,
            fullResponse: JSON.stringify(responseBody),
          });
          reject(new UploadError(`Chunk upload API error: ${errMsg}`, resumeAt));
          return;
        }

        log.info("Chunk uploaded OK", {
          range: `${resumeAt}→${resumeAt + chunk.byteLength}`,
          finalChunk,
          uploadedFileSize: responseBody?.uploadedFileSize,
        });
        resolve();
      };

      xhr.onerror = () => {
        log.error("XHR error during chunk upload", {
          readyState: xhr.readyState,
          status: xhr.status,
        });
        reject(new UploadError("Chunk upload network error", resumeAt));
      };
      xhr.ontimeout = () => {
        reject(new UploadError("Chunk upload timed out", resumeAt));
      };

      xhr.send(body.buffer);
    });
  }
}
