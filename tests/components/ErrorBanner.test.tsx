import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBanner } from "../../src/components/ErrorBanner";

describe("ErrorBanner", () => {
  it("renders error message", () => {
    render(<ErrorBanner message="Something went wrong" />);
    expect(screen.getByText("Something went wrong")).toBeTruthy();
  });

  it("renders dismiss button when onDismiss provided", () => {
    render(<ErrorBanner message="Error" onDismiss={() => {}} />);
    expect(screen.getByText("\u2715")).toBeTruthy();
  });

  it("does not render dismiss button when onDismiss not provided", () => {
    const { container } = render(<ErrorBanner message="Error" />);
    expect(screen.queryByText("\u2715")).toBeNull();
    // Only the alert icon, no action buttons
    expect(container.querySelectorAll("sp-action-button").length).toBe(0);
  });

  it("calls onDismiss when dismiss button clicked", () => {
    const onDismiss = jest.fn();
    render(<ErrorBanner message="Error" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("\u2715"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders retry button when onRetry provided", () => {
    render(<ErrorBanner message="Error" onRetry={() => {}} />);
    expect(screen.getByText("Retry")).toBeTruthy();
  });

  it("does not render retry button when onRetry not provided", () => {
    render(<ErrorBanner message="Error" />);
    expect(screen.queryByText("Retry")).toBeNull();
  });

  it("calls onRetry when retry button clicked", () => {
    const onRetry = jest.fn();
    render(<ErrorBanner message="Error" onRetry={onRetry} />);
    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders both dismiss and retry buttons", () => {
    render(<ErrorBanner message="Error" onDismiss={() => {}} onRetry={() => {}} />);
    expect(screen.getByText("Retry")).toBeTruthy();
    expect(screen.getByText("\u2715")).toBeTruthy();
  });
});
