import { HostService, HostAppInfo, detectHostApp, HostAppId } from "./HostService";
import { PremiereService } from "./PremiereService";
import { AfterEffectsHostService } from "./AfterEffectsHostService";
import { AuditionHostService } from "./AuditionHostService";
import { SequenceInfo, ImportResult, MarkerData } from "../types/premiere";

/**
 * Adapter that wraps PremiereService to conform to the HostService interface.
 * PremiereService has a slightly different API shape (importFiles vs importFile,
 * saveMapping vs storeMapping, no getAppInfo), so this bridges the gap.
 */
class PremiereHostAdapter implements HostService {
  private premiere: PremiereService;

  constructor() {
    this.premiere = new PremiereService();
  }

  getAppInfo(): HostAppInfo {
    return {
      id: "premierepro",
      name: "Premiere Pro",
      version: this.getVersion(),
      supportsVideo: true,
      supportsAudio: true,
      supportsSequences: true,
      supportsMarkers: true,
    };
  }

  isAvailable(): boolean {
    return this.premiere.isAvailable();
  }

  getVersion(): string {
    return this.premiere.getVersion();
  }

  getActiveSequence(): Promise<SequenceInfo | null> {
    return this.premiere.getActiveSequence();
  }

  async importFile(filePath: string, fileEntry?: unknown): Promise<ImportResult> {
    return this.premiere.importFiles([filePath], fileEntry ? [fileEntry] : undefined);
  }

  addMarkers(markers: MarkerData[]): Promise<void> {
    return this.premiere.addMarkers(markers);
  }

  getMarkers(): Promise<MarkerData[]> {
    return this.premiere.getMarkers();
  }

  isImported(entryId: string): boolean {
    return this.premiere.isImported(entryId);
  }

  storeMapping(entryId: string, localPath: string): void {
    this.premiere.saveMapping(entryId, {
      entryId,
      flavorId: "",
      localPath,
      importDate: Date.now(),
      isProxy: false,
    });
  }

  getAllMappings(): Map<string, string> {
    const result = new Map<string, string>();
    const mappings = this.premiere.getAllMappings();
    for (const [key, value] of mappings) {
      result.set(key, value.localPath);
    }
    return result;
  }

  clearMappings(): void {
    this.premiere.clearMappings();
  }

  async syncWithProject(): Promise<void> {
    return this.premiere.syncWithProject();
  }
}

/**
 * Create the appropriate HostService based on the detected host application.
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
      return new PremiereHostAdapter();
  }
}
