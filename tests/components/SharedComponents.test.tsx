/// <reference types="@testing-library/jest-dom" />
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { LoadingSpinner } from "../../src/components/LoadingSpinner";
import { ErrorBanner } from "../../src/components/ErrorBanner";
import { EmptyState } from "../../src/components/EmptyState";
import { ProgressBar } from "../../src/components/ProgressBar";
import { StatusBar } from "../../src/components/StatusBar";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { ConnectionState } from "../../src/types";

// ---------- LoadingSpinner ----------

describe("LoadingSpinner", () => {
  it("renders without a label", () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector("sp-progress-circle")).toBeInTheDocument();
  });

  it("does not render label text when label is omitted", () => {
    render(<LoadingSpinner />);
    expect(screen.queryByText(/.+/)).toBeNull();
  });

  it("renders with a label", () => {
    render(<LoadingSpinner label="Loading assets…" />);
    expect(screen.getByText("Loading assets…")).toBeInTheDocument();
  });

  it("renders with size small", () => {
    const { container } = render(<LoadingSpinner size="small" />);
    const circle = container.querySelector("sp-progress-circle");
    expect(circle).toHaveAttribute("size", "small");
  });

  it("renders with size medium by default", () => {
    const { container } = render(<LoadingSpinner />);
    const circle = container.querySelector("sp-progress-circle");
    expect(circle).toHaveAttribute("size", "medium");
  });

  it("renders with size large", () => {
    const { container } = render(<LoadingSpinner size="large" />);
    const circle = container.querySelector("sp-progress-circle");
    expect(circle).toHaveAttribute("size", "large");
  });
});

// ---------- ErrorBanner ----------

describe("ErrorBanner", () => {
  it("renders the error message", () => {
    render(<ErrorBanner message="Something went wrong" />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders without dismiss or retry buttons when callbacks are omitted", () => {
    render(<ErrorBanner message="Error" />);
    expect(screen.queryByText("Retry")).toBeNull();
    expect(screen.queryByText("✕")).toBeNull();
  });

  it("renders the retry button when onRetry is provided", () => {
    render(<ErrorBanner message="Error" onRetry={jest.fn()} />);
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("calls onRetry when the retry button is clicked", () => {
    const onRetry = jest.fn();
    render(<ErrorBanner message="Error" onRetry={onRetry} />);
    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders the dismiss button when onDismiss is provided", () => {
    render(<ErrorBanner message="Error" onDismiss={jest.fn()} />);
    expect(screen.getByText("✕")).toBeInTheDocument();
  });

  it("calls onDismiss when the dismiss button is clicked", () => {
    const onDismiss = jest.fn();
    render(<ErrorBanner message="Error" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("✕"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

// ---------- EmptyState ----------

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="No results" />);
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("does not render a description when omitted", () => {
    render(<EmptyState title="No results" />);
    expect(screen.queryByText("Try adjusting")).toBeNull();
  });

  it("renders the description when provided", () => {
    render(<EmptyState title="No results" description="Try adjusting your filters" />);
    expect(screen.getByText("Try adjusting your filters")).toBeInTheDocument();
  });

  it("does not render an action button when actionLabel or onAction is omitted", () => {
    render(<EmptyState title="No results" actionLabel="Refresh" />);
    expect(screen.queryByText("Refresh")).toBeNull();
  });

  it("renders the action button when both actionLabel and onAction are provided", () => {
    render(<EmptyState title="No results" actionLabel="Refresh" onAction={jest.fn()} />);
    expect(screen.getByText("Refresh")).toBeInTheDocument();
  });

  it("calls onAction when the action button is clicked", () => {
    const onAction = jest.fn();
    render(<EmptyState title="No results" actionLabel="Refresh" onAction={onAction} />);
    fireEvent.click(screen.getByText("Refresh"));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

// ---------- ProgressBar ----------

describe("ProgressBar", () => {
  it("renders the progress bar element with the given value", () => {
    const { container } = render(<ProgressBar value={42} />);
    const bar = container.querySelector("sp-progress-bar");
    expect(bar).toHaveAttribute("value", "42");
  });

  it("shows the percentage by default", () => {
    render(<ProgressBar value={73} />);
    expect(screen.getByText("73%")).toBeInTheDocument();
  });

  it("renders the label when provided", () => {
    render(<ProgressBar value={50} label="Uploading" />);
    expect(screen.getByText("Uploading")).toBeInTheDocument();
  });

  it("hides the percentage when showPercent is false", () => {
    render(<ProgressBar value={50} showPercent={false} />);
    expect(screen.queryByText("50%")).toBeNull();
  });

  it("rounds the displayed percentage", () => {
    render(<ProgressBar value={33.7} />);
    expect(screen.getByText("34%")).toBeInTheDocument();
  });

  it("does not render the header row when label is omitted and showPercent is false", () => {
    const { container } = render(<ProgressBar value={25} showPercent={false} />);
    const details = container.querySelectorAll("sp-detail");
    expect(details).toHaveLength(0);
  });
});

// ---------- StatusBar ----------

describe("StatusBar", () => {
  it("renders the Connected label", () => {
    render(<StatusBar connectionState={ConnectionState.CONNECTED} />);
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("renders the Connecting label", () => {
    render(<StatusBar connectionState={ConnectionState.CONNECTING} />);
    expect(screen.getByText("Connecting…")).toBeInTheDocument();
  });

  it("renders the Disconnected label", () => {
    render(<StatusBar connectionState={ConnectionState.DISCONNECTED} />);
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  it("renders the Connection Error label", () => {
    render(<StatusBar connectionState={ConnectionState.ERROR} />);
    expect(screen.getByText("Connection Error")).toBeInTheDocument();
  });

  it("shows a custom status message instead of the default label", () => {
    render(<StatusBar connectionState={ConnectionState.CONNECTED} statusMessage="Syncing…" />);
    expect(screen.getByText("Syncing…")).toBeInTheDocument();
    expect(screen.queryByText("Connected")).toBeNull();
  });

  it("renders the plugin version", () => {
    render(<StatusBar connectionState={ConnectionState.CONNECTED} />);
    expect(screen.getByText("v0.1.0")).toBeInTheDocument();
  });
});

// ---------- ConfirmDialog ----------

describe("ConfirmDialog", () => {
  const baseProps = {
    title: "Delete asset?",
    message: "This action cannot be undone.",
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the title", () => {
    render(<ConfirmDialog {...baseProps} />);
    expect(screen.getByText("Delete asset?")).toBeInTheDocument();
  });

  it("renders the message", () => {
    render(<ConfirmDialog {...baseProps} />);
    expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument();
  });

  it("renders default Confirm and Cancel button labels", () => {
    render(<ConfirmDialog {...baseProps} />);
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("renders custom confirm and cancel labels", () => {
    render(<ConfirmDialog {...baseProps} confirmLabel="Yes, delete" cancelLabel="Keep it" />);
    expect(screen.getByText("Yes, delete")).toBeInTheDocument();
    expect(screen.getByText("Keep it")).toBeInTheDocument();
  });

  it("calls onConfirm when the confirm button is clicked", () => {
    render(<ConfirmDialog {...baseProps} />);
    fireEvent.click(screen.getByText("Confirm"));
    expect(baseProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the cancel button is clicked", () => {
    render(<ConfirmDialog {...baseProps} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(baseProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the backdrop overlay is clicked", () => {
    const { container } = render(<ConfirmDialog {...baseProps} />);
    // The outermost div is the backdrop overlay
    const backdrop = container.firstElementChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(baseProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not call onCancel when the dialog content is clicked", () => {
    const { container } = render(<ConfirmDialog {...baseProps} />);
    // The inner div (dialog card) stops propagation
    const dialogCard = container.firstElementChild!.firstElementChild as HTMLElement;
    fireEvent.click(dialogCard);
    expect(baseProps.onCancel).not.toHaveBeenCalled();
  });
});
