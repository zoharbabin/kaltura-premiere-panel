import React from "react";
import { ConnectionState } from "../types";
import { PLUGIN_VERSION } from "../utils/constants";

interface StatusBarProps {
  connectionState: ConnectionState;
  statusMessage?: string;
}

const stateColors: Record<ConnectionState, string> = {
  [ConnectionState.CONNECTED]: "var(--spectrum-global-color-green-500)",
  [ConnectionState.CONNECTING]: "var(--spectrum-global-color-yellow-500)",
  [ConnectionState.DISCONNECTED]: "var(--spectrum-global-color-gray-500)",
  [ConnectionState.ERROR]: "var(--spectrum-global-color-red-500)",
};

const stateLabels: Record<ConnectionState, string> = {
  [ConnectionState.CONNECTED]: "Connected",
  [ConnectionState.CONNECTING]: "Connecting\u2026",
  [ConnectionState.DISCONNECTED]: "Disconnected",
  [ConnectionState.ERROR]: "Connection Error",
};

export const StatusBar: React.FC<StatusBarProps> = ({ connectionState, statusMessage }) => (
  <div className="status-bar">
    <div className="flex-row gap-6">
      <div className="status-dot" style={{ backgroundColor: stateColors[connectionState] }} />
      <span>{statusMessage || stateLabels[connectionState]}</span>
    </div>
    <span>v{PLUGIN_VERSION}</span>
  </div>
);
