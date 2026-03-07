import React from "react";
import { render, screen } from "@testing-library/react";
import { StatusBar } from "../../src/components/StatusBar";
import { ConnectionState } from "../../src/types";

describe("StatusBar", () => {
  it("shows Connected state", () => {
    render(<StatusBar connectionState={ConnectionState.CONNECTED} />);
    expect(screen.getByText("Connected")).toBeTruthy();
  });

  it("shows Connecting state", () => {
    render(<StatusBar connectionState={ConnectionState.CONNECTING} />);
    expect(screen.getByText(/Connecting/)).toBeTruthy();
  });

  it("shows Disconnected state", () => {
    render(<StatusBar connectionState={ConnectionState.DISCONNECTED} />);
    expect(screen.getByText("Disconnected")).toBeTruthy();
  });

  it("shows Error state", () => {
    render(<StatusBar connectionState={ConnectionState.ERROR} />);
    expect(screen.getByText("Connection Error")).toBeTruthy();
  });

  it("shows custom status message instead of default label", () => {
    render(
      <StatusBar connectionState={ConnectionState.CONNECTED} statusMessage="Syncing 3 items..." />,
    );
    expect(screen.getByText("Syncing 3 items...")).toBeTruthy();
    expect(screen.queryByText("Connected")).toBeNull();
  });

  it("renders version number", () => {
    render(<StatusBar connectionState={ConnectionState.CONNECTED} />);
    // Version from constants starts with "v"
    const versionText = screen.getByText(/^v\d/);
    expect(versionText).toBeTruthy();
  });

  it("renders status indicator dot", () => {
    const { container } = render(<StatusBar connectionState={ConnectionState.CONNECTED} />);
    // The dot is an 8x8 rounded div
    const dot = container.querySelector('div[style*="border-radius: 50%"]') as HTMLElement;
    expect(dot).toBeTruthy();
  });
});
