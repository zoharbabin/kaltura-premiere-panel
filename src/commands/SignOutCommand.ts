/**
 * SignOutCommand — clears the Kaltura session and notifies the user.
 *
 * Simple command entrypoint: calls authService.logout(), which clears
 * KS from SecureStorage. All mounted panels will re-render to show login.
 */
import { AuthService } from "../services/AuthService";
import { createLogger } from "../utils/logger";

const log = createLogger("SignOutCommand");

export async function runSignOutCommand(authService: AuthService): Promise<void> {
  try {
    await authService.logout();
    log.info("User signed out via command");
    try {
      alert("You have been signed out of Kaltura.");
    } catch {
      // alert() may not be available in all UXP contexts
    }
  } catch (err) {
    log.error("Sign out failed", err);
    try {
      alert("Sign out failed. Please try again.");
    } catch {
      // ignore
    }
  }
}
