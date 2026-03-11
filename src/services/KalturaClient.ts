import {
  KalturaClientConfig,
  KalturaApiException,
  KalturaRequestConfig,
  KalturaObjectBase,
} from "../types/kaltura";
import { KalturaApiError, NetworkError } from "../utils/errors";
import { API_BASE_PATH, API_TIMEOUT_MS, CLIENT_TAG, DEFAULT_SERVICE_URL } from "../utils/constants";
import { createLogger } from "../utils/logger";

const log = createLogger("KalturaClient");

/**
 * Low-level Kaltura API client.
 * Handles HTTP requests, KS injection, multi-request batching, and error normalization.
 */
export class KalturaClient {
  private serviceUrl: string;
  private partnerId: number;
  private ks: string | null = null;
  private clientTag: string;

  constructor(config: KalturaClientConfig) {
    this.serviceUrl = config.serviceUrl || DEFAULT_SERVICE_URL;
    this.partnerId = config.partnerId;
    this.clientTag = config.clientTag || CLIENT_TAG;
  }

  /** Set the active Kaltura Session */
  setKs(ks: string | null): void {
    this.ks = ks;
  }

  /** Get the current KS */
  getKs(): string | null {
    return this.ks;
  }

  /** Get the configured partner ID */
  getPartnerId(): number {
    return this.partnerId;
  }

  /** Get the configured service URL */
  getServiceUrl(): string {
    return this.serviceUrl;
  }

  /** Update configuration */
  configure(config: Partial<KalturaClientConfig>): void {
    if (config.serviceUrl) {
      const normalized = config.serviceUrl.replace(/\/+$/, "");
      if (!/^https:\/\/.+/i.test(normalized)) {
        throw new Error("Service URL must use HTTPS");
      }
      this.serviceUrl = normalized;
    }
    if (config.partnerId) this.partnerId = config.partnerId;
    if (config.clientTag) this.clientTag = config.clientTag;
  }

  /**
   * Execute a single API request.
   */
  async request<T extends KalturaObjectBase | string>(config: KalturaRequestConfig): Promise<T> {
    const url = `${this.serviceUrl}${API_BASE_PATH}/${config.service}/action/${config.action}`;
    const body = this.buildRequestBody(config.params);

    log.debug(`${config.service}.${config.action}`, body);

    const response = await this.doFetch(url, body);
    return this.handleResponse<T>(response);
  }

  /**
   * Execute multiple API requests in a single HTTP call.
   * Supports inter-request dependency mapping via {N:result:field} syntax.
   */
  async multiRequest<T extends KalturaObjectBase[]>(requests: KalturaRequestConfig[]): Promise<T> {
    const url = `${this.serviceUrl}${API_BASE_PATH}/multirequest`;
    const body: Record<string, unknown> = {
      ...this.buildBaseParams(),
    };

    requests.forEach((req, index) => {
      const i = index + 1;
      body[`${i}:service`] = req.service;
      body[`${i}:action`] = req.action;
      if (req.params) {
        for (const [key, value] of Object.entries(req.params)) {
          body[`${i}:${key}`] = value;
        }
      }
    });

    log.debug(
      `multirequest (${requests.length} actions)`,
      requests.map((r) => `${r.service}.${r.action}`),
    );

    const response = await this.doFetch(url, body);
    const results = (await response.json()) as unknown[];

    if (!Array.isArray(results)) {
      throw new KalturaApiError("Invalid multi-request response", "INVALID_RESPONSE");
    }

    // Check each result for errors
    for (let i = 0; i < results.length; i++) {
      const result = results[i] as KalturaObjectBase;
      if (result?.objectType === "KalturaAPIException") {
        const err = result as KalturaApiException;
        throw new KalturaApiError(
          `Request ${i + 1} (${requests[i].service}.${requests[i].action}) failed: ${err.message}`,
          err.code,
          err.args,
        );
      }
    }

    return results as T;
  }

  private buildBaseParams(): Record<string, unknown> {
    const params: Record<string, unknown> = {
      format: 1, // JSON
      clientTag: this.clientTag,
    };
    if (this.ks) {
      params.ks = this.ks;
    }
    return params;
  }

  private buildRequestBody(params?: Record<string, unknown>): Record<string, unknown> {
    return {
      ...this.buildBaseParams(),
      ...params,
    };
  }

  private async doFetch(url: string, body: Record<string, unknown>): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new NetworkError(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      if (error instanceof NetworkError || error instanceof KalturaApiError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new NetworkError("Request timed out");
      }
      throw new NetworkError(error instanceof Error ? error.message : "Unknown network error");
    } finally {
      clearTimeout(timeout);
    }
  }

  private async handleResponse<T extends KalturaObjectBase | string>(
    response: Response,
  ): Promise<T> {
    const data = (await response.json()) as KalturaObjectBase | string;

    if (typeof data === "object" && data?.objectType === "KalturaAPIException") {
      const err = data as KalturaApiException;
      throw new KalturaApiError(err.message, err.code, err.args);
    }

    return data as T;
  }
}
