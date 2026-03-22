import React from "react";
import { ConnectionState } from "../types";
import { PLUGIN_VERSION } from "../utils/constants";
import { useTranslation } from "../i18n";

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

const stateKeys: Record<ConnectionState, string> = {
  [ConnectionState.CONNECTED]: "status.connected",
  [ConnectionState.CONNECTING]: "status.connecting",
  [ConnectionState.DISCONNECTED]: "status.disconnected",
  [ConnectionState.ERROR]: "status.connectionError",
};

export const StatusBar: React.FC<StatusBarProps> = ({ connectionState, statusMessage }) => {
  const { t } = useTranslation();

  return (
    <div className="status-bar">
      <div className="flex-row">
        <div className="status-dot" style={{ backgroundColor: stateColors[connectionState] }} />
        <span>{statusMessage || t(stateKeys[connectionState])}</span>
      </div>
      <span>v{PLUGIN_VERSION}</span>
    </div>
  );
};
