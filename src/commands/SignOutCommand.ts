/**
 * SignOutCommand — clears the Kaltura session and notifies the user.
 *
 * Simple command entrypoint: calls authService.logout(), which clears
 * KS from SecureStorage. All mounted panels will re-render to show login.
 */
import { AuthService } from "../services/AuthService";
import { AUTH_SIGNOUT_EVENT } from "../utils/constants";
import { createLogger } from "../utils/logger";
import { translate, detectLocale } from "../i18n";

const log = createLogger("SignOutCommand");

export async function runSignOutCommand(authService: AuthService): Promise<void> {
  const locale = detectLocale();
  try {
    await authService.logout();
    // Notify all mounted panels to reset their auth state
    document.dispatchEvent(new Event(AUTH_SIGNOUT_EVENT));
    log.info("User signed out via command");
    try {
      alert(translate(locale, "command.signedOut"));
    } catch {
      // alert() may not be available in all UXP contexts
    }
  } catch (err) {
    log.error("Sign out failed", err);
    try {
      alert(translate(locale, "command.signOutFailed"));
    } catch {
      // ignore
    }
  }
}
