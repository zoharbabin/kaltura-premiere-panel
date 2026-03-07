import { NotificationService } from "../../src/services/NotificationService";
import { KalturaClient } from "../../src/services/KalturaClient";

// Mock WebSocket
class MockWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1;

  close = jest.fn(() => {
    this.onclose?.();
  });

  // Simulate receiving a message
  simulateMessage(data: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  // Simulate connection open
  simulateOpen(): void {
    this.onopen?.();
  }

  // Simulate error
  simulateError(): void {
    this.onerror?.();
  }
}

let mockWsInstance: MockWebSocket;

(global as Record<string, unknown>).WebSocket = jest.fn(() => {
  mockWsInstance = new MockWebSocket();
  return mockWsInstance;
});

const client = {
  request: jest.fn(),
  getKs: jest.fn().mockReturnValue("test-ks-token"),
  getServiceUrl: jest.fn().mockReturnValue("https://www.kaltura.com"),
} as unknown as KalturaClient;

describe("NotificationService", () => {
  let service: NotificationService;

  beforeEach(() => {
    service = new NotificationService(client);
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    service.disconnect();
    jest.useRealTimers();
  });

  describe("on() / off()", () => {
    it("registers and calls event handlers", () => {
      const handler = jest.fn();
      service.on("captionReady", handler);

      // Manually emit via connect + message
      service.connect();
      mockWsInstance.simulateOpen();
      mockWsInstance.simulateMessage({
        objectType: "KalturaCaptionAsset",
        entryId: "0_abc",
        objectId: "cap1",
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "captionReady",
          entryId: "0_abc",
          objectId: "cap1",
        }),
      );
    });

    it("unregisters handlers with off()", () => {
      const handler = jest.fn();
      service.on("captionReady", handler);
      service.off("captionReady", handler);

      service.connect();
      mockWsInstance.simulateOpen();
      mockWsInstance.simulateMessage({
        objectType: "KalturaCaptionAsset",
        entryId: "0_abc",
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("connect()", () => {
    it("connects via WebSocket", () => {
      service.connect();
      expect(global.WebSocket).toHaveBeenCalled();
      mockWsInstance.simulateOpen();
      expect(service.isConnected).toBe(true);
      expect(service.isPolling).toBe(false);
    });

    it("does not connect without KS", () => {
      (client.getKs as jest.Mock).mockReturnValueOnce(null);
      service.connect();
      expect(global.WebSocket).not.toHaveBeenCalled();
    });
  });

  describe("disconnect()", () => {
    it("closes WebSocket and clears state", () => {
      service.connect();
      mockWsInstance.simulateOpen();
      expect(service.isConnected).toBe(true);

      service.disconnect();
      expect(mockWsInstance.close).toHaveBeenCalled();
      expect(service.isConnected).toBe(false);
    });
  });

  describe("event type mapping", () => {
    beforeEach(() => {
      service.connect();
      mockWsInstance.simulateOpen();
    });

    it("maps KalturaMediaEntry statusChanged to entryReady", () => {
      const handler = jest.fn();
      service.on("entryReady", handler);

      mockWsInstance.simulateMessage({
        objectType: "KalturaMediaEntry",
        eventType: "statusChanged",
        entryId: "0_abc",
      });

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: "entryReady" }));
    });

    it("maps KalturaEntryVendorTask to reachTaskComplete", () => {
      const handler = jest.fn();
      service.on("reachTaskComplete", handler);

      mockWsInstance.simulateMessage({
        objectType: "KalturaEntryVendorTask",
        entryId: "0_abc",
      });

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: "reachTaskComplete" }));
    });

    it("maps KalturaAnnotation to annotationAdded", () => {
      const handler = jest.fn();
      service.on("annotationAdded", handler);

      mockWsInstance.simulateMessage({
        objectType: "KalturaAnnotation",
        entryId: "0_abc",
      });

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: "annotationAdded" }));
    });

    it("maps KalturaMediaEntry updated to entryUpdated", () => {
      const handler = jest.fn();
      service.on("entryUpdated", handler);

      mockWsInstance.simulateMessage({
        objectType: "KalturaMediaEntry",
        eventType: "updated",
        entryId: "0_abc",
      });

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: "entryUpdated" }));
    });

    it("ignores unknown event types", () => {
      const handler = jest.fn();
      service.on("entryReady", handler);

      mockWsInstance.simulateMessage({
        objectType: "KalturaUnknownType",
        entryId: "0_abc",
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("watchEntry()", () => {
    it("filters events to watched entries only", () => {
      const handler = jest.fn();
      service.on("captionReady", handler);
      service.watchEntry("0_watched");

      service.connect();
      mockWsInstance.simulateOpen();

      // Event for watched entry — should fire
      mockWsInstance.simulateMessage({
        objectType: "KalturaCaptionAsset",
        entryId: "0_watched",
      });
      expect(handler).toHaveBeenCalledTimes(1);

      // Event for unwatched entry — should be filtered
      mockWsInstance.simulateMessage({
        objectType: "KalturaCaptionAsset",
        entryId: "0_other",
      });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("unwatchEntry removes the filter", () => {
      const handler = jest.fn();
      service.on("captionReady", handler);
      service.watchEntry("0_abc");
      service.unwatchEntry("0_abc");

      service.connect();
      mockWsInstance.simulateOpen();

      // No watched entries, so all events pass through
      mockWsInstance.simulateMessage({
        objectType: "KalturaCaptionAsset",
        entryId: "0_any",
      });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("WebSocket error fallback", () => {
    it("falls back to polling on WebSocket error", () => {
      service.connect();
      mockWsInstance.simulateError();

      expect(service.isPolling).toBe(true);
      expect(service.isConnected).toBe(false);
    });
  });

  describe("reconnection", () => {
    it("schedules reconnect on WebSocket close", () => {
      service.connect();
      mockWsInstance.simulateOpen();
      mockWsInstance.simulateMessage({ objectType: "ping" }); // ignored event

      // Simulate close (not via disconnect, but network drop)
      const closeFn = mockWsInstance.onclose;
      service["ws"] = mockWsInstance as unknown as WebSocket;
      closeFn?.();

      // Should schedule reconnect
      jest.advanceTimersByTime(1000);
      // New WebSocket should be created (second call)
      expect(global.WebSocket).toHaveBeenCalledTimes(2);
    });
  });

  describe("handler error isolation", () => {
    it("continues dispatching after a handler throws", () => {
      const badHandler = jest.fn(() => {
        throw new Error("handler crash");
      });
      const goodHandler = jest.fn();

      service.on("captionReady", badHandler);
      service.on("captionReady", goodHandler);

      service.connect();
      mockWsInstance.simulateOpen();
      mockWsInstance.simulateMessage({
        objectType: "KalturaCaptionAsset",
        entryId: "0_abc",
      });

      expect(badHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
    });
  });
});
