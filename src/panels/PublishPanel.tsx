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
  logAction(action: string, entryId?: string, details?: string): Promise<void>;
}

/** Minimal host interface needed by PublishPanel */
interface HostServiceLike {
  isAvailable(): boolean;
  getActiveSequence(): Promise<{ name: string } | null>;
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

  // Pre-fill title from active sequence
  useEffect(() => {
    if (!premiereService.isAvailable() || title) return;
    premiereService
      .getActiveSequence()
      .then((seq) => {
        if (seq && !title) setTitle(seq.name);
      })
      .catch((err) => log.debug("Failed to get active sequence for title pre-fill", err));
  }, [premiereService, title]);

  const handlePublish = useCallback(async () => {
    if (!title.trim()) return;
    setError(null);

    try {
      if (publishMode === "new") {
        // Step 1: Create entry
        setPhase("processing");
        setProgress({ progress: 0, phase: "processing", message: "Creating entry..." });

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

        const entry = await mediaService.add(entryData);
        log.info("Entry created", { entryId: entry.id });

        // Step 2: Create upload token
        setProgress({ progress: 10, phase: "uploading", message: "Preparing upload..." });
        const token = await uploadService.createToken();
        log.info("Upload token created", { tokenId: token.id });

        // Step 3: Multi-category assignment via workflow service
        if (publishWorkflowService && selectedCategoryIds.length > 1) {
          setProgress({ progress: 60, phase: "processing", message: "Assigning categories..." });
          await publishWorkflowService.publishToCategories(entry.id, selectedCategoryIds);
        }

        // Step 4: Schedule if a date is set
        if (publishWorkflowService && scheduledDate) {
          setProgress({ progress: 80, phase: "processing", message: "Scheduling publish..." });
          const startDate = Math.floor(new Date(scheduledDate).getTime() / 1000);
          await publishWorkflowService.schedulePublish(entry.id, startDate);
        }

        setPhase("complete");
        setProgress({ progress: 100, phase: "complete", message: "Entry created!" });
        setPublishedEntry(entry);
        onPublished(entry);
        auditService?.logAction("publish", entry.id, `New entry: ${entry.name}`);
      } else {
        // Update existing entry
        setPhase("processing");
        setProgress({ progress: 0, phase: "processing", message: "Updating entry..." });

        const updated = await mediaService.update(existingEntryId, {
          name: title.trim(),
          description: description.trim(),
          tags: tags.trim(),
        });

        setPhase("complete");
        setProgress({ progress: 100, phase: "complete", message: "Entry updated!" });
        setPublishedEntry(updated);
        onPublished(updated);
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

  // Success view
  if (phase === "complete" && publishedEntry) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "32px 16px",
          gap: "16px",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            backgroundColor: "var(--spectrum-global-color-green-500)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: "24px",
          }}
        >
          \u2713
        </div>
        <sp-heading size="S">{publishMode === "new" ? "Published!" : "Updated!"}</sp-heading>
        <sp-body size="S" style={{ textAlign: "center" }}>
          &quot;{publishedEntry.name}&quot; has been{" "}
          {publishMode === "new" ? "created in" : "updated on"} Kaltura.
        </sp-body>
        <sp-detail size="S" style={{ color: "var(--spectrum-global-color-gray-600)" }}>
          Entry ID: {publishedEntry.id}
        </sp-detail>
        <div style={{ display: "flex", gap: "8px" }}>
          <sp-button variant="secondary" onClick={handleViewInKaltura}>
            View in Kaltura
          </sp-button>
          <sp-button variant="primary" onClick={handleReset}>
            Publish Another
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
          padding: "32px 16px",
          gap: "16px",
        }}
      >
        <sp-heading size="S">Publishing...</sp-heading>
        <ProgressBar value={progress.progress} label={progress.message || progress.phase} />
      </div>
    );
  }

  // Form view
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "8px" }}>
      <sp-heading size="XS" style={{ padding: "8px 0" }}>
        Publish to Kaltura
      </sp-heading>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          flex: 1,
          overflowY: "auto",
        }}
      >
        {/* Publish mode */}
        <div>
          <sp-detail size="S">Publish Mode</sp-detail>
          <sp-picker
            size="s"
            value={publishMode}
            onChange={(e: Event) =>
              setPublishMode((e.target as HTMLSelectElement).value as PublishMode)
            }
            style={{ width: "100%" }}
          >
            <sp-menu-item value="new">New Entry</sp-menu-item>
            <sp-menu-item value="update">Update Existing</sp-menu-item>
          </sp-picker>
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
            <sp-picker
              size="s"
              value={selectedAccessControlId != null ? String(selectedAccessControlId) : ""}
              onChange={(e: Event) => {
                const val = (e.target as HTMLSelectElement).value;
                setSelectedAccessControlId(val ? Number(val) : null);
              }}
              style={{ width: "100%" }}
            >
              {accessControlProfiles.map((profile) => (
                <sp-menu-item key={profile.id} value={String(profile.id)}>
                  {profile.name}
                  {profile.isDefault ? " (Default)" : ""}
                </sp-menu-item>
              ))}
            </sp-picker>
            <div
              style={{
                fontSize: "10px",
                color: "var(--spectrum-global-color-gray-600)",
                marginTop: "4px",
              }}
            >
              Controls who can view the published content
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "8px 0" }}>
        <sp-button
          variant="accent"
          onClick={handlePublish}
          disabled={
            !title.trim() || (publishMode === "update" && !existingEntryId.trim()) || undefined
          }
          style={{ width: "100%" }}
        >
          {publishMode === "new" ? "Publish" : "Update Entry"}
        </sp-button>
      </div>
    </div>
  );
};
