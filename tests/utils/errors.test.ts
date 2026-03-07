import {
  KalturaPanelError,
  AuthenticationError,
  KalturaApiError,
  NetworkError,
  UploadError,
  PremiereApiError,
  getUserMessage,
} from "../../src/utils/errors";

describe("Error classes", () => {
  it("creates KalturaPanelError with correct properties", () => {
    const err = new KalturaPanelError("test", "TEST_CODE", false);
    expect(err.message).toBe("test");
    expect(err.code).toBe("TEST_CODE");
    expect(err.recoverable).toBe(false);
    expect(err.name).toBe("KalturaPanelError");
  });

  it("creates AuthenticationError", () => {
    const err = new AuthenticationError("bad creds", "AUTH_INVALID_CREDENTIALS");
    expect(err.code).toBe("AUTH_INVALID_CREDENTIALS");
    expect(err.recoverable).toBe(true);
  });

  it("creates KalturaApiError with API details", () => {
    const err = new KalturaApiError("forbidden", "SERVICE_FORBIDDEN", { test: "val" });
    expect(err.apiCode).toBe("SERVICE_FORBIDDEN");
    expect(err.apiArgs).toEqual({ test: "val" });
  });

  it("creates UploadError with bytes tracking", () => {
    const err = new UploadError("failed", 5000);
    expect(err.bytesUploaded).toBe(5000);
  });
});

describe("getUserMessage", () => {
  it("returns friendly message for auth errors", () => {
    const err = new AuthenticationError("test", "AUTH_INVALID_CREDENTIALS");
    expect(getUserMessage(err)).toBe("Invalid email or password. Please try again.");
  });

  it("returns friendly message for expired sessions", () => {
    const err = new AuthenticationError("test", "AUTH_EXPIRED");
    expect(getUserMessage(err)).toBe("Your session has expired. Please sign in again.");
  });

  it("returns friendly message for KalturaApiError INVALID_KS", () => {
    const err = new KalturaApiError("test", "INVALID_KS");
    expect(getUserMessage(err)).toBe("Your session is no longer valid. Please sign in again.");
  });

  it("returns friendly message for network errors", () => {
    expect(getUserMessage(new NetworkError())).toBe(
      "Unable to connect to Kaltura. Please check your network connection.",
    );
  });

  it("returns friendly message for upload errors", () => {
    expect(getUserMessage(new UploadError("fail", 1000))).toContain("retry to resume");
    expect(getUserMessage(new UploadError("fail", 0))).toContain("Please try again");
  });

  it("returns friendly message for Premiere errors", () => {
    expect(getUserMessage(new PremiereApiError("no seq"))).toContain("Premiere Pro error");
  });

  it("handles plain Error objects", () => {
    expect(getUserMessage(new Error("something broke"))).toBe("something broke");
  });

  it("handles unknown values", () => {
    expect(getUserMessage("random string")).toBe("An unexpected error occurred.");
    expect(getUserMessage(null)).toBe("An unexpected error occurred.");
  });
});
