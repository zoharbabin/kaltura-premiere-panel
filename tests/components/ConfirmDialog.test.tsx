import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";

describe("ConfirmDialog", () => {
  const defaultProps = {
    title: "Delete Entry",
    message: "Are you sure you want to delete this entry?",
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it("renders title and message", () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText("Delete Entry")).toBeTruthy();
    expect(screen.getByText("Are you sure you want to delete this entry?")).toBeTruthy();
  });

  it("renders default button labels", () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText("Confirm")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("renders custom button labels", () => {
    render(<ConfirmDialog {...defaultProps} confirmLabel="Yes, Delete" cancelLabel="No, Keep" />);
    expect(screen.getByText("Yes, Delete")).toBeTruthy();
    expect(screen.getByText("No, Keep")).toBeTruthy();
  });

  it("calls onConfirm when confirm button clicked", () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("Confirm"));
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
    expect(defaultProps.onCancel).not.toHaveBeenCalled();
  });

  it("calls onCancel when cancel button clicked", () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  it("calls onCancel when backdrop clicked", () => {
    const { container } = render(<ConfirmDialog {...defaultProps} />);
    // Backdrop is the outermost fixed div
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not call onCancel when dialog body clicked", () => {
    const { container } = render(<ConfirmDialog {...defaultProps} />);
    // Dialog body is the inner div
    const backdrop = container.firstChild as HTMLElement;
    const dialogBody = backdrop.firstChild as HTMLElement;
    fireEvent.click(dialogBody);
    expect(defaultProps.onCancel).not.toHaveBeenCalled();
  });

  it("renders with negative variant", () => {
    const { container } = render(<ConfirmDialog {...defaultProps} variant="negative" />);
    const confirmBtn = container.querySelector('sp-button[variant="negative"]');
    expect(confirmBtn).toBeTruthy();
  });
});
