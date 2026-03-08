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
    name: string;
    getRootItem(): Promise<FolderItem>;
    getActiveSequence(): Promise<Sequence | null>;
    importFiles(
      paths: string[],
      suppressUI?: boolean,
      targetBin?: ProjectItem,
      asNumberedStills?: boolean,
    ): Promise<boolean>;
    executeTransaction(fn: () => Promise<void>, name: string): Promise<void>;
  }
  interface ProjectItem {
    name: string;
    type: number;
  }
  class FolderItem implements ProjectItem {
    name: string;
    type: number;
    children: ProjectItem[];
    createBinAction(name: string): Promise<Action>;
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
  private currentProjectName = "";

  constructor() {
    this.loadMappings();
  }

  /**
   * Sync mappings with the current project name.
   * When the project changes, mappings are loaded from a project-specific key.
   */
  async syncWithProject(): Promise<void> {
    try {
      const pp = getPremiere();
      const project = await pp.Project.getActiveProject();
      const projectName = project?.name || "";
      if (projectName && projectName !== this.currentProjectName) {
        this.currentProjectName = projectName;
        this.loadMappings();
        log.info("Synced mappings with project", {
          project: projectName,
          count: this.mappings.size,
        });
      }
    } catch {
      // Not in Premiere (test env), fall back to default key
    }
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

    // Compute duration from sequence end point via markers or default to 0
    // UXP Premiere API exposes sequence.end as a TickTime when available
    let duration = 0;
    try {
      const seqEnd = (sequence as unknown as { end?: { toSeconds(): number } }).end;
      if (seqEnd && typeof seqEnd.toSeconds === "function") {
        duration = seqEnd.toSeconds();
      }
    } catch {
      // Fallback: duration remains 0 when sequence.end is unavailable
    }

    return {
      name: sequence.name,
      id: sequence.id,
      duration,
      frameRate: sequence.settings.videoFrameRate?.seconds
        ? 1 / sequence.settings.videoFrameRate.seconds
        : 29.97,
      width: sequence.settings.videoFrameWidth,
      height: sequence.settings.videoFrameHeight,
    };
  }

  /** Import files into the project under a "Kaltura Assets" bin. */
  async importFiles(filePaths: string[]): Promise<ImportResult> {
    const pp = getPremiere();
    log.info("Importing files to project", { paths: filePaths });

    try {
      const project = await pp.Project.getActiveProject();
      log.info("Active project", { name: project.name });

      // Sync mappings with the current project
      if (project.name && project.name !== this.currentProjectName) {
        this.currentProjectName = project.name;
        this.loadMappings();
      }

      // Step 1: Ensure the "Kaltura Assets" bin exists
      const rootItem = await project.getRootItem();
      let bin = this.findBinByName(rootItem, KALTURA_BIN_NAME);

      if (!bin) {
        log.info("Creating Kaltura Assets bin");
        try {
          await project.executeTransaction(async () => {
            const createAction = await rootItem.createBinAction(KALTURA_BIN_NAME);
            await createAction.execute();
          }, "Kaltura: Create Bin");
        } catch (binErr) {
          log.error("Bin creation failed, importing to root", binErr);
        }
        // Re-fetch root to get updated children
        const updatedRoot = await project.getRootItem();
        bin = this.findBinByName(updatedRoot, KALTURA_BIN_NAME);
        log.info("Bin lookup after create", { found: !!bin });
      }

      // Step 2: Import files into the project
      // Use exact same call pattern as Adobe's official sample:
      //   project.importFiles(filePaths, suppressUI, targetBin, asNumberedStills)
      // First try with bin, fall back to root if bin causes issues.
      log.info("Calling project.importFiles", {
        target: bin ? KALTURA_BIN_NAME : "root",
        count: filePaths.length,
        filePaths,
      });

      try {
        if (bin) {
          await project.importFiles(filePaths, true, bin, false);
        } else {
          // Exact Adobe sample pattern: null for targetBin
          await project.importFiles(
            filePaths,
            true, // suppressUI
            null as unknown as premierepro.ProjectItem, // import to root
            false, // asNumberedStills
          );
        }
      } catch (importErr) {
        // If import with bin fails, retry without bin (import to root)
        const errMsg = importErr instanceof Error ? importErr.message : String(importErr);
        log.warn("Import with bin failed, retrying to root", { error: errMsg });
        await project.importFiles(
          filePaths,
          true,
          null as unknown as premierepro.ProjectItem,
          false,
        );
      }
      log.info("project.importFiles completed");

      return { success: true };
    } catch (error) {
      let message: string;
      if (error instanceof Error) {
        message = error.message;
        log.error("Import failed (Error)", { message, name: error.name, stack: error.stack });
      } else if (typeof error === "string") {
        message = error;
        log.error("Import failed (string)", { message });
      } else {
        // Premiere UXP may throw non-standard error objects
        try {
          message = JSON.stringify(error) || "Unknown import error";
        } catch {
          message = String(error) || "Unknown import error";
        }
        log.error("Import failed (unknown type)", { message, type: typeof error, error });
      }
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

  private get storageKey(): string {
    if (this.currentProjectName) {
      return `${STORAGE_KEY_ASSET_MAPPINGS}_${this.currentProjectName}`;
    }
    return STORAGE_KEY_ASSET_MAPPINGS;
  }

  private loadMappings(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const entries = JSON.parse(stored) as [string, AssetMapping][];
        this.mappings = new Map(entries);
      } else {
        this.mappings = new Map();
      }
    } catch {
      this.mappings = new Map();
    }
  }

  private persistMappings(): void {
    try {
      const entries = Array.from(this.mappings.entries());
      localStorage.setItem(this.storageKey, JSON.stringify(entries));
    } catch (error) {
      log.error("Failed to persist asset mappings", error);
    }
  }
}
