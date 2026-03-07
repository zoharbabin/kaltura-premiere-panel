import { SequenceInfo, ImportResult, MarkerData, AssetMapping } from "../types/premiere";
import { PremiereApiError } from "../utils/errors";
import { KALTURA_BIN_NAME, STORAGE_KEY_ASSET_MAPPINGS } from "../utils/constants";
import { createLogger } from "../utils/logger";

const log = createLogger("PremiereService");

// Type declarations for UXP premierepro module
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace premierepro {
  class Project {
    static getActiveProject(): Promise<Project>;
    getRootItem(): Promise<FolderItem>;
    getActiveSequence(): Promise<Sequence | null>;
    importFiles(paths: string[], targetBin?: FolderItem): Promise<void>;
    executeTransaction(fn: () => Promise<void>, name: string): Promise<void>;
  }
  class FolderItem {
    name: string;
    children: ProjectItem[];
    createBinAction(name: string): Promise<Action>;
  }
  interface ProjectItem {
    name: string;
    type: number;
  }
  class Sequence {
    name: string;
    id: string;
    getMarkers(): Promise<Markers>;
    videoTracks: unknown[];
    audioTracks: unknown[];
    settings: SequenceSettings;
  }
  interface SequenceSettings {
    videoFrameRate: { seconds: number };
    videoFrameWidth: number;
    videoFrameHeight: number;
    videoDisplayFormat: number;
  }
  class Markers {
    createAddMarkerAction(data: {
      start: TickTime;
      name: string;
      comments: string;
      colorIndex: number;
      duration?: TickTime;
    }): Promise<Action>;
  }
  class TickTime {
    static fromSeconds(s: number): TickTime;
    toSeconds(): number;
  }
  class CompoundAction {
    addAction(action: Action): void;
    execute(): Promise<void>;
  }
  class EncoderManager {
    static getInstance(): Promise<EncoderManager>;
    exportSequence(sequence: Sequence, outputPath: string, presetPath: string): Promise<void>;
    addEventListener(event: string, handler: (e: unknown) => void): void;
    removeEventListener(event: string, handler: (e: unknown) => void): void;
  }
  class Application {
    static get version(): string;
  }
  interface Action {
    execute(): Promise<void>;
  }
}

/** Check if the premierepro module is available (false in test/standalone environments) */
function isPremiereAvailable(): boolean {
  try {
    require("premierepro");
    return true;
  } catch {
    return false;
  }
}

/** Get the premierepro module (throws if not available) */
function getPremiere(): typeof premierepro {
  if (!isPremiereAvailable()) {
    throw new PremiereApiError("Premiere Pro API is not available in this environment");
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("premierepro") as typeof premierepro;
}

/**
 * Abstraction layer for Adobe Premiere Pro UXP API.
 * Wraps all Premiere operations with error handling and transaction support.
 */
export class PremiereService {
  private mappings: Map<string, AssetMapping> = new Map();

  constructor() {
    this.loadMappings();
  }

  /** Check if Premiere Pro API is available */
  isAvailable(): boolean {
    return isPremiereAvailable();
  }

  /** Get Premiere Pro version */
  getVersion(): string {
    try {
      const pp = getPremiere();
      return pp.Application.version;
    } catch {
      return "unknown";
    }
  }

  /** Get active sequence info */
  async getActiveSequence(): Promise<SequenceInfo | null> {
    const pp = getPremiere();
    const project = await pp.Project.getActiveProject();
    const sequence = await project.getActiveSequence();

    if (!sequence) return null;

    return {
      name: sequence.name,
      id: sequence.id,
      duration: 0, // TODO: compute from sequence
      frameRate: sequence.settings.videoFrameRate?.seconds
        ? 1 / sequence.settings.videoFrameRate.seconds
        : 29.97,
      width: sequence.settings.videoFrameWidth,
      height: sequence.settings.videoFrameHeight,
    };
  }

  /** Import files into the project under a "Kaltura Assets" bin */
  async importFiles(filePaths: string[]): Promise<ImportResult> {
    const pp = getPremiere();
    log.info("Importing files to project", { count: filePaths.length });

    try {
      const project = await pp.Project.getActiveProject();

      await project.executeTransaction(async () => {
        const rootItem = await project.getRootItem();
        let bin = this.findBinByName(rootItem, KALTURA_BIN_NAME);

        if (!bin) {
          const createAction = await rootItem.createBinAction(KALTURA_BIN_NAME);
          await createAction.execute();
          bin = this.findBinByName(rootItem, KALTURA_BIN_NAME);
        }

        await project.importFiles(filePaths, bin ?? undefined);
      }, "Kaltura: Import Assets");

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed";
      log.error("Import failed", error);
      return { success: false, error: message };
    }
  }

  /** Add markers to the active sequence (batched as a single undo step) */
  async addMarkers(markers: MarkerData[]): Promise<void> {
    const pp = getPremiere();
    const project = await pp.Project.getActiveProject();
    const sequence = await project.getActiveSequence();

    if (!sequence) {
      throw new PremiereApiError("No active sequence");
    }

    await project.executeTransaction(async () => {
      const sequenceMarkers = await sequence.getMarkers();
      const compoundAction = new pp.CompoundAction();

      for (const marker of markers) {
        const action = await sequenceMarkers.createAddMarkerAction({
          start: pp.TickTime.fromSeconds(marker.start),
          name: marker.name,
          comments: marker.comments,
          colorIndex: marker.colorIndex,
          duration: marker.duration ? pp.TickTime.fromSeconds(marker.duration) : undefined,
        });
        compoundAction.addAction(action);
      }

      await compoundAction.execute();
    }, "Kaltura: Add Markers");

    log.info("Added markers", { count: markers.length });
  }

  /** Get markers from the active sequence */
  async getMarkers(): Promise<MarkerData[]> {
    const pp = getPremiere();
    const project = await pp.Project.getActiveProject();
    const sequence = await project.getActiveSequence();

    if (!sequence) {
      throw new PremiereApiError("No active sequence");
    }

    const sequenceMarkers = await sequence.getMarkers();
    const results: MarkerData[] = [];

    if (sequenceMarkers && Array.isArray(sequenceMarkers)) {
      for (const m of sequenceMarkers) {
        results.push({
          start: m.start?.toSeconds?.() ?? 0,
          name: m.name ?? "",
          comments: m.comments ?? "",
          colorIndex: m.colorIndex ?? 0,
          duration: m.duration?.toSeconds?.(),
        });
      }
    }

    return results;
  }

  /** Save an asset mapping (tracks which Kaltura entries are imported locally) */
  saveMapping(entryId: string, mapping: AssetMapping): void {
    this.mappings.set(entryId, mapping);
    this.persistMappings();
  }

  /** Get asset mapping for an entry */
  getMapping(entryId: string): AssetMapping | undefined {
    return this.mappings.get(entryId);
  }

  /** Check if an entry has been imported */
  isImported(entryId: string): boolean {
    return this.mappings.has(entryId);
  }

  /** Get all asset mappings */
  getAllMappings(): Map<string, AssetMapping> {
    return new Map(this.mappings);
  }

  /** Clear all asset mappings */
  clearMappings(): void {
    this.mappings.clear();
    this.persistMappings();
  }

  private findBinByName(
    parent: premierepro.FolderItem,
    name: string,
  ): premierepro.FolderItem | null {
    if (!parent.children) return null;
    for (const child of parent.children) {
      if (child.name === name && child.type === 2) {
        return child as unknown as premierepro.FolderItem;
      }
    }
    return null;
  }

  private loadMappings(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_ASSET_MAPPINGS);
      if (stored) {
        const entries = JSON.parse(stored) as [string, AssetMapping][];
        this.mappings = new Map(entries);
      }
    } catch {
      this.mappings = new Map();
    }
  }

  private persistMappings(): void {
    try {
      const entries = Array.from(this.mappings.entries());
      localStorage.setItem(STORAGE_KEY_ASSET_MAPPINGS, JSON.stringify(entries));
    } catch (error) {
      log.error("Failed to persist asset mappings", error);
    }
  }
}
