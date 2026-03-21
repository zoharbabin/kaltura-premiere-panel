import { runSignOutCommand } from "../../src/commands/SignOutCommand";

describe("SignOutCommand", () => {
  const mockAuthService = {
    logout: jest.fn().mockResolvedValue(undefined),
    restoreSession: jest.fn().mockResolvedValue(null),
    loginWithCredentials: jest.fn(),
    loginWithSso: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, "alert").mockImplementation(() => {});
  });

  it("calls authService.logout()", async () => {
    await runSignOutCommand(mockAuthService as never);
    expect(mockAuthService.logout).toHaveBeenCalledTimes(1);
  });

  it("dispatches kaltura:signout event to notify panels", async () => {
    const handler = jest.fn();
    document.addEventListener("kaltura:signout", handler);
    await runSignOutCommand(mockAuthService as never);
    expect(handler).toHaveBeenCalledTimes(1);
    document.removeEventListener("kaltura:signout", handler);
  });

  it("shows confirmation alert on success", async () => {
    await runSignOutCommand(mockAuthService as never);
    expect(window.alert).toHaveBeenCalledWith("You have been signed out of Kaltura.");
  });

  it("shows error alert on failure", async () => {
    mockAuthService.logout.mockRejectedValueOnce(new Error("Network error"));
    await runSignOutCommand(mockAuthService as never);
    expect(window.alert).toHaveBeenCalledWith("Sign out failed. Please try again.");
  });
});
