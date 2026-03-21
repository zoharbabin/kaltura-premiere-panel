import React from "react";
import { render, screen } from "@testing-library/react";
import { LoadingSpinner } from "../../src/components/LoadingSpinner";

describe("LoadingSpinner", () => {
  it("renders without label", () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector(".css-spinner")).toBeTruthy();
    expect(container.querySelectorAll("sp-body").length).toBe(0);
  });

  it("renders with label", () => {
    render(<LoadingSpinner label="Loading data..." />);
    expect(screen.getByText("Loading data...")).toBeTruthy();
  });

  it("defaults to medium size (32px)", () => {
    const { container } = render(<LoadingSpinner />);
    const spinner = container.querySelector(".css-spinner") as HTMLElement;
    expect(spinner.style.width).toBe("32px");
  });

  it("renders small size (20px)", () => {
    const { container } = render(<LoadingSpinner size="small" />);
    const spinner = container.querySelector(".css-spinner") as HTMLElement;
    expect(spinner.style.width).toBe("20px");
  });

  it("renders large size (48px)", () => {
    const { container } = render(<LoadingSpinner size="large" />);
    const spinner = container.querySelector(".css-spinner") as HTMLElement;
    expect(spinner.style.width).toBe("48px");
  });
});
