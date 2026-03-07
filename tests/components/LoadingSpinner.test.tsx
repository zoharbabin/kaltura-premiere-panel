import React from "react";
import { render, screen } from "@testing-library/react";
import { LoadingSpinner } from "../../src/components/LoadingSpinner";

describe("LoadingSpinner", () => {
  it("renders without label", () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector("sp-progress-circle")).toBeTruthy();
    expect(container.querySelectorAll("sp-body").length).toBe(0);
  });

  it("renders with label", () => {
    render(<LoadingSpinner label="Loading data..." />);
    expect(screen.getByText("Loading data...")).toBeTruthy();
  });

  it("defaults to medium size", () => {
    const { container } = render(<LoadingSpinner />);
    const circle = container.querySelector("sp-progress-circle") as HTMLElement;
    expect(circle.getAttribute("size")).toBe("medium");
  });

  it("renders small size", () => {
    const { container } = render(<LoadingSpinner size="small" />);
    const circle = container.querySelector("sp-progress-circle") as HTMLElement;
    expect(circle.getAttribute("size")).toBe("small");
  });

  it("renders large size", () => {
    const { container } = render(<LoadingSpinner size="large" />);
    const circle = container.querySelector("sp-progress-circle") as HTMLElement;
    expect(circle.getAttribute("size")).toBe("large");
  });

  it("has indeterminate attribute", () => {
    const { container } = render(<LoadingSpinner />);
    const circle = container.querySelector("sp-progress-circle") as HTMLElement;
    expect(circle.hasAttribute("indeterminate")).toBe(true);
  });
});
