import React from "react";
import { render, screen } from "@testing-library/react";
import { LoginPanel } from "../../src/panels/LoginPanel";

const defaultProps = {
  onLogin: jest.fn().mockResolvedValue(undefined),
  isLoading: false,
  error: null,
  onClearError: jest.fn(),
};

describe("LoginPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders sign-in form when not loading", () => {
    render(<LoginPanel {...defaultProps} />);
    expect(screen.getByText("Sign In")).toBeTruthy();
  });

  it("shows the plugin name", () => {
    render(<LoginPanel {...defaultProps} />);
    expect(screen.getByText("Kaltura for Premiere Pro")).toBeTruthy();
  });

  it("shows loading spinner when isLoading is true", () => {
    render(<LoginPanel {...defaultProps} isLoading={true} />);
    expect(screen.getByText("Signing in...")).toBeTruthy();
    expect(screen.queryByText("Sign In")).toBeNull();
  });

  it("shows error banner when error prop is set", () => {
    render(<LoginPanel {...defaultProps} error="Invalid credentials" />);
    expect(screen.getByText("Invalid credentials")).toBeTruthy();
  });

  it("shows SSO tab when onSsoLogin is provided", () => {
    const onSsoLogin = jest.fn().mockResolvedValue(undefined);
    render(<LoginPanel {...defaultProps} onSsoLogin={onSsoLogin} />);
    expect(screen.getByText("SSO")).toBeTruthy();
    expect(screen.getByText("Email")).toBeTruthy();
  });

  it("does not show SSO tab when onSsoLogin is not provided", () => {
    render(<LoginPanel {...defaultProps} />);
    expect(screen.queryByText("SSO")).toBeNull();
  });
});
