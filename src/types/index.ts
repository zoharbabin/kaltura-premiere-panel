export * from "./kaltura";
export * from "./premiere";

/** Plugin connection state */
export enum ConnectionState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  ERROR = "error",
}

/** Auth state */
export interface AuthState {
  isAuthenticated: boolean;
  user: import("./kaltura").KalturaUser | null;
  ks: string | null;
  partnerId: number | null;
  serverUrl: string;
  connectionState: ConnectionState;
}

/** Plugin settings */
export interface PluginSettings {
  serverUrl: string;
  partnerId: number | null;
  defaultExportPreset: string;
  defaultCaptionLanguage: string;
  downloadLocation: string;
  cacheEnabled: boolean;
  maxCacheSizeMB: number;
}

/** Tab identifiers */
export type TabId = "browse" | "publish" | "captions" | "review" | "analytics" | "settings";

/** Notification severity */
export enum NotificationSeverity {
  INFO = "info",
  SUCCESS = "success",
  WARNING = "warning",
  ERROR = "error",
}

/** Panel notification */
export interface PanelNotification {
  id: string;
  message: string;
  severity: NotificationSeverity;
  timestamp: number;
  dismissible: boolean;
  action?: {
    label: string;
    handler: () => void;
  };
}
