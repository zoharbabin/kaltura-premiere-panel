import { SequenceInfo, ImportResult, MarkerData, TranscriptImportResult } from "../types/premiere";
import type { CaptionSegment } from "./CaptionService";
import { createLogger } from "../utils/logger";

const log = createLogger("HostService");

/** Supported Adobe host applications */
export type HostAppId = "premierepro" | "aftereffects" | "audition";

/** Host application info */
export interface HostAppInfo {
  id: HostAppId;
  name: string;
  version: string;
  supportsVideo: boolean;
  supportsAudio: boolean;
  supportsSequences: boolean;
  supportsMarkers: boolean;
}

/**
 * Abstract interface for Adobe host application interaction.
 * Each host app (Premiere, After Effects, Audition) implements this
 * to provide a unified API surface to the panel.
 */
export interface HostService {
  /** Get host application info */
  getAppInfo(): HostAppInfo;

  /** Check if the host API is available */
  isAvailable(): boolean;

  /** Get host application version */
  getVersion(): string;

  /** Get the active composition/sequence/session */
  getActiveSequence(): Promise<SequenceInfo | null>;

  /** Import a file into the project */
  importFile(filePath: string): Promise<ImportResult>;

  /** Add markers/cue points to the active composition */
  addMarkers(markers: MarkerData[]): Promise<void>;

  /** Read markers from the active sequence (not all hosts support this) */
  getMarkers?(): Promise<MarkerData[]>;

  /** Export the active sequence/composition to a file (not all hosts support this) */
  exportActiveSequence?(
    onProgress?: (percent: number) => void,
  ): Promise<{ nativePath: string; name: string; size: number }>;

  /** Check if an asset has been imported by Kaltura entry ID */
  isImported(entryId: string): boolean;

  /** Store a mapping between entry ID and local file */
  storeMapping(entryId: string, localPath: string): void;

  /** Get all stored entry-to-file mappings */
  getAllMappings(): Map<string, string>;

  /** Clear all stored mappings */
  clearMappings(): void;

  /** Sync mappings with the current project (no-op for hosts without project concept) */
  syncWithProject?(): Promise<void>;

  /** Attach transcript/caption data to an imported clip (Premiere-only) */
  importTranscript?(entryId: string, segments: CaptionSegment[]): Promise<TranscriptImportResult>;
}

/** Detect which host app we're running in */
export function detectHostApp(): HostAppId {
  try {
    require("premierepro");
    return "premierepro";
  } catch {
    // Not Premiere Pro
  }
  try {
    require("aftereffects");
    return "aftereffects";
  } catch {
    // Not After Effects
  }
  try {
    require("audition");
    return "audition";
  } catch {
    // Not Audition
  }

  log.warn("No host app detected — defaulting to premierepro");
  return "premierepro";
}

/** Get human-readable name for a host app */
export function getHostAppName(id: HostAppId): string {
  switch (id) {
    case "premierepro":
      return "Premiere Pro";
    case "aftereffects":
      return "After Effects";
    case "audition":
      return "Audition";
  }
}
