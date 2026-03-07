import { HostService, detectHostApp, HostAppId } from "./HostService";
import { PremiereService } from "./PremiereService";
import { AfterEffectsHostService } from "./AfterEffectsHostService";
import { AuditionHostService } from "./AuditionHostService";

/**
 * Create the appropriate HostService based on the detected host application.
 * PremiereService already implements the HostService interface via duck typing,
 * so it works as-is.
 */
export function createHostService(forceHost?: HostAppId): HostService {
  const hostId = forceHost ?? detectHostApp();

  switch (hostId) {
    case "aftereffects":
      return new AfterEffectsHostService();
    case "audition":
      return new AuditionHostService();
    case "premierepro":
    default:
      return new PremiereService() as unknown as HostService;
  }
}
