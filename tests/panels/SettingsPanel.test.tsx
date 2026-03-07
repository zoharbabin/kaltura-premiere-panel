import React from "react";
import { render, screen } from "@testing-library/react";
import { SettingsPanel } from "../../src/panels/SettingsPanel";
import { PLUGIN_VERSION } from "../../src/utils/constants";

const mockPremiereService = {
  getVersion: jest.fn().mockReturnValue("25.2.0"),
  getAllMappings: jest.fn().mockReturnValue(new Map()),
  clearMappings: jest.fn(),
} as never;

const defaultProps = {
  currentServerUrl: "https://www.kaltura.com",
  currentPartnerId: 12345,
  userName: "Test User",
  userEmail: "test@example.com",
  premiereService: mockPremiereService,
  onLogout: jest.fn(),
};

describe("SettingsPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders account section with user name and email", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText("Account")).toBeTruthy();
    expect(screen.getByText("Test User")).toBeTruthy();
    expect(screen.getByText("test@example.com")).toBeTruthy();
  });

  it("shows server URL", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText("https://www.kaltura.com")).toBeTruthy();
  });

  it("shows partner ID", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText("12345")).toBeTruthy();
  });

  it("shows Premiere Pro version", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText(/25\.2\.0/)).toBeTruthy();
  });

  it("shows plugin version", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText(`Plugin Version: ${PLUGIN_VERSION}`)).toBeTruthy();
  });

  it("shows sign out button", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText("Sign Out")).toBeTruthy();
  });

  it("shows clear cache and clear mappings buttons", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText("Clear Cache")).toBeTruthy();
    expect(screen.getByText("Clear Mappings")).toBeTruthy();
  });

  it("shows about section with license info", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText("About")).toBeTruthy();
    expect(screen.getByText("License: AGPL-3.0")).toBeTruthy();
  });
});
