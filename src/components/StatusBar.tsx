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
  [ConnectionState.CONNECTING]: "Connecting…",
  [ConnectionState.DISCONNECTED]: "Disconnected",
  [ConnectionState.ERROR]: "Connection Error",
};

export const StatusBar: React.FC<StatusBarProps> = ({ connectionState, statusMessage }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "4px 12px",
      borderTop: "1px solid var(--spectrum-global-color-gray-300)",
      fontSize: "11px",
      color: "var(--spectrum-global-color-gray-600)",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: stateColors[connectionState],
        }}
      />
      <span>{statusMessage || stateLabels[connectionState]}</span>
    </div>
    <span>v{PLUGIN_VERSION}</span>
  </div>
);
