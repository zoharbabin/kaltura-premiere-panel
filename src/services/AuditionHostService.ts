import { SequenceInfo, ImportResult, MarkerData } from "../types/premiere";
import { HostService, HostAppInfo } from "./HostService";
import { STORAGE_KEY_ASSET_MAPPINGS } from "../utils/constants";
import { createLogger } from "../utils/logger";

const log = createLogger("AuditionHost");

/** Type declarations for UXP audition module */
// eslint-disable-next-line @typescript-eslint/no-namespace, @typescript-eslint/no-unused-vars
declare namespace audition {
  class Application {
    static get version(): string;
  }
  class Document {
    static getActiveDocument(): Promise<AudioDocument | null>;
  }
  interface AudioDocument {
    name: string;
    id: string;
    duration: number;
    sampleRate: number;
    channels: number;
    importFile(path: string): Promise<void>;
    addMarker(time: number, name: string): void;
  }
}

function isAuditionAvailable(): boolean {
  try {
    require("audition");
    return true;
  } catch {
    return false;
  }
}

function getAudition(): typeof audition {
  return require("audition") as typeof audition;
}

/**
 * Host service implementation for Adobe Audition.
 * Audio-focused: sequences map to audio sessions, no video dimensions.
 */
export class AuditionHostService implements HostService {
  private mappings: Map<string, string> = new Map();

  constructor() {
    this.loadMappings();
  }

  getAppInfo(): HostAppInfo {
    return {
      id: "audition",
      name: "Audition",
      version: this.getVersion(),
      supportsVideo: false,
      supportsAudio: true,
      supportsSequences: true, // Multitrack sessions
      supportsMarkers: true,
    };
  }

  isAvailable(): boolean {
    return isAuditionAvailable();
  }

  getVersion(): string {
    if (!this.isAvailable()) return "N/A";
    try {
      const aud = getAudition();
      return aud.Application.version;
    } catch {
      return "Unknown";
    }
  }

  async getActiveSequence(): Promise<SequenceInfo | null> {
    if (!this.isAvailable()) return null;
    try {
      const aud = getAudition();
      const doc = await aud.Document.getActiveDocument();
      if (!doc) return null;

      return {
        name: doc.name,
        id: doc.id,
        duration: doc.duration,
        frameRate: 0, // Audio-only
        width: 0,
        height: 0,
      };
    } catch (err) {
      log.error("Failed to get active document", err);
      return null;
    }
  }

  async importFile(filePath: string): Promise<ImportResult> {
    if (!this.isAvailable()) {
      return { success: false, error: "Audition is not available" };
    }
    try {
      const aud = getAudition();
      const doc = await aud.Document.getActiveDocument();
      if (!doc) {
        return { success: false, error: "No active document" };
      }
      await doc.importFile(filePath);
      log.info("Imported audio file", { filePath });
      return { success: true, projectItemId: filePath };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      return { success: false, error: msg };
    }
  }

  async addMarkers(markers: MarkerData[]): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      const aud = getAudition();
      const doc = await aud.Document.getActiveDocument();
      if (!doc) return;

      for (const marker of markers) {
        doc.addMarker(marker.start, marker.name);
      }
      log.info("Added markers to session", { count: markers.length });
    } catch (err) {
      log.error("Failed to add markers", err);
    }
  }

  isImported(entryId: string): boolean {
    return this.mappings.has(entryId);
  }

  storeMapping(entryId: string, localPath: string): void {
    this.mappings.set(entryId, localPath);
    this.saveMappings();
  }

  getAllMappings(): Map<string, string> {
    return new Map(this.mappings);
  }

  clearMappings(): void {
    this.mappings.clear();
    this.saveMappings();
  }

  private loadMappings(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_ASSET_MAPPINGS);
      if (stored) {
        const pairs: [string, string][] = JSON.parse(stored);
        this.mappings = new Map(pairs);
      }
    } catch {
      // Ignore
    }
  }

  private saveMappings(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY_ASSET_MAPPINGS,
        JSON.stringify(Array.from(this.mappings.entries())),
      );
    } catch {
      // Ignore
    }
  }
}
