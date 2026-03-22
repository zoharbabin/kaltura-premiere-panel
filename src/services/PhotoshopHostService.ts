import { SequenceInfo, ImportResult, MarkerData } from "../types/premiere";
import { HostService, HostAppInfo } from "./HostService";
import { STORAGE_KEY_ASSET_MAPPINGS } from "../utils/constants";
import { createLogger } from "../utils/logger";

const log = createLogger("PhotoshopHost");

/** Type declarations for UXP photoshop module */
interface PhotoshopDocument {
  name: string;
  id: number;
  width: number;
  height: number;
}

interface PhotoshopApp {
  activeDocument: PhotoshopDocument | null;
  open(entry: unknown): Promise<PhotoshopDocument>;
}

interface PhotoshopCore {
  executeAsModal(fn: () => Promise<void>, options: { commandName: string }): Promise<void>;
}

interface PhotoshopModule {
  app: PhotoshopApp;
  core: PhotoshopCore;
  action: {
    batchPlay(
      descriptors: Record<string, unknown>[],
      options: Record<string, unknown>,
    ): Promise<unknown[]>;
  };
}

function isPhotoshopAvailable(): boolean {
  try {
    require("photoshop");
    return true;
  } catch {
    return false;
  }
}

function getPS(): PhotoshopModule {
  return require("photoshop") as PhotoshopModule;
}

/**
 * Host service implementation for Adobe Photoshop.
 * Image-focused: no sequences/timelines, no markers, no export.
 * Browse + Import workflow is fully supported.
 */
export class PhotoshopHostService implements HostService {
  private mappings: Map<string, string> = new Map();

  constructor() {
    this.loadMappings();
  }

  getAppInfo(): HostAppInfo {
    return {
      id: "photoshop",
      name: "Photoshop",
      version: this.getVersion(),
      supportsVideo: false,
      supportsAudio: false,
      supportsSequences: false,
      supportsMarkers: false,
    };
  }

  isAvailable(): boolean {
    return isPhotoshopAvailable();
  }

  getVersion(): string {
    if (!this.isAvailable()) return "N/A";
    try {
      const ps = getPS();
      // Photoshop UXP exposes version via app
      return (ps.app as unknown as { version: string }).version ?? "Unknown";
    } catch {
      return "Unknown";
    }
  }

  async getActiveSequence(): Promise<SequenceInfo | null> {
    if (!this.isAvailable()) return null;
    try {
      const ps = getPS();
      const doc = ps.app.activeDocument;
      if (!doc) return null;

      return {
        name: doc.name,
        id: String(doc.id),
        duration: 0,
        frameRate: 0,
        width: doc.width,
        height: doc.height,
      };
    } catch (err) {
      log.error("Failed to get active document", err);
      return null;
    }
  }

  async importFile(filePath: string): Promise<ImportResult> {
    if (!this.isAvailable()) {
      return { success: false, error: "Photoshop is not available" };
    }
    try {
      const ps = getPS();
      const uxpStorage = require("uxp").storage.localFileSystem;
      const fileEntry = await uxpStorage.getEntryWithUrl("file:" + filePath);

      await ps.core.executeAsModal(
        async () => {
          await ps.app.open(fileEntry);
        },
        { commandName: "Import Kaltura Asset" },
      );

      log.info("Opened file in Photoshop", { filePath });
      return { success: true, projectItemId: filePath };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      return { success: false, error: msg };
    }
  }

  async addMarkers(_markers: MarkerData[]): Promise<void> {
    // Photoshop does not support timeline markers
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
