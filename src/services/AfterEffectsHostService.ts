import { SequenceInfo, ImportResult, MarkerData } from "../types/premiere";
import { HostService, HostAppInfo } from "./HostService";
import { STORAGE_KEY_ASSET_MAPPINGS } from "../utils/constants";
import { createLogger } from "../utils/logger";

const log = createLogger("AfterEffectsHost");

/** Type declarations for UXP aftereffects module */
// eslint-disable-next-line @typescript-eslint/no-namespace, @typescript-eslint/no-unused-vars
declare namespace aftereffects {
  class Application {
    static get version(): string;
  }
  class Project {
    static getActiveProject(): Promise<Project>;
    importFile(path: string): Promise<FootageItem>;
    getActiveComposition(): Promise<Composition | null>;
  }
  interface FootageItem {
    name: string;
    id: number;
  }
  class Composition {
    name: string;
    id: string;
    duration: number;
    frameRate: number;
    width: number;
    height: number;
    layers: Layer[];
    addMarker(time: number, comment: string): void;
  }
  interface Layer {
    name: string;
  }
}

function isAfterEffectsAvailable(): boolean {
  try {
    require("aftereffects");
    return true;
  } catch {
    return false;
  }
}

function getAE(): typeof aftereffects {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("aftereffects") as typeof aftereffects;
}

/**
 * Host service implementation for Adobe After Effects.
 * Adapts After Effects UXP API to the common HostService interface.
 */
export class AfterEffectsHostService implements HostService {
  private mappings: Map<string, string> = new Map();

  constructor() {
    this.loadMappings();
  }

  getAppInfo(): HostAppInfo {
    return {
      id: "aftereffects",
      name: "After Effects",
      version: this.getVersion(),
      supportsVideo: true,
      supportsAudio: true,
      supportsSequences: true, // Compositions
      supportsMarkers: true,
    };
  }

  isAvailable(): boolean {
    return isAfterEffectsAvailable();
  }

  getVersion(): string {
    if (!this.isAvailable()) return "N/A";
    try {
      const ae = getAE();
      return ae.Application.version;
    } catch {
      return "Unknown";
    }
  }

  async getActiveSequence(): Promise<SequenceInfo | null> {
    if (!this.isAvailable()) return null;
    try {
      const ae = getAE();
      const project = await ae.Project.getActiveProject();
      const comp = await project.getActiveComposition();
      if (!comp) return null;

      return {
        name: comp.name,
        id: comp.id,
        duration: comp.duration,
        frameRate: comp.frameRate,
        width: comp.width,
        height: comp.height,
      };
    } catch (err) {
      log.error("Failed to get active composition", err);
      return null;
    }
  }

  async importFile(filePath: string): Promise<ImportResult> {
    if (!this.isAvailable()) {
      return { success: false, error: "After Effects is not available" };
    }
    try {
      const ae = getAE();
      const project = await ae.Project.getActiveProject();
      await project.importFile(filePath);
      log.info("Imported file into AE project", { filePath });
      return { success: true, projectItemId: filePath };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      return { success: false, error: msg };
    }
  }

  async addMarkers(markers: MarkerData[]): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      const ae = getAE();
      const project = await ae.Project.getActiveProject();
      const comp = await project.getActiveComposition();
      if (!comp) return;

      for (const marker of markers) {
        comp.addMarker(marker.start, `${marker.name}: ${marker.comments}`);
      }
      log.info("Added markers to composition", { count: markers.length });
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
