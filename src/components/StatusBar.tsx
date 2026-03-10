import React from "react";
import { ConnectionState } from "../types";
import { PLUGIN_VERSION } from "../utils/constants";

interface StatusBarProps {
  connectionState: ConnectionState;
  statusMessage?: string;
}

const stateColors: Record<ConnectionState, string> = {
  [ConnectionState.CONNECTED]: "#2d9d78",
  [ConnectionState.CONNECTING]: "#c9a21e",
  [ConnectionState.DISCONNECTED]: "#6e6e6e",
  [ConnectionState.ERROR]: "#e34850",
};

const stateLabels: Record<ConnectionState, string> = {
  [ConnectionState.CONNECTED]: "Connected",
  [ConnectionState.CONNECTING]: "Connecting\u2026",
  [ConnectionState.DISCONNECTED]: "Disconnected",
  [ConnectionState.ERROR]: "Connection Error",
};

export const StatusBar: React.FC<StatusBarProps> = ({ connectionState, statusMessage }) => (
  <div className="status-bar">
    <div className="flex-row">
      <div className="status-dot" style={{ backgroundColor: stateColors[connectionState] }} />
      <span>{statusMessage || stateLabels[connectionState]}</span>
    </div>
    <span>v{PLUGIN_VERSION}</span>
  </div>
);
