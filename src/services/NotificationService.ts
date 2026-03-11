import { KalturaClient } from "./KalturaClient";
import { WEBSOCKET_RECONNECT_BASE_MS, WEBSOCKET_RECONNECT_MAX_MS } from "../utils/constants";
import { createLogger } from "../utils/logger";

const log = createLogger("NotificationService");

export type NotificationEventType =
  | "entryReady"
  | "captionReady"
  | "entryUpdated"
  | "annotationAdded";

export interface NotificationEvent {
  type: NotificationEventType;
  entryId: string;
  objectId?: string;
  data?: Record<string, unknown>;
}

type EventHandler = (event: NotificationEvent) => void;

/**
 * Real-time notifications via WebSocket with HTTP polling fallback.
 * Connects to Kaltura's notification service for instant updates.
 */
export class NotificationService {
  private ws: WebSocket | null = null;
  private handlers = new Map<NotificationEventType, Set<EventHandler>>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private usePolling = false;
  private subscribedEntries = new Set<string>();

  constructor(private client: KalturaClient) {}

  /** Current connection state */
  get isConnected(): boolean {
    return this.connected;
  }

  /** Whether using polling fallback */
  get isPolling(): boolean {
    return this.usePolling;
  }

  /** Subscribe to a notification event type */
  on(type: NotificationEventType, handler: EventHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  /** Unsubscribe from a notification event type */
  off(type: NotificationEventType, handler: EventHandler): void {
    this.handlers.get(type)?.delete(handler);
  }

  /** Watch a specific entry for updates */
  watchEntry(entryId: string): void {
    this.subscribedEntries.add(entryId);
  }

  /** Stop watching an entry */
  unwatchEntry(entryId: string): void {
    this.subscribedEntries.delete(entryId);
  }

  /** Connect to the notification service */
  connect(): void {
    const ks = this.client.getKs();
    if (!ks) {
      log.warn("Cannot connect: no KS");
      return;
    }

    try {
      const wsUrl = this.buildWebSocketUrl(ks);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        log.info("WebSocket connected");
        this.connected = true;
        this.usePolling = false;
        this.reconnectAttempts = 0;
        this.stopPolling();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          this.handleMessage(data);
        } catch {
          log.warn("Failed to parse WebSocket message");
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        // Only reconnect if we were previously connected (not on initial failure)
        if (!this.usePolling) {
          log.info("WebSocket disconnected, reconnecting");
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        this.connected = false;
        // Switch to polling permanently — don't keep retrying WebSocket
        if (!this.usePolling) {
          log.debug("WebSocket unavailable, using polling fallback");
          this.usePolling = true;
          this.cancelReconnect();
        }
        try {
          this.ws?.close();
        } catch {
          /* ignore */
        }
        this.startPolling();
      };
    } catch {
      log.warn("WebSocket not available, using polling");
      this.startPolling();
    }
  }

  /** Disconnect from the notification service */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.stopPolling();
    this.cancelReconnect();
    this.subscribedEntries.clear();
  }

  private buildWebSocketUrl(ks: string): string {
    const serviceUrl = this.client.getServiceUrl();
    const wsBase = serviceUrl.replace(/^https?/, "wss");
    return `${wsBase}/api_v3/service/push/action/getUrl?ks=${encodeURIComponent(ks)}`;
  }

  private handleMessage(data: Record<string, unknown>): void {
    const eventType = this.mapEventType(data);
    if (!eventType) return;

    const entryId = (data.entryId || data.objectId || "") as string;

    if (this.subscribedEntries.size > 0 && !this.subscribedEntries.has(entryId)) {
      return;
    }

    const event: NotificationEvent = {
      type: eventType,
      entryId,
      objectId: data.objectId as string,
      data,
    };

    this.emit(event);
  }

  private mapEventType(data: Record<string, unknown>): NotificationEventType | null {
    const objectType = data.objectType as string;
    const eventType = data.eventType as string;

    if (objectType === "KalturaMediaEntry" && eventType === "statusChanged") return "entryReady";
    if (objectType === "KalturaCaptionAsset") return "captionReady";
    if (objectType === "KalturaAnnotation") return "annotationAdded";
    if (objectType === "KalturaMediaEntry" && eventType === "updated") return "entryUpdated";
    return null;
  }

  private emit(event: NotificationEvent): void {
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          log.error("Event handler error", err);
        }
      }
    }
  }

  private scheduleReconnect(): void {
    this.cancelReconnect();
    const delay = Math.min(
      WEBSOCKET_RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
      WEBSOCKET_RECONNECT_MAX_MS,
    );
    this.reconnectAttempts++;

    log.debug(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.usePolling = true;
    log.info("Starting HTTP polling fallback");

    this.pollTimer = setInterval(() => this.poll(), 10_000);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.usePolling = false;
  }

  private async poll(): Promise<void> {
    // Poll each watched entry for status changes
    for (const entryId of this.subscribedEntries) {
      try {
        const entry = await this.client.request<Record<string, unknown>>({
          service: "media",
          action: "get",
          params: { entryId },
        });

        if (entry.status === 2) {
          this.emit({ type: "entryReady", entryId });
        }
      } catch {
        // Polling errors are non-fatal
      }
    }
  }
}
