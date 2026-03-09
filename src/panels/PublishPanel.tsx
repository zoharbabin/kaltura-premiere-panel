import React, { useState, useCallback, useEffect } from "react";
import { KalturaMediaEntry, KalturaMediaType, KalturaCategory } from "../types/kaltura";
import { ExportProgress } from "../types/premiere";
import { MediaService, UploadService, MetadataService } from "../services";
import { ProgressBar, ErrorBanner } from "../components";
import { getUserMessage } from "../utils/errors";
import { createLogger } from "../utils/logger";

const log = createLogger("PublishPanel");

/** Duck-typed PublishWorkflowService for multi-destination, approval, and scheduling */
interface PublishWorkflowServiceLike {
  publishToCategories(
    entryId: string,
    categoryIds: number[],
  ): Promise<{ successful: number[]; failed: { categoryId: number; error: string }[] }>;
  schedulePublish(entryId: string, startDate: number, endDate?: number): Promise<unknown>;
  submitForApproval(entryId: string): Promise<unknown>;
}

/** Duck-typed AuditService for access control profiles */
interface AuditServiceLike {
  listAccessControlProfiles(): Promise<
    { id: number; name: string; description?: string; isDefault: boolean }[]
  >;
  logAction(action: string, entryId?: string, details?: string): void;
}

/** Minimal host interface needed by PublishPanel */
interface HostServiceLike {
  isAvailable(): boolean;
  getActiveSequence(): Promise<{ name: string } | null>;
  exportActiveSequence?(
    onProgress?: (percent: number) => void,
  ): Promise<{ nativePath: string; name: string; size: number }>;
}

interface PublishPanelProps {
  mediaService: MediaService;
  uploadService: UploadService;
  metadataService: MetadataService;
  premiereService: HostServiceLike;
  publishWorkflowService?: PublishWorkflowServiceLike;
  auditService?: AuditServiceLike;
  onPublished: (entry: KalturaMediaEntry) => void;
}

type PublishPhase = "form" | "exporting" | "uploading" | "processing" | "complete" | "error";
type PublishMode = "new" | "update";
type SourceMode = "sequence" | "file";
interface FileInfo {
  nativePath: string;
  name: string;
  size: number;
}

/** Read a file from disk using UXP fs module and return its contents as ArrayBuffer */
async function readFileAsArrayBuffer(nativePath: string): Promise<ArrayBuffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");
  // UXP fs.readFile without encoding returns ArrayBuffer (binary).
  const data = await fs.readFile(nativePath);
  if (data instanceof ArrayBuffer) return data;
  if (data instanceof Uint8Array)
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  throw new Error(`Unexpected readFile result type: ${typeof data}`);
}

/** Open a file picker and return the selected file's native path and name */
async function pickFile(): Promise<FileInfo | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const uxp = require("uxp");
    const lfs = uxp.storage.localFileSystem;
    const file = await lfs.getFileForOpening({
      types: ["mp4", "mov", "mxf", "avi", "mkv", "wav", "mp3", "aac", "m4a", "m4v", "webm"],
    });
    if (!file) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeFs = require("fs");
    const stats = await nodeFs.lstat(file.nativePath);
    return { nativePath: file.nativePath, name: file.name, size: stats.size };
  } catch (err) {
    log.error("File picker failed", err);
    return null;
  }
}

export const PublishPanel: React.FC<PublishPanelProps> = ({
  mediaService,
  uploadService,
  metadataService,
  premiereService,
  publishWorkflowService,
  auditService,
  onPublished,
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [categories, setCategories] = useState<KalturaCategory[]>([]);
  const [scheduledDate, setScheduledDate] = useState("");
  const [accessControlProfiles, setAccessControlProfiles] = useState<
    { id: number; name: string; isDefault: boolean }[]
  >([]);
  const [selectedAccessControlId, setSelectedAccessControlId] = useState<number | null>(null);
  const [publishMode, setPublishMode] = useState<PublishMode>("new");
  const [existingEntryId, setExistingEntryId] = useState("");
  const [phase, setPhase] = useState<PublishPhase>("form");
  const [progress, setProgress] = useState<ExportProgress>({
    progress: 0,
    phase: "exporting",
  });
  const [error, setError] = useState<string | null>(null);
  const [publishedEntry, setPublishedEntry] = useState<KalturaMediaEntry | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>("file");
  const [sequenceName, setSequenceName] = useState("");
  const canExportSequence = !!premiereService.exportActiveSequence;

  // Detect active sequence name and pre-fill title
  useEffect(() => {
    if (!premiereService.isAvailable()) return;
    premiereService
      .getActiveSequence()
      .then((seq) => {
        if (seq && seq.name) {
          setSequenceName(seq.name);
          log.info("Active sequence detected", { name: seq.name });
          if (!title) setTitle(seq.name);
          // Auto-select sequence mode if export is available
          if (canExportSequence) setSourceMode("sequence");
        }
      })
      .catch(() => {});
  }, [premiereService, canExportSequence, title]);

  // Load categories on mount
  useEffect(() => {
    metadataService
      .listCategories()
      .then(setCategories)
      .catch((err) => {
        log.debug("Failed to load categories", err);
        setCategories([]);
      });
  }, [metadataService]);

  // Load access control profiles
  useEffect(() => {
    if (!auditService) return;
    auditService
      .listAccessControlProfiles()
      .then((profiles) => {
        setAccessControlProfiles(profiles);
        const defaultProfile = profiles.find((p) => p.isDefault);
        if (defaultProfile) setSelectedAccessControlId(defaultProfile.id);
      })
      .catch((err) => {
        log.debug("Failed to load access control profiles", err);
        setAccessControlProfiles([]);
      });
  }, [auditService]);

  // Pre-fill title from selected file name
  useEffect(() => {
    if (sourceMode === "file" && selectedFile && !title) {
      setTitle(selectedFile.name.replace(/\.[^.]+$/, ""));
    }
  }, [sourceMode, selectedFile, title]);

  const handleSelectFile = useCallback(async () => {
    const file = await pickFile();
    if (file) {
      setSelectedFile(file);
      log.info("File selected", { name: file.name, size: file.size, path: file.nativePath });
    }
  }, []);

  /**
   * Core publish flow:
   * 1. Get file (export sequence or use selected file)
   * 2. Read file into ArrayBuffer
   * 3. Create upload token with file metadata
   * 4. Upload in chunks with progress
   * 5. Create entry via media.addFromUploadedFile
   * 6. Assign categories, schedule, etc.
   */
  const handlePublish = useCallback(async () => {
    if (!title.trim()) return;
    setError(null);

    try {
      if (publishMode === "new") {
        let fileInfo: FileInfo;

        // Step 1: Get the file — either export current sequence or use selected file
        if (sourceMode === "sequence") {
          if (!premiereService.exportActiveSequence) {
            throw new Error("Sequence export is not available in this host application");
          }
          setPhase("exporting");
          setProgress({ progress: 0, phase: "exporting", message: "Exporting sequence..." });
          log.info("Exporting active sequence for publish");

          fileInfo = await premiereService.exportActiveSequence((percent) => {
            setProgress({
              progress: Math.round(percent * 0.3), // 0-30% for export
              phase: "exporting",
              message: `Exporting... ${percent}%`,
            });
          });

          log.info("Sequence exported", {
            path: fileInfo.nativePath,
            size: fileInfo.size,
          });
        } else {
          if (!selectedFile) {
            setError("Please select a file to upload.");
            return;
          }
          fileInfo = selectedFile;
        }

        // Step 2: Read the file
        setPhase("exporting");
        setProgress({
          progress: sourceMode === "sequence" ? 30 : 0,
          phase: "exporting",
          message: "Reading file...",
        });

        const fileData = await readFileAsArrayBuffer(fileInfo.nativePath);
        log.info("File read complete", { byteLength: fileData.byteLength });

        if (fileData.byteLength === 0) {
          throw new Error(`File is empty (0 bytes): ${fileInfo.name}`);
        }

        // Step 3: Create upload token with file metadata (per Kaltura best practices)
        setPhase("uploading");
        setProgress({ progress: 35, phase: "uploading", message: "Creating upload token..." });

        const token = await uploadService.createToken(fileInfo.name, fileInfo.size);
        log.info("Upload token created", { tokenId: token.id });

        // Step 4: Upload file in chunks with progress
        setProgress({ progress: 38, phase: "uploading", message: "Uploading..." });

        await uploadService.uploadFile(token.id, fileData, (p) => {
          // Map upload progress to 38-85% range
          const mappedProgress = 38 + Math.round(p.percent * 0.47);
          setProgress({
            progress: mappedProgress,
            phase: "uploading",
            message: `Uploading... ${p.percent}%`,
          });
        });

        log.info("File upload complete", { tokenId: token.id });

        // Step 5: Create entry from uploaded file (single API call per Kaltura best practices)
        setPhase("processing");
        setProgress({ progress: 88, phase: "processing", message: "Creating entry..." });

        const entryData: Partial<KalturaMediaEntry> = {
          name: title.trim(),
          description: description.trim(),
          tags: tags.trim(),
          mediaType: KalturaMediaType.VIDEO,
        };
        if (selectedCategoryIds.length === 1) {
          entryData.categoriesIds = String(selectedCategoryIds[0]);
        }
        if (selectedAccessControlId) {
          entryData.accessControlId = selectedAccessControlId;
        }

        const entry = await mediaService.addFromUploadedFile(entryData, token.id);
        log.info("Entry created with content", { entryId: entry.id, name: entry.name });

        // Step 6: Multi-category assignment
        if (publishWorkflowService && selectedCategoryIds.length > 1) {
          setProgress({ progress: 92, phase: "processing", message: "Assigning categories..." });
          await publishWorkflowService.publishToCategories(entry.id, selectedCategoryIds);
        }

        // Step 7: Schedule if a date is set
        if (publishWorkflowService && scheduledDate) {
          setProgress({ progress: 96, phase: "processing", message: "Scheduling publish..." });
          const startDate = Math.floor(new Date(scheduledDate).getTime() / 1000);
          await publishWorkflowService.schedulePublish(entry.id, startDate);
        }

        setPhase("complete");
        setProgress({ progress: 100, phase: "complete", message: "Published!" });
        setPublishedEntry(entry);
        auditService?.logAction("publish", entry.id, `New entry: ${entry.name}`);
      } else {
        // Update existing entry — replace its content
        let fileInfo: FileInfo;

        // Step 1: Get the file
        if (sourceMode === "sequence") {
          if (!premiereService.exportActiveSequence) {
            throw new Error("Sequence export is not available in this host application");
          }
          setPhase("exporting");
          setProgress({ progress: 0, phase: "exporting", message: "Exporting sequence..." });

          fileInfo = await premiereService.exportActiveSequence((percent) => {
            setProgress({
              progress: Math.round(percent * 0.3),
              phase: "exporting",
              message: `Exporting... ${percent}%`,
            });
          });
        } else {
          if (!selectedFile) {
            setError("Please select a file to upload.");
            return;
          }
          fileInfo = selectedFile;
        }

        // Step 2: Read the file
        setPhase("exporting");
        setProgress({ progress: 30, phase: "exporting", message: "Reading file..." });
        const fileData = await readFileAsArrayBuffer(fileInfo.nativePath);

        if (fileData.byteLength === 0) {
          throw new Error(`File is empty (0 bytes): ${fileInfo.name}`);
        }

        // Step 3: Upload
        setPhase("uploading");
        setProgress({ progress: 35, phase: "uploading", message: "Creating upload token..." });
        const token = await uploadService.createToken(fileInfo.name, fileInfo.size);

        setProgress({ progress: 38, phase: "uploading", message: "Uploading..." });
        await uploadService.uploadFile(token.id, fileData, (p) => {
          const mappedProgress = 38 + Math.round(p.percent * 0.42);
          setProgress({
            progress: mappedProgress,
            phase: "uploading",
            message: `Uploading... ${p.percent}%`,
          });
        });

        // Step 4: Replace content on the existing entry
        setPhase("processing");
        setProgress({ progress: 82, phase: "processing", message: "Replacing content..." });
        await mediaService.updateContent(existingEntryId, token.id);
        log.info("Content replaced on existing entry", { entryId: existingEntryId });

        // Step 5: Update metadata if changed
        setProgress({ progress: 90, phase: "processing", message: "Updating metadata..." });
        const updated = await mediaService.update(existingEntryId, {
          name: title.trim(),
          description: description.trim(),
          tags: tags.trim(),
        });

        setPhase("complete");
        setProgress({ progress: 100, phase: "complete", message: "Entry updated!" });
        setPublishedEntry(updated);
        log.info("Update complete", { entryId: updated.id });
        auditService?.logAction("update_metadata", updated.id, `Updated: ${updated.name}`);
      }
    } catch (err) {
      setPhase("error");
      setError(getUserMessage(err));
      log.error("Publish failed", err);
    }
  }, [
    title,
    description,
    tags,
    selectedCategoryIds,
    selectedAccessControlId,
    scheduledDate,
    publishMode,
    existingEntryId,
    sourceMode,
    selectedFile,
    premiereService,
    mediaService,
    uploadService,
    publishWorkflowService,
    auditService,
    onPublished,
  ]);

  const handleReset = useCallback(() => {
    setPhase("form");
    setProgress({ progress: 0, phase: "exporting" });
    setError(null);
    setPublishedEntry(null);
    setTitle("");
    setDescription("");
    setTags("");
    setSelectedCategoryIds([]);
    setScheduledDate("");
    setExistingEntryId("");
    setSelectedFile(null);
  }, []);

  const handleViewInKaltura = useCallback(() => {
    if (!publishedEntry) return;
    const url = `${mediaService["client"]["serviceUrl"]}/index.php/kmcng/content/entries/entry/${publishedEntry.id}`;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const uxp = require("uxp");
      uxp.shell.openExternal(url);
    } catch (err) {
      log.debug("uxp.shell.openExternal unavailable, falling back to window.open", err);
      window.open(url, "_blank");
    }
  }, [publishedEntry, mediaService]);

  // Determine if the Publish button should be enabled
  const hasSource = sourceMode === "sequence" || !!selectedFile;
  const canPublish =
    !!title.trim() && hasSource && (publishMode === "update" ? !!existingEntryId.trim() : true);

  // Success view
  if (phase === "complete" && publishedEntry) {
    return (
      <div className="login-container">
        <div className="success-circle">{"\u2713"}</div>
        <sp-heading size="S">{publishMode === "new" ? "Published!" : "Updated!"}</sp-heading>
        <sp-body size="S" style={{ textAlign: "center" }}>
          &quot;{publishedEntry.name}&quot; has been{" "}
          {publishMode === "new" ? "created in" : "updated on"} Kaltura.
        </sp-body>
        <sp-detail size="S" className="text-muted">
          Entry ID: {publishedEntry.id}
        </sp-detail>
        <div className="flex-row gap-8">
          <sp-button variant="secondary" onClick={handleViewInKaltura}>
            View in Kaltura
          </sp-button>
          <sp-button variant="primary" onClick={handleReset}>
            Publish Another
          </sp-button>
          <sp-button variant="secondary" onClick={() => onPublished(publishedEntry!)}>
            Back to Browse
          </sp-button>
        </div>
      </div>
    );
  }

  // Progress view
  if (phase !== "form" && phase !== "error") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "24px",
          gap: "24px",
        }}
      >
        <sp-heading size="S">
          {phase === "exporting"
            ? "Exporting Sequence..."
            : phase === "uploading"
              ? "Uploading to Kaltura..."
              : phase === "processing"
                ? "Processing..."
                : "Publishing..."}
        </sp-heading>
        <div style={{ width: "100%", maxWidth: "320px" }}>
          <ProgressBar value={progress.progress} />
        </div>
      </div>
    );
  }

  // Form view
  return (
    <div className="panel-root panel-padding">
      <sp-heading size="XS" style={{ padding: "8px 0" }}>
        Publish to Kaltura
      </sp-heading>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="flex-col gap-12" style={{ flex: 1, overflowY: "auto" }}>
        {/* Publish mode */}
        <div>
          <sp-detail size="S">Publish Mode</sp-detail>
          <select
            value={publishMode}
            onChange={(e) => setPublishMode(e.target.value as PublishMode)}
            style={{ width: "100%", padding: "6px 8px", fontSize: "13px" }}
          >
            <option value="new">New Entry</option>
            <option value="update">Update Existing</option>
          </select>
        </div>

        {publishMode === "update" && (
          <div>
            <sp-detail size="S">Entry ID</sp-detail>
            <sp-textfield
              placeholder="Kaltura Entry ID (e.g. 0_abc123)"
              value={existingEntryId}
              onInput={(e: Event) => setExistingEntryId((e.target as HTMLInputElement).value)}
              style={{ width: "100%" }}
            />
          </div>
        )}

        {/* Source: current sequence or file */}
        <div>
          <sp-detail size="S">Source</sp-detail>
          <select
            value={sourceMode}
            onChange={(e) => setSourceMode(e.target.value as SourceMode)}
            style={{ width: "100%", padding: "6px 8px", fontSize: "13px" }}
          >
            {canExportSequence && (
              <option value="sequence">
                Current Sequence{sequenceName ? ` — "${sequenceName}"` : ""}
              </option>
            )}
            <option value="file">Select a file...</option>
          </select>
        </div>

        {sourceMode === "sequence" && (
          <div
            style={{
              padding: "8px",
              backgroundColor: "var(--spectrum-global-color-gray-100)",
              borderRadius: "4px",
            }}
          >
            <sp-body size="XS">
              {sequenceName
                ? `The active sequence "${sequenceName}" will be exported and uploaded.`
                : "The active sequence will be exported and uploaded to Kaltura."}
            </sp-body>
          </div>
        )}

        {sourceMode === "file" && (
          <div>
            <div className="flex-row gap-8" style={{ alignItems: "center" }}>
              <sp-button variant="secondary" onClick={handleSelectFile} size="s">
                Select File
              </sp-button>
              {selectedFile && (
                <sp-body
                  size="XS"
                  style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)
                </sp-body>
              )}
            </div>
          </div>
        )}

        <div>
          <sp-detail size="S">Title *</sp-detail>
          <sp-textfield
            placeholder="Video title"
            value={title}
            onInput={(e: Event) => setTitle((e.target as HTMLInputElement).value)}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <sp-detail size="S">Description</sp-detail>
          <sp-textarea
            placeholder="Video description"
            value={description}
            onInput={(e: Event) => setDescription((e.target as HTMLTextAreaElement).value)}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <sp-detail size="S">Tags</sp-detail>
          <sp-textfield
            placeholder="Comma-separated tags"
            value={tags}
            onInput={(e: Event) => setTags((e.target as HTMLInputElement).value)}
            style={{ width: "100%" }}
          />
        </div>

        {/* Multi-category selector */}
        {categories.length > 0 && (
          <div>
            <sp-detail size="S">
              Categories{selectedCategoryIds.length > 0 ? ` (${selectedCategoryIds.length})` : ""}
            </sp-detail>
            <div
              style={{
                maxHeight: "120px",
                overflowY: "auto",
                border: "1px solid var(--spectrum-global-color-gray-300)",
                borderRadius: "4px",
                padding: "4px",
              }}
            >
              {categories.map((cat) => (
                <label
                  key={cat.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "2px 4px",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedCategoryIds.includes(cat.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCategoryIds((prev) => [...prev, cat.id]);
                      } else {
                        setSelectedCategoryIds((prev) => prev.filter((id) => id !== cat.id));
                      }
                    }}
                  />
                  {cat.fullName || cat.name}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Scheduled publish */}
        {publishWorkflowService && (
          <div>
            <sp-detail size="S">Schedule (optional)</sp-detail>
            <sp-textfield
              type="datetime-local"
              value={scheduledDate}
              onInput={(e: Event) => setScheduledDate((e.target as HTMLInputElement).value)}
              style={{ width: "100%" }}
              placeholder="Leave empty to publish immediately"
            />
          </div>
        )}

        {/* Access control profile */}
        {accessControlProfiles.length > 0 && publishMode === "new" && (
          <div>
            <sp-detail size="S">Access Control</sp-detail>
            <select
              value={selectedAccessControlId != null ? String(selectedAccessControlId) : ""}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedAccessControlId(val ? Number(val) : null);
              }}
              style={{ width: "100%", padding: "6px 8px", fontSize: "13px" }}
            >
              {accessControlProfiles.map((profile) => (
                <option key={profile.id} value={String(profile.id)}>
                  {profile.name}
                  {profile.isDefault ? " (Default)" : ""}
                </option>
              ))}
            </select>
            <div className="text-muted" style={{ fontSize: 10, marginTop: 4 }}>
              Controls who can view the published content
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "8px 0" }}>
        <sp-button
          variant="accent"
          onClick={handlePublish}
          disabled={!canPublish || undefined}
          style={{ width: "100%" }}
        >
          {publishMode === "new" ? "Publish" : "Replace Content"}
        </sp-button>
      </div>
    </div>
  );
};
