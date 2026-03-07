/** Base error for all Kaltura panel errors */
export class KalturaPanelError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = true,
  ) {
    super(message);
    this.name = "KalturaPanelError";
  }
}

/** Authentication errors */
export class AuthenticationError extends KalturaPanelError {
  constructor(message: string, code: string = "AUTH_ERROR") {
    super(message, code, true);
    this.name = "AuthenticationError";
  }
}

/** Kaltura API errors */
export class KalturaApiError extends KalturaPanelError {
  constructor(
    message: string,
    public readonly apiCode: string,
    public readonly apiArgs?: Record<string, string>,
  ) {
    super(message, `KALTURA_API_${apiCode}`, true);
    this.name = "KalturaApiError";
  }
}

/** Network errors */
export class NetworkError extends KalturaPanelError {
  constructor(message: string = "Network request failed") {
    super(message, "NETWORK_ERROR", true);
    this.name = "NetworkError";
  }
}

/** Upload errors */
export class UploadError extends KalturaPanelError {
  constructor(
    message: string,
    public readonly bytesUploaded: number = 0,
  ) {
    super(message, "UPLOAD_ERROR", true);
    this.name = "UploadError";
  }
}

/** Premiere API errors */
export class PremiereApiError extends KalturaPanelError {
  constructor(message: string) {
    super(message, "PREMIERE_API_ERROR", false);
    this.name = "PremiereApiError";
  }
}

/** User-friendly error messages */
export function getUserMessage(error: unknown): string {
  if (error instanceof AuthenticationError) {
    if (error.code === "AUTH_INVALID_CREDENTIALS") {
      return "Invalid email or password. Please try again.";
    }
    if (error.code === "AUTH_EXPIRED") {
      return "Your session has expired. Please sign in again.";
    }
    return "Authentication failed. Please try signing in again.";
  }

  if (error instanceof KalturaApiError) {
    if (error.apiCode === "INVALID_KS") {
      return "Your session is no longer valid. Please sign in again.";
    }
    if (error.apiCode === "SERVICE_FORBIDDEN") {
      return "You don't have permission to perform this action.";
    }
    return `Operation failed: ${error.message}`;
  }

  if (error instanceof NetworkError) {
    return "Unable to connect to Kaltura. Please check your network connection.";
  }

  if (error instanceof UploadError) {
    return `Upload failed. ${error.bytesUploaded > 0 ? "You can retry to resume." : "Please try again."}`;
  }

  if (error instanceof PremiereApiError) {
    return `Premiere Pro error: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred.";
}
