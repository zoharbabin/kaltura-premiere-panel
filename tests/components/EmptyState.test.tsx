import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmptyState } from "../../src/components/EmptyState";

describe("EmptyState", () => {
  it("renders title", () => {
    render(<EmptyState title="No results" />);
    expect(screen.getByText("No results")).toBeTruthy();
  });

  it("renders description when provided", () => {
    render(<EmptyState title="No results" description="Try a different search query." />);
    expect(screen.getByText("Try a different search query.")).toBeTruthy();
  });

  it("does not render description when not provided", () => {
    const { container } = render(<EmptyState title="No results" />);
    expect(container.querySelectorAll("sp-body").length).toBe(0);
  });

  it("renders action button when both actionLabel and onAction provided", () => {
    const onAction = jest.fn();
    render(<EmptyState title="Empty" actionLabel="Add Item" onAction={onAction} />);
    expect(screen.getByText("Add Item")).toBeTruthy();
  });

  it("calls onAction when action button clicked", () => {
    const onAction = jest.fn();
    render(<EmptyState title="Empty" actionLabel="Add Item" onAction={onAction} />);
    fireEvent.click(screen.getByText("Add Item"));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("does not render action button when only actionLabel provided (no handler)", () => {
    const { container } = render(<EmptyState title="Empty" actionLabel="Add Item" />);
    expect(container.querySelectorAll("sp-button").length).toBe(0);
  });

  it("does not render action button when only onAction provided (no label)", () => {
    const { container } = render(<EmptyState title="Empty" onAction={() => {}} />);
    expect(container.querySelectorAll("sp-button").length).toBe(0);
  });
});
