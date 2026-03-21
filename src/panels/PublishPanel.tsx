import React, { useState, useCallback, useEffect, useMemo } from "react";
import { KalturaMediaEntry, KalturaMediaType, KalturaCategory } from "../types/kaltura";
import { ExportProgress } from "../types/premiere";
import { MediaService, UploadService, MetadataService } from "../services";
import { ProgressBar, ErrorBanner, AccordionSection, SegmentedControl } from "../components";
import { getUserMessage } from "../utils/errors";
import { formatCategoryName, formatFileSize } from "../utils/format";
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
  onPublished?: (entry: KalturaMediaEntry) => void;
}

type PublishPhase =
  | "form"
  | "exporting"
  | "reading"
  | "uploading"
  | "processing"
  | "complete"
  | "error";
type PublishMode = "new" | "update";
type SourceMode = "sequence" | "file";

interface FileInfo {
  nativePath: string;
  name: string;
  size: number;
}

/** Total number of steps in the publish pipeline */
const TOTAL_STEPS = 4;

/** Read a file from disk using UXP fs module */
async function readFileAsArrayBuffer(nativePath: string): Promise<ArrayBuffer> {
  const fs = require("fs");
  const data = await fs.readFile(nativePath);
  if (data instanceof ArrayBuffer) return data;
  if (data instanceof Uint8Array)
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  throw new Error(`Unexpected readFile result type: ${typeof data}`);
}

/** Open a file picker via UXP storage API */
async function pickFile(): Promise<FileInfo | null> {
  try {
    const uxp = require("uxp");
    const lfs = uxp.storage.localFileSystem;
    const file = await lfs.getFileForOpening({
      types: ["mp4", "mov", "mxf", "avi", "mkv", "wav", "mp3", "aac", "m4a", "m4v", "webm"],
    });
    if (!file) return null;

    const nodeFs = require("fs");
    const stats = await nodeFs.lstat(file.nativePath);
    return { nativePath: file.nativePath, name: file.name, size: stats.size };
  } catch (err) {
    log.error("File picker failed", err);
    return null;
  }
}

/** Build a summary string for collapsed Publishing Options section */
function buildOptionsSummary(
  categoryCount: number,
  scheduledDate: string,
  accessControlName: string | null,
): string {
  const parts: string[] = [];
  if (categoryCount > 0) parts.push(`${categoryCount} categor${categoryCount === 1 ? "y" : "ies"}`);
  if (scheduledDate) parts.push("Scheduled");
  if (accessControlName && accessControlName !== "Default") parts.push(accessControlName);
  return parts.length > 0 ? parts.join(" \u00B7 ") : "Default settings";
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
  // Form state
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
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>("file");
  const [sequenceName, setSequenceName] = useState("");

  // Progress state
  const [phase, setPhase] = useState<PublishPhase>("form");
  const [progress, setProgress] = useState<ExportProgress>({ progress: 0, phase: "exporting" });
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [publishedEntry, setPublishedEntry] = useState<KalturaMediaEntry | null>(null);

  const canExportSequence = !!premiereService.exportActiveSequence;

  // Detect active sequence and pre-fill title (only for new entries)
  useEffect(() => {
    if (!premiereService.isAvailable()) return;
    premiereService
      .getActiveSequence()
      .then((seq) => {
        if (seq && seq.name) {
          setSequenceName(seq.name);
          log.info("Active sequence detected", { name: seq.name });
          if (publishMode === "new" && !title) setTitle(seq.name);
          if (canExportSequence) setSourceMode("sequence");
        }
      })
      .catch((err) => {
        log.debug("Could not detect active sequence", err);
      });
  }, [premiereService, canExportSequence, title, publishMode]);

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

  // Pre-fill title from selected file name (only for new entries)
  useEffect(() => {
    if (publishMode === "new" && sourceMode === "file" && selectedFile && !title) {
      setTitle(selectedFile.name.replace(/\.[^.]+$/, ""));
    }
  }, [publishMode, sourceMode, selectedFile, title]);

  const handleSelectFile = useCallback(async () => {
    const file = await pickFile();
    if (file) {
      setSelectedFile(file);
      log.info("File selected", { name: file.name, size: file.size, path: file.nativePath });
    }
  }, []);

  // Derived state
  const selectedAccessControlName = useMemo(() => {
    if (!selectedAccessControlId) return null;
    return accessControlProfiles.find((p) => p.id === selectedAccessControlId)?.name ?? null;
  }, [selectedAccessControlId, accessControlProfiles]);

  const optionsSummary = useMemo(
    () => buildOptionsSummary(selectedCategoryIds.length, scheduledDate, selectedAccessControlName),
    [selectedCategoryIds.length, scheduledDate, selectedAccessControlName],
  );

  const hasSource = sourceMode === "sequence" || !!selectedFile;
  const canPublish =
    hasSource && (publishMode === "new" ? !!title.trim() : !!existingEntryId.trim());

  /**
   * Core publish flow:
   * Step 1: Get file (export sequence or use selected file)
   * Step 2: Read file into memory
   * Step 3: Upload in chunks
   * Step 4: Create/update entry + metadata
   */
  const handlePublish = useCallback(async () => {
    if (!title.trim()) return;
    setError(null);

    try {
      let fileInfo: FileInfo;

      // Step 1: Get the file
      if (sourceMode === "sequence") {
        if (!premiereService.exportActiveSequence) {
          throw new Error("Sequence export is not available in this host application");
        }
        setPhase("exporting");
        setCurrentStep(1);
        setProgress({ progress: 0, phase: "exporting", message: "Rendering sequence..." });
        log.info("Exporting active sequence for publish");

        fileInfo = await premiereService.exportActiveSequence((percent) => {
          setProgress({
            progress: Math.round(percent * 0.3),
            phase: "exporting",
            message: `Rendering... ${percent}%`,
          });
        });
        log.info("Sequence exported", { path: fileInfo.nativePath, size: fileInfo.size });
      } else {
        if (!selectedFile) {
          setError("Please select a file to upload.");
          return;
        }
        fileInfo = selectedFile;
      }

      // Step 2: Read the file
      setPhase("reading");
      setCurrentStep(2);
      setProgress({
        progress: sourceMode === "sequence" ? 30 : 5,
        phase: "exporting",
        message: `Reading file (${formatFileSize(fileInfo.size)})...`,
      });

      const fileData = await readFileAsArrayBuffer(fileInfo.nativePath);
      log.info("File read complete", { byteLength: fileData.byteLength });

      if (fileData.byteLength === 0) {
        throw new Error(`File is empty (0 bytes): ${fileInfo.name}`);
      }

      // Step 3: Upload
      setPhase("uploading");
      setCurrentStep(3);
      setProgress({ progress: 35, phase: "uploading", message: "Creating upload token..." });

      const token = await uploadService.createToken(fileInfo.name, fileInfo.size);
      log.info("Upload token created", { tokenId: token.id });

      setProgress({ progress: 38, phase: "uploading", message: "Uploading..." });
      await uploadService.uploadFile(token.id, fileData, (p) => {
        const mappedProgress = 38 + Math.round(p.percent * 0.47);
        const uploaded = formatFileSize(p.loaded);
        const total = formatFileSize(p.total);
        setProgress({
          progress: mappedProgress,
          phase: "uploading",
          message: `${uploaded} / ${total} uploaded`,
        });
      });
      log.info("File upload complete", { tokenId: token.id });

      // Step 4: Create or update entry
      setPhase("processing");
      setCurrentStep(4);
      setProgress({ progress: 88, phase: "processing", message: "Creating entry..." });

      let entry: KalturaMediaEntry;

      if (publishMode === "new") {
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

        entry = await mediaService.addFromUploadedFile(entryData, token.id);
        log.info("Entry created with content", { entryId: entry.id, name: entry.name });

        // Multi-category assignment
        if (publishWorkflowService && selectedCategoryIds.length > 1) {
          setProgress({ progress: 92, phase: "processing", message: "Assigning categories..." });
          await publishWorkflowService.publishToCategories(entry.id, selectedCategoryIds);
        }

        // Schedule if set
        if (publishWorkflowService && scheduledDate) {
          setProgress({ progress: 96, phase: "processing", message: "Scheduling publish..." });
          const startDate = Math.floor(new Date(scheduledDate).getTime() / 1000);
          await publishWorkflowService.schedulePublish(entry.id, startDate);
        }

        auditService?.logAction("publish", entry.id, `New entry: ${entry.name}`);
      } else {
        // Update existing entry
        setProgress({ progress: 88, phase: "processing", message: "Replacing content..." });
        await mediaService.updateContent(existingEntryId, token.id);

        const updateData: Partial<KalturaMediaEntry> = {};
        if (title.trim()) updateData.name = title.trim();
        if (description.trim()) updateData.description = description.trim();
        if (tags.trim()) updateData.tags = tags.trim();

        if (Object.keys(updateData).length > 0) {
          setProgress({ progress: 94, phase: "processing", message: "Updating metadata..." });
          entry = await mediaService.update(existingEntryId, updateData);
        } else {
          entry = await mediaService.get(existingEntryId);
        }
        log.info("Update complete", { entryId: entry.id });
        auditService?.logAction("update_metadata", entry.id, `Updated: ${entry.name}`);
      }

      setPhase("complete");
      setProgress({ progress: 100, phase: "complete", message: "Published!" });
      setPublishedEntry(entry);
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
  ]);

  const handleReset = useCallback(() => {
    setPhase("form");
    setProgress({ progress: 0, phase: "exporting" });
    setCurrentStep(1);
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
    const url = `${mediaService.getServerUrl()}/index.php/kmcng/content/entries/entry/${publishedEntry.id}`;
    try {
      const uxp = require("uxp");
      uxp.shell.openExternal(url);
    } catch (err) {
      log.debug("uxp.shell.openExternal unavailable", err);
      window.open(url, "_blank");
    }
  }, [publishedEntry, mediaService]);

  // ---- Success view ----
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
          {onPublished && (
            <sp-button variant="secondary" onClick={() => onPublished(publishedEntry!)}>
              Back to Browse
            </sp-button>
          )}
        </div>
      </div>
    );
  }

  // ---- Progress view with step indicators ----
  if (phase !== "form" && phase !== "error") {
    const stepLabel =
      phase === "exporting"
        ? "Rendering sequence"
        : phase === "reading"
          ? "Reading file"
          : phase === "uploading"
            ? "Uploading"
            : "Creating entry";

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "24px",
        }}
      >
        {/* Step dots */}
        <div className="progress-steps">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => {
            const step = i + 1;
            const cls =
              step < currentStep
                ? "step-dot step-dot--done"
                : step === currentStep
                  ? "step-dot step-dot--active"
                  : "step-dot";
            return <div key={step} className={cls} />;
          })}
        </div>

        <sp-heading size="S">{stepLabel}</sp-heading>

        <div style={{ width: "100%", maxWidth: "320px" }}>
          <ProgressBar value={progress.progress} />
        </div>

        <div className="progress-detail">
          Step {currentStep} of {TOTAL_STEPS}
          {progress.message ? ` \u00B7 ${progress.message}` : ""}
        </div>
      </div>
    );
  }

  // ---- Form view with progressive disclosure ----
  return (
    <div className="panel-root">
      {error && (
        <div style={{ padding: "12px 12px 0" }}>
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      <div className="panel-scroll">
        {/* Publish mode toggle */}
        <div style={{ marginBottom: "8px" }}>
          <SegmentedControl
            options={[
              { value: "new" as PublishMode, label: "New Entry" },
              { value: "update" as PublishMode, label: "Replace Existing" },
            ]}
            value={publishMode}
            onChange={(mode: PublishMode) => {
              setPublishMode(mode);
              if (mode === "update") {
                setTitle("");
                setDescription("");
                setTags("");
              }
            }}
          />
        </div>

        {/* Source section — always visible */}
        {publishMode === "update" && (
          <div style={{ marginBottom: 12 }}>
            <div className="form-label">Entry ID *</div>
            <sp-textfield
              placeholder="Kaltura Entry ID (e.g. 0_abc123)"
              value={existingEntryId}
              onInput={(e: Event) => setExistingEntryId((e.target as HTMLInputElement).value)}
              style={{ width: "100%" }}
            />
          </div>
        )}

        {sourceMode === "sequence" && sequenceName ? (
          <div className="source-card">
            <div className="source-card-icon">{"\u25B6"}</div>
            <div className="source-card-info">
              <div className="source-card-name">{sequenceName}</div>
              <div className="source-card-meta">Current sequence will be exported</div>
            </div>
          </div>
        ) : sourceMode === "file" && selectedFile ? (
          <div className="source-card">
            <div className="source-card-icon">{"\uD83D\uDCC4"}</div>
            <div className="source-card-info">
              <div className="source-card-name">{selectedFile.name}</div>
              <div className="source-card-meta">{formatFileSize(selectedFile.size)}</div>
            </div>
          </div>
        ) : null}

        {/* Source switcher */}
        <div style={{ display: "flex", alignItems: "center", marginTop: 4, marginBottom: 8 }}>
          {sourceMode === "file" && (
            <sp-action-button quiet size="s" onClick={handleSelectFile}>
              {selectedFile ? "Change file" : "Select a file"}
            </sp-action-button>
          )}
          {canExportSequence && sourceMode === "file" && sequenceName && (
            <sp-action-button quiet size="s" onClick={() => setSourceMode("sequence")}>
              Use sequence instead
            </sp-action-button>
          )}
          {sourceMode === "sequence" && (
            <sp-action-button quiet size="s" onClick={() => setSourceMode("file")}>
              Select a file instead
            </sp-action-button>
          )}
        </div>

        {/* Basic Info — shown directly (no accordion for required fields) */}
        <div className="form-label">{publishMode === "new" ? "Title *" : "Title (optional)"}</div>
        <sp-textfield
          placeholder={publishMode === "new" ? "Video title" : "Leave empty to keep current title"}
          value={title}
          onInput={(e: Event) => setTitle((e.target as HTMLInputElement).value)}
          style={{ width: "100%", marginBottom: 12 }}
        />

        <div className="form-label">
          {publishMode === "new" ? "Description" : "Description (optional)"}
        </div>
        <sp-textarea
          placeholder={
            publishMode === "new" ? "Video description" : "Leave empty to keep current description"
          }
          value={description}
          onInput={(e: Event) => setDescription((e.target as HTMLTextAreaElement).value)}
          style={{ width: "100%", marginBottom: 12 }}
        />

        <div className="form-label">{publishMode === "new" ? "Tags" : "Tags (optional)"}</div>
        <sp-textfield
          placeholder={
            publishMode === "new" ? "Comma-separated tags" : "Leave empty to keep current tags"
          }
          value={tags}
          onInput={(e: Event) => setTags((e.target as HTMLInputElement).value)}
          style={{ width: "100%", marginBottom: 12 }}
        />

        {/* Publishing Options — collapsed by default */}
        {publishMode === "new" && (
          <AccordionSection title="PUBLISHING OPTIONS" summary={optionsSummary}>
            {/* Categories */}
            {categories.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div className="form-label">
                  Categories
                  {selectedCategoryIds.length > 0 ? ` (${selectedCategoryIds.length})` : ""}
                </div>
                <div
                  style={{
                    maxHeight: "120px",
                    overflowY: "auto",
                    border: "1px solid #3e3e3e",
                    borderRadius: "4px",
                    padding: "4px",
                  }}
                >
                  {categories.map((cat) => (
                    <div
                      key={cat.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "3px 4px",
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        if (selectedCategoryIds.includes(cat.id)) {
                          setSelectedCategoryIds((prev) => prev.filter((id) => id !== cat.id));
                        } else {
                          setSelectedCategoryIds((prev) => [...prev, cat.id]);
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategoryIds.includes(cat.id)}
                        readOnly
                        style={{ marginRight: 6 }}
                      />
                      <span>{formatCategoryName(cat.fullName || cat.name)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Schedule */}
            {publishWorkflowService && (
              <div style={{ marginBottom: 12 }}>
                <div className="form-label">Schedule</div>
                <sp-textfield
                  type="datetime-local"
                  value={scheduledDate}
                  onInput={(e: Event) => setScheduledDate((e.target as HTMLInputElement).value)}
                  style={{ width: "100%" }}
                  placeholder="Leave empty to publish immediately"
                />
                <div className="form-helper">Leave empty to publish immediately</div>
              </div>
            )}

            {/* Access control */}
            {accessControlProfiles.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div className="form-label">Access Control</div>
                <select
                  className="native-select"
                  value={selectedAccessControlId != null ? String(selectedAccessControlId) : ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedAccessControlId(val ? Number(val) : null);
                  }}
                >
                  {accessControlProfiles.map((profile) => (
                    <option key={profile.id} value={String(profile.id)}>
                      {profile.name}
                      {profile.isDefault ? " (Default)" : ""}
                    </option>
                  ))}
                </select>
                <div className="form-helper">Controls who can view the published content</div>
              </div>
            )}
          </AccordionSection>
        )}
      </div>

      {/* Publish button — pinned to bottom */}
      <div style={{ padding: "8px 12px", flexShrink: 0 }}>
        <div
          role="button"
          tabIndex={canPublish ? 0 : -1}
          className={`btn-kaltura${!canPublish ? " btn-kaltura--disabled" : ""}`}
          onClick={canPublish ? handlePublish : undefined}
          onKeyDown={(e) => {
            if (canPublish && (e.key === "Enter" || e.key === " ")) handlePublish();
          }}
          aria-disabled={!canPublish || undefined}
        >
          {publishMode === "new" ? "Publish to Kaltura" : "Replace Content"}
        </div>
      </div>
    </div>
  );
};
