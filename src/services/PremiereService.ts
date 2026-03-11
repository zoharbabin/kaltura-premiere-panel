import {
  SequenceInfo,
  ImportResult,
  MarkerData,
  AssetMapping,
  TranscriptImportResult,
} from "../types/premiere";
import type { CaptionSegment } from "./CaptionService";
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
    path: string;
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
    getItems(): Promise<ProjectItem[]>;
    createBinAction(name: string): Promise<Action>;
  }
  class Sequence {
    guid: Guid;
    name: string;
    getMarkers(): Promise<Markers>;
    getSettings(): Promise<SequenceSettings>;
    getEndTime(): Promise<TickTime>;
    getFrameSize(): Promise<{ x: number; y: number; width: number; height: number }>;
    getTimebase(): Promise<string>;
    getVideoTrackCount(): Promise<number>;
    getAudioTrackCount(): Promise<number>;
  }
  interface Guid {
    toString(): string;
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
    static getManager(): EncoderManager;
    static getExportFileExtension(sequence: Sequence, presetFilePath: string): Promise<string>;
    static EXPORT_QUEUE_TO_AME: string;
    static EXPORT_QUEUE_TO_APP: string;
    static EXPORT_IMMEDIATELY: string;
    static EVENT_RENDER_COMPLETE: string;
    static EVENT_RENDER_ERROR: string;
    static EVENT_RENDER_CANCEL: string;
    static EVENT_RENDER_QUEUE: string;
    static EVENT_RENDER_PROGRESS: string;
    exportSequence(
      sequence: Sequence,
      exportType: typeof premierepro.Constants.ExportType.IMMEDIATELY,
      outputFile?: string,
      presetFile?: string,
      exportFull?: boolean,
    ): Promise<boolean>;
    encodeProjectItem(
      clipProjectItem: unknown,
      outputFile: string,
      presetFile: string,
      workArea?: number,
      removeUponCompletion?: boolean,
      startQueueImmediately?: boolean,
    ): Promise<boolean>;
    isAMEInstalled: boolean;
  }
  const Constants: {
    ExportType: {
      QUEUE_TO_AME: unknown;
      QUEUE_TO_APP: unknown;
      IMMEDIATELY: unknown;
    };
  };
  class EventManager {
    static addEventListener(
      target: Project | Sequence | EncoderManager,
      eventName: string,
      eventHandler: (event?: unknown) => void,
      inCapturePhase?: boolean,
    ): void;
    static removeEventListener(
      target: Project | Sequence | EncoderManager,
      eventName: string,
      eventHandler: (event?: unknown) => void,
    ): void;
  }
  class Application {
    static get version(): string;
  }
  const OperationCompleteEvent: {
    EVENT_EXPORT_MEDIA_COMPLETE: string;
    EVENT_IMPORT_MEDIA_COMPLETE: string;
  };
  interface Action {
    execute(): Promise<void>;
  }
  class ClipProjectItem implements ProjectItem {
    name: string;
    type: number;
    static cast(projectItem: ProjectItem): ClipProjectItem;
    getMediaFilePath(): string;
    getContentType(): number;
    findItemsMatchingMediaPath(matchString: string, ignoreSubclips?: boolean): ProjectItem[];
  }
  class Transcript {
    static createImportTextSegmentsAction(
      textSegments: TextSegments,
      clipProjectItem: ClipProjectItem,
    ): Promise<Action>;
    static exportToJSON(clipProjectItem: ClipProjectItem): string;
    static importFromJSON(jsonString: string): TextSegments;
  }
  class TextSegments {}
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

    // Get duration from sequence end time
    let duration = 0;
    try {
      const endTime = await sequence.getEndTime();
      if (endTime && typeof endTime.toSeconds === "function") {
        duration = endTime.toSeconds();
      }
    } catch {
      // Fallback: duration remains 0 when getEndTime is unavailable
    }

    // Get settings — use async getSettings() per official API
    let frameRate = 29.97;
    let width = 1920;
    let height = 1080;
    try {
      const settings = await sequence.getSettings();
      if (settings.videoFrameRate?.seconds) {
        frameRate = 1 / settings.videoFrameRate.seconds;
      }
      width = settings.videoFrameWidth || width;
      height = settings.videoFrameHeight || height;
    } catch {
      // Use defaults
    }

    return {
      name: sequence.name,
      id: sequence.guid?.toString() || "",
      duration,
      frameRate,
      width,
      height,
    };
  }

  /** Import files into the project under a "Kaltura Assets" bin. */
  async importFiles(filePaths: string[]): Promise<ImportResult> {
    const pp = getPremiere();
    log.info("Importing files to project", { paths: filePaths });

    // Validate filePaths before calling the Premiere API — passing undefined or
    // non-string values causes the C++ bridge to throw "Illegal Parameter type".
    for (let i = 0; i < filePaths.length; i++) {
      const p = filePaths[i];
      if (!p || typeof p !== "string") {
        const msg = `Invalid file path at index ${i}: type=${typeof p}, value=${String(p)}`;
        log.error(msg);
        return { success: false, error: msg };
      }
    }

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
      let bin = await this.findBinByName(rootItem, KALTURA_BIN_NAME);

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
        bin = await this.findBinByName(updatedRoot, KALTURA_BIN_NAME);
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
        filePathTypes: filePaths.map((p) => typeof p),
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
        // Try with fewer params — some UXP versions may not accept all 4 params
        try {
          await project.importFiles(
            filePaths,
            true,
            null as unknown as premierepro.ProjectItem,
            false,
          );
        } catch (retryErr) {
          // Final fallback: minimal call with only filePaths (matches simplest API usage)
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          log.warn("Retry to root also failed, trying minimal importFiles call", {
            error: retryMsg,
          });
          await project.importFiles(filePaths);
        }
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

  /**
   * Attach transcript/caption data to an imported video clip via the Transcript API.
   * This makes the captions appear in Premiere's native Transcript panel.
   *
   * Requires Premiere Pro 25.0+ and that the video has been imported first
   * (so we have an AssetMapping with the local file path).
   */
  async importTranscriptToClip(
    entryId: string,
    segments: CaptionSegment[],
  ): Promise<TranscriptImportResult> {
    console.error("[DEBUG] importTranscriptToClip called", entryId, "segments:", segments.length);
    const pp = getPremiere();
    const mapping = this.getMapping(entryId);
    console.error("[DEBUG] mapping", mapping ? JSON.stringify(mapping) : "null");
    if (!mapping) {
      return { success: false, error: "Video not imported — import the video first" };
    }

    try {
      const project = await pp.Project.getActiveProject();
      const rootItem = await project.getRootItem();
      const projectItem = await this.findItemByPath(rootItem, mapping.localPath);
      console.error("[DEBUG] projectItem found?", !!projectItem);

      if (!projectItem) {
        return {
          success: false,
          error: "Could not find the video clip in the project. Try re-importing it.",
        };
      }

      const clipItem = pp.ClipProjectItem.cast(projectItem);
      console.error("[DEBUG] clipItem cast done", !!clipItem);

      const textSegmentsJson = JSON.stringify(
        segments.map((s) => ({
          startTimeInMicroseconds: Math.round(s.startTime * 1_000_000),
          endTimeInMicroseconds: Math.round(s.endTime * 1_000_000),
          text: s.text,
        })),
      );
      console.error(
        "[DEBUG] textSegmentsJson length",
        textSegmentsJson.length,
        "preview:",
        textSegmentsJson.substring(0, 200),
      );

      const textSegments = pp.Transcript.importFromJSON(textSegmentsJson);
      console.error("[DEBUG] importFromJSON done", !!textSegments);
      const action = await pp.Transcript.createImportTextSegmentsAction(textSegments, clipItem);
      console.error("[DEBUG] createImportTextSegmentsAction done", !!action);

      await project.executeTransaction(async () => {
        await action.execute();
      }, "Kaltura: Import Transcript");

      console.error("[DEBUG] Transcript attached successfully");
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        "[DEBUG] importTranscriptToClip FAILED",
        msg,
        error instanceof Error ? error.stack : "",
      );
      return { success: false, error: msg };
    }
  }

  /**
   * Export the active sequence to a file via EncoderManager.
   *
   * Based on Adobe's official sample (AdobeDocs/uxp-premiere-pro-samples):
   *   encoder.exportSequence(sequence, ppro.Constants.ExportType.IMMEDIATELY, exportPath, presetFile)
   *
   * Key requirements:
   * - Must use ppro.Constants.ExportType.IMMEDIATELY (runtime constant from module)
   * - A preset file (.epr) is REQUIRED for the API to produce output
   * - getManager() should be awaited
   */
  async exportActiveSequence(
    onProgress?: (percent: number) => void,
  ): Promise<{ nativePath: string; name: string; size: number }> {
    const pp = getPremiere();
    const project = await pp.Project.getActiveProject();
    const sequence = await project.getActiveSequence();
    if (!sequence) {
      throw new PremiereApiError("No active sequence to export");
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");

    // Find an export preset — required for exportSequence to work
    const presetFile = await this.findExportPreset();
    if (!presetFile) {
      throw new PremiereApiError(
        "No export preset found. Please ensure Adobe Premiere Pro is installed with default presets.",
      );
    }
    log.info("Using export preset", { presetFile });

    // Determine correct file extension from the preset
    let fileExtension = "mp4";
    try {
      const ext = await pp.EncoderManager.getExportFileExtension(sequence, presetFile);
      if (ext && typeof ext === "string") {
        fileExtension = ext.replace(/^\./, ""); // strip leading dot if present
        log.info("Preset file extension", { ext, fileExtension });
      }
    } catch (e) {
      log.warn("Could not determine file extension from preset, defaulting to mp4", {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // Use the project folder as the export destination
    const safeName = sequence.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const fileName = `${safeName}_${Date.now()}.${fileExtension}`;
    const projectPath = project.path || "";
    const projectDir = projectPath.replace(/[/\\][^/\\]+$/, ""); // strip filename
    const outputPath = projectDir ? `${projectDir}/${fileName}` : `/tmp/${fileName}`;

    log.info("Exporting sequence", {
      name: sequence.name,
      projectPath,
      output: outputPath,
      preset: presetFile,
    });

    onProgress?.(5);

    // Get encoder manager (await per Adobe sample)
    const encoder = await pp.EncoderManager.getManager();

    // Set up event-based completion tracking.
    // We listen on MULTIPLE event sources because IMMEDIATELY mode may use
    // different events than AME-based encoding:
    //   1. EncoderManager events (EVENT_RENDER_COMPLETE etc.) — for AME
    //   2. OperationCompleteEvent.EVENT_EXPORT_MEDIA_COMPLETE — for direct export
    let exportDone = false;
    let exportError: string | null = null;
    const eventCleanups: (() => void)[] = [];

    const markDone = (source: string) => {
      if (!exportDone) {
        log.info(`Export complete signal from: ${source}`);
        exportDone = true;
      }
    };
    const markError = (source: string, msg: string) => {
      log.error(`Export error from: ${source}`, { msg });
      exportError = msg;
    };

    // Encoder events (for AME-based rendering)
    const onRenderComplete = () => markDone("EVENT_RENDER_COMPLETE");
    const onRenderError = (event?: unknown) => {
      const msg =
        event && typeof event === "object" && "message" in event
          ? String((event as { message: unknown }).message)
          : "Render error";
      markError("EVENT_RENDER_ERROR", msg);
    };
    const onRenderProgress = (event?: unknown) => {
      if (event && typeof event === "object" && "progress" in event) {
        const pct = Number((event as { progress: unknown }).progress);
        if (!isNaN(pct)) {
          onProgress?.(Math.min(10 + Math.round(pct * 85), 95));
        }
      }
    };

    try {
      pp.EventManager.addEventListener(
        encoder,
        pp.EncoderManager.EVENT_RENDER_COMPLETE,
        onRenderComplete,
      );
      pp.EventManager.addEventListener(
        encoder,
        pp.EncoderManager.EVENT_RENDER_ERROR,
        onRenderError,
      );
      pp.EventManager.addEventListener(
        encoder,
        pp.EncoderManager.EVENT_RENDER_PROGRESS,
        onRenderProgress,
      );
      eventCleanups.push(() => {
        pp.EventManager.removeEventListener(
          encoder,
          pp.EncoderManager.EVENT_RENDER_COMPLETE,
          onRenderComplete,
        );
        pp.EventManager.removeEventListener(
          encoder,
          pp.EncoderManager.EVENT_RENDER_ERROR,
          onRenderError,
        );
        pp.EventManager.removeEventListener(
          encoder,
          pp.EncoderManager.EVENT_RENDER_PROGRESS,
          onRenderProgress,
        );
      });
      log.info("Attached EncoderManager events");
    } catch (e) {
      log.warn("Could not attach EncoderManager events", {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // OperationCompleteEvent — project-level event for IMMEDIATELY mode
    const onExportMediaComplete = (event?: unknown) => {
      log.info("EVENT_EXPORT_MEDIA_COMPLETE received", { event });
      // Check state: 0 = SUCCESS per OperationCompleteState enum
      if (event && typeof event === "object" && "state" in event) {
        const state = (event as { state: number }).state;
        if (state === 0) {
          markDone("EVENT_EXPORT_MEDIA_COMPLETE (SUCCESS)");
        } else {
          markError("EVENT_EXPORT_MEDIA_COMPLETE", `Export ended with state=${state}`);
        }
      } else {
        markDone("EVENT_EXPORT_MEDIA_COMPLETE");
      }
    };
    try {
      // OperationCompleteEvent is on the project level
      const opEvent = pp.OperationCompleteEvent;
      if (opEvent && opEvent.EVENT_EXPORT_MEDIA_COMPLETE) {
        pp.EventManager.addEventListener(
          project as unknown as premierepro.Project,
          opEvent.EVENT_EXPORT_MEDIA_COMPLETE,
          onExportMediaComplete,
        );
        eventCleanups.push(() => {
          pp.EventManager.removeEventListener(
            project as unknown as premierepro.Project,
            opEvent.EVENT_EXPORT_MEDIA_COMPLETE,
            onExportMediaComplete,
          );
        });
        log.info("Attached OperationCompleteEvent.EVENT_EXPORT_MEDIA_COMPLETE");
      } else {
        log.warn("OperationCompleteEvent.EVENT_EXPORT_MEDIA_COMPLETE not available");
      }
    } catch (e) {
      log.warn("Could not attach OperationCompleteEvent", {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // Start the export using the correct API pattern from Adobe's sample
    try {
      const result = await encoder.exportSequence(
        sequence,
        pp.Constants.ExportType.IMMEDIATELY,
        outputPath,
        presetFile,
        true, // exportFull — export entire sequence
      );
      log.info("exportSequence returned", { result });
      if (result === false) {
        throw new PremiereApiError("exportSequence returned false — export was rejected");
      }
    } catch (e) {
      eventCleanups.forEach((fn) => {
        try {
          fn();
        } catch {
          /* */
        }
      });
      const msg = e instanceof Error ? e.message : String(e);
      throw new PremiereApiError(`Failed to start export: ${msg}`);
    }

    onProgress?.(10);

    // Wait for export to complete.
    //
    // Premiere IMMEDIATELY mode creates the output file at the specified path
    // early (container headers), then encodes into it. The file may appear
    // "stable" briefly during encoder initialization. We MUST wait for an
    // event signal OR use very conservative file-based detection.
    //
    // Detection priority:
    //   1. EVENT_EXPORT_MEDIA_COMPLETE or EVENT_RENDER_COMPLETE (authoritative)
    //   2. File stable for 30s AND file grew since first seen (conservative fallback)
    log.info("Waiting for export to complete...", { pollingPath: outputPath });

    const POLL_INTERVAL_MS = 3000;
    const FILE_STABLE_FOR_DONE_MS = 30_000; // 30s stability = done (file-only fallback)
    let lastSize = -1;
    let maxSizeSeen = 0;
    let stableSince = 0;
    let pollCount = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      pollCount++;

      // Check event signals
      if (exportError) {
        eventCleanups.forEach((fn) => {
          try {
            fn();
          } catch {
            /* */
          }
        });
        throw new PremiereApiError(`Export failed: ${exportError}`);
      }

      let currentSize = -1;
      try {
        const stats = await fs.lstat(outputPath);
        if (stats.isFile()) currentSize = stats.size;
      } catch {
        // File doesn't exist yet
      }

      if (currentSize > maxSizeSeen) maxSizeSeen = currentSize;

      if (currentSize !== lastSize) {
        stableSince = 0;
        if (currentSize > 0) {
          log.debug("Export file size", {
            sizeMB: `${(currentSize / (1024 * 1024)).toFixed(1)} MB`,
            poll: pollCount,
          });
        }
        lastSize = currentSize;
      } else if (currentSize > 0 && stableSince === 0) {
        stableSince = Date.now();
      }

      // DONE via event — most reliable
      if (exportDone && currentSize > 0) {
        log.info("Export confirmed done via event", {
          size: currentSize,
          sizeMB: `${(currentSize / (1024 * 1024)).toFixed(1)} MB`,
        });
        break;
      }

      // DONE via event, file may be at a different path or just appeared
      if (exportDone && pollCount > 3) {
        // Event fired but file might not be at expected path — accept anyway
        log.info("Export event received, accepting (file may be elsewhere)", {
          currentSize,
        });
        break;
      }

      // FALLBACK: No events fired, but file has been stable for 30s
      // AND file is larger than initial headers (grew at some point)
      const grewBeyondHeaders = maxSizeSeen > 100_000; // > 100KB means real content
      if (
        currentSize > 0 &&
        grewBeyondHeaders &&
        stableSince > 0 &&
        Date.now() - stableSince >= FILE_STABLE_FOR_DONE_MS
      ) {
        log.info("Export file complete (stable 30s + has content, no event)", {
          size: currentSize,
          sizeMB: `${(currentSize / (1024 * 1024)).toFixed(1)} MB`,
        });
        break;
      }

      // No absolute timeout — large projects can take hours.
      // Only give up if nothing at all is happening (no file changes, no events)
      // for an extended idle period. Events also reset the idle timer (below).

      // Progress reporting
      if (pollCount % 4 === 0) {
        const elapsed = (pollCount * POLL_INTERVAL_MS) / 1000;
        const pct =
          currentSize > 100_000
            ? Math.min(10 + Math.round(85 * (1 - 1 / (1 + elapsed / 60))), 90)
            : Math.min(10 + Math.round(pollCount / 2), 30);
        onProgress?.(pct);
      }
    }

    // Clean up all event listeners
    eventCleanups.forEach((fn) => {
      try {
        fn();
      } catch {
        /* */
      }
    });

    // Read final file stats
    const finalStats = await fs.lstat(outputPath);
    log.info("Export complete", {
      path: outputPath,
      size: finalStats.size,
      sizeMB: `${(finalStats.size / (1024 * 1024)).toFixed(1)} MB`,
    });
    onProgress?.(100);
    return { nativePath: outputPath, name: fileName, size: finalStats.size };
  }

  /**
   * Find a usable export preset (.epr file).
   * Searches standard Premiere Pro preset locations on macOS and Windows.
   * Prefers H.264 "Match Source" presets but will accept any .epr.
   */
  private async findExportPreset(): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");

    // Standard preset search paths (macOS and Windows)
    const searchPaths = [
      // macOS Premiere Pro 2026
      "/Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app/Contents/MediaIO/systempresets",
      // macOS Premiere Pro 2025
      "/Applications/Adobe Premiere Pro 2025/Adobe Premiere Pro 2025.app/Contents/MediaIO/systempresets",
      // macOS Premiere Pro (generic/beta)
      "/Applications/Adobe Premiere Pro/Adobe Premiere Pro.app/Contents/MediaIO/systempresets",
      "/Applications/Adobe Premiere Pro (Beta)/Adobe Premiere Pro (Beta).app/Contents/MediaIO/systempresets",
      // Windows Premiere Pro 2025/2026
      "C:\\Program Files\\Adobe\\Adobe Premiere Pro 2026\\MediaIO\\systempresets",
      "C:\\Program Files\\Adobe\\Adobe Premiere Pro 2025\\MediaIO\\systempresets",
      "C:\\Program Files\\Adobe\\Adobe Premiere Pro\\MediaIO\\systempresets",
    ];

    let fallbackPreset: string | null = null;

    for (const basePath of searchPaths) {
      try {
        const stat = await fs.lstat(basePath);
        if (stat.isDirectory()) {
          const result = await this.findPresetInDir(basePath, fs);
          if (result.preferred) {
            log.info("Found preferred export preset", { path: result.preferred });
            return result.preferred;
          }
          if (result.fallback && !fallbackPreset) {
            fallbackPreset = result.fallback;
          }
        }
      } catch {
        // Path doesn't exist, try next
      }
    }

    if (fallbackPreset) {
      log.info("Using fallback export preset", { path: fallbackPreset });
      return fallbackPreset;
    }

    log.warn("No system export preset found");
    return "";
  }

  private async findPresetInDir(
    dirPath: string,
    fs: {
      readdir: (path: string) => Promise<string[]>;
      lstat: (path: string) => Promise<{ isDirectory(): boolean; isFile(): boolean }>;
    },
  ): Promise<{ preferred: string | null; fallback: string | null }> {
    let preferred: string | null = null;
    let fallback: string | null = null;

    try {
      const entries = await fs.readdir(dirPath);
      for (const entry of entries) {
        const fullPath = `${dirPath}/${entry}`;
        const stat = await fs.lstat(fullPath);
        const lower = entry.toLowerCase();

        if (stat.isFile() && lower.endsWith(".epr")) {
          // Prefer "Match Source" H.264 presets
          if (
            lower.includes("match source") &&
            (lower.includes("h.264") || lower.includes("h264"))
          ) {
            preferred = fullPath;
            return { preferred, fallback };
          }
          // Accept any H.264 preset as secondary preference
          if (!fallback && (lower.includes("h.264") || lower.includes("h264"))) {
            fallback = fullPath;
          }
          // Accept any .epr as last resort
          if (!fallback) {
            fallback = fullPath;
          }
        }

        if (stat.isDirectory()) {
          const sub = await this.findPresetInDir(fullPath, fs);
          if (sub.preferred) return sub;
          if (sub.fallback && !fallback) fallback = sub.fallback;
        }
      }
    } catch {
      // Can't read directory
    }
    return { preferred, fallback };
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

  private async findBinByName(
    parent: premierepro.FolderItem,
    name: string,
  ): Promise<premierepro.FolderItem | null> {
    const children = await parent.getItems();
    if (!children) return null;
    for (const child of children) {
      if (child.name === name && child.type === 2) {
        return child as unknown as premierepro.FolderItem;
      }
    }
    return null;
  }

  /** Find a clip project item by its local media file path (recursive bin search) */
  private async findItemByPath(
    parent: premierepro.FolderItem,
    localPath: string,
  ): Promise<premierepro.ProjectItem | null> {
    const children = await parent.getItems();
    console.error("[DEBUG] findItemByPath", parent.name, "children:", children?.length);
    if (!children) return null;

    const pp = getPremiere();
    const targetFileName = localPath.split("/").pop() || "";

    for (const child of children) {
      console.error("[DEBUG] child type:", child.type, "name:", child.name);

      // type 1 = clip
      if (child.type === 1) {
        try {
          const clip = pp.ClipProjectItem.cast(child);
          const clipPath = clip.getMediaFilePath();
          console.error("[DEBUG] clip path:", clipPath);
          if (clipPath === localPath) return child;
          // Fallback: match by filename
          if (clipPath && clipPath.split("/").pop() === targetFileName) return child;
        } catch (err) {
          console.error("[DEBUG] cast error", String(err));
        }
      }
      // type 2 = bin — recurse
      if (child.type === 2) {
        const found = await this.findItemByPath(
          child as unknown as premierepro.FolderItem,
          localPath,
        );
        if (found) return found;
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
