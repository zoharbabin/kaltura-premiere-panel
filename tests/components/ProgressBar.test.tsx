import React from "react";
import { render, screen } from "@testing-library/react";
import { ProgressBar } from "../../src/components/ProgressBar";

describe("ProgressBar", () => {
  it("renders progress bar element", () => {
    const { container } = render(<ProgressBar value={50} />);
    expect(container.querySelector("sp-progress-bar")).toBeTruthy();
  });

  it("shows percent by default", () => {
    render(<ProgressBar value={75} />);
    expect(screen.getByText("75%")).toBeTruthy();
  });

  it("rounds percent value", () => {
    render(<ProgressBar value={33.7} />);
    expect(screen.getByText("34%")).toBeTruthy();
  });

  it("hides percent when showPercent is false", () => {
    render(<ProgressBar value={50} showPercent={false} />);
    expect(screen.queryByText("50%")).toBeNull();
  });

  it("renders label when provided", () => {
    render(<ProgressBar value={50} label="Uploading..." />);
    expect(screen.getByText("Uploading...")).toBeTruthy();
  });

  it("shows both label and percent", () => {
    render(<ProgressBar value={80} label="Processing" />);
    expect(screen.getByText("Processing")).toBeTruthy();
    expect(screen.getByText("80%")).toBeTruthy();
  });

  it("handles 0% value", () => {
    render(<ProgressBar value={0} />);
    expect(screen.getByText("0%")).toBeTruthy();
  });

  it("handles 100% value", () => {
    render(<ProgressBar value={100} />);
    expect(screen.getByText("100%")).toBeTruthy();
  });
});
