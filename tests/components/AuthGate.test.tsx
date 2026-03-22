import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";

// Control whether session restore returns authenticated
let mockRestoreSession: jest.Mock;

jest.mock("../../src/services/singleton", () => {
  const mockClient = {
    request: jest.fn().mockResolvedValue({}),
    setKs: jest.fn(),
    configure: jest.fn(),
    getServiceUrl: jest.fn().mockReturnValue("https://test.kaltura.com"),
  };

  const AuthServiceImpl = jest.fn().mockImplementation(() => ({
    get restoreSession() {
      return mockRestoreSession;
    },
    loginWithCredentials: jest.fn().mockResolvedValue({
      ks: "test_ks",
      partnerId: 12345,
      user: { id: "user1", email: "test@test.com", fullName: "Test User" },
    }),
    loginWithSso: jest.fn(),
    logout: jest.fn().mockResolvedValue(undefined),
  }));

  const authSvc = new AuthServiceImpl();

  return {
    client: mockClient,
    authService: authSvc,
    auditService: {
      logAction: jest.fn().mockResolvedValue(undefined),
    },
    hostService: {
      getAppInfo: jest.fn().mockReturnValue({
        id: "premierepro",
        name: "Premiere Pro",
        version: "25.2.0",
      }),
      isAvailable: jest.fn().mockReturnValue(true),
      syncWithProject: jest.fn(),
      getAllMappings: jest.fn().mockReturnValue(new Map()),
      clearMappings: jest.fn(),
    },
  };
});

jest.mock("../../src/services", () => ({
  KalturaClient: jest.fn(),
  AuthService: jest.fn(),
}));

import { AuthGate } from "../../src/components/AuthGate";

describe("AuthGate", () => {
  beforeEach(() => {
    mockRestoreSession = jest.fn().mockResolvedValue(null);
  });

  it("shows login when not authenticated", async () => {
    await act(async () => {
      render(<AuthGate>{() => <div>Authenticated Content</div>}</AuthGate>);
    });

    await waitFor(() => {
      expect(screen.getByText("Sign In")).toBeTruthy();
    });
    expect(screen.queryByText("Authenticated Content")).toBeNull();
  });

  it("renders children when session is restored", async () => {
    mockRestoreSession = jest.fn().mockResolvedValue({
      ks: "test_ks",
      partnerId: 12345,
      user: { id: "user1", email: "test@test.com", fullName: "Test User" },
    });

    await act(async () => {
      render(<AuthGate>{(ctx) => <div>Welcome {ctx.partnerId}</div>}</AuthGate>);
    });

    await waitFor(() => {
      expect(screen.getByText("Welcome 12345")).toBeTruthy();
    });
  });

  it("passes auth context to children", async () => {
    mockRestoreSession = jest.fn().mockResolvedValue({
      ks: "test_ks",
      partnerId: 99999,
      user: { id: "user2", email: "user2@test.com", fullName: "User Two" },
    });

    await act(async () => {
      render(
        <AuthGate>
          {(ctx) => (
            <div>
              <span>Partner: {ctx.partnerId}</span>
              <span>User: {ctx.userName}</span>
              <span>Email: {ctx.userEmail}</span>
            </div>
          )}
        </AuthGate>,
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Partner: 99999")).toBeTruthy();
      expect(screen.getByText("User: User Two")).toBeTruthy();
      expect(screen.getByText("Email: user2@test.com")).toBeTruthy();
    });
  });

  it("shows status bar with version", async () => {
    await act(async () => {
      render(<AuthGate>{() => <div>Content</div>}</AuthGate>);
    });

    await waitFor(() => {
      expect(screen.getByText(/^v\d/)).toBeTruthy();
    });
  });

  it("shows Disconnected state when not authenticated", async () => {
    await act(async () => {
      render(<AuthGate>{() => <div>Content</div>}</AuthGate>);
    });

    await waitFor(() => {
      expect(screen.getByText(/Disconnected/)).toBeTruthy();
    });
  });
});
