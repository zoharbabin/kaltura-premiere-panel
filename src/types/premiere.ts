/** Premiere Pro marker colors */
export enum MarkerColor {
  GREEN = 0,
  RED = 1,
  PURPLE = 2,
  ORANGE = 3,
  YELLOW = 4,
  WHITE = 5,
  BLUE = 6,
  CYAN = 7,
}

/** Marker data for creation */
export interface MarkerData {
  start: number;
  name: string;
  comments: string;
  colorIndex: MarkerColor;
  duration?: number;
  type?: string;
}

/** Project item type */
export enum ProjectItemType {
  CLIP = 1,
  BIN = 2,
  ROOT = 3,
  FILE = 4,
}

/** Import result */
export interface ImportResult {
  success: boolean;
  projectItemId?: string;
  error?: string;
}

/** Export options */
export interface ExportOptions {
  outputPath: string;
  presetPath?: string;
}

/** Export progress event */
export interface ExportProgress {
  progress: number;
  phase: "exporting" | "uploading" | "processing" | "complete" | "error";
  message?: string;
}

/** Sequence info */
export interface SequenceInfo {
  name: string;
  id: string;
  duration: number;
  frameRate: number;
  width: number;
  height: number;
}

/** Asset mapping — tracks imported Kaltura assets in the local project */
export interface AssetMapping {
  entryId: string;
  flavorId: string;
  localPath: string;
  importDate: number;
  isProxy: boolean;
  originalPath?: string;
}
