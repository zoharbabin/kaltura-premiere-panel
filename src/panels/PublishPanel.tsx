import React, { useState, useCallback, useEffect } from "react";
import { KalturaMediaEntry, KalturaMediaType, KalturaCategory } from "../types/kaltura";
import { ExportProgress } from "../types/premiere";
import { MediaService, UploadService, MetadataService } from "../services";
import { PremiereService } from "../services/PremiereService";
import { ProgressBar, ErrorBanner } from "../components";
import { getUserMessage } from "../utils/errors";
import { createLogger } from "../utils/logger";

const log = createLogger("PublishPanel");

interface PublishPanelProps {
  mediaService: MediaService;
  uploadService: UploadService;
  metadataService: MetadataService;
  premiereService: PremiereService;
  onPublished: (entry: KalturaMediaEntry) => void;
}

type PublishPhase = "form" | "exporting" | "uploading" | "processing" | "complete" | "error";
type PublishMode = "new" | "update";

export const PublishPanel: React.FC<PublishPanelProps> = ({
  mediaService,
  uploadService,
  metadataService,
  premiereService,
  onPublished,
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [categories, setCategories] = useState<KalturaCategory[]>([]);
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
      .catch(() => setCategories([]));
  }, [metadataService]);

  // Pre-fill title from active sequence
  useEffect(() => {
    if (!premiereService.isAvailable() || title) return;
    premiereService
      .getActiveSequence()
      .then((seq) => {
        if (seq && !title) setTitle(seq.name);
      })
      .catch(() => {});
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
        if (selectedCategoryId) {
          entryData.categoriesIds = String(selectedCategoryId);
        }

        const entry = await mediaService.add(entryData);
        log.info("Entry created", { entryId: entry.id });

        // Step 2: Create upload token
        setProgress({ progress: 10, phase: "uploading", message: "Preparing upload..." });
        const token = await uploadService.createToken();

        // Step 3: In real UXP, export sequence then upload.
        // For now, the publish flow creates entry + token.
        setPhase("complete");
        setProgress({ progress: 100, phase: "complete", message: "Entry created!" });
        setPublishedEntry(entry);
        onPublished(entry);
        log.info("Publish complete", { entryId: entry.id, tokenId: token.id });
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
    selectedCategoryId,
    publishMode,
    existingEntryId,
    mediaService,
    uploadService,
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
    setSelectedCategoryId(null);
    setExistingEntryId("");
  }, []);

  const handleViewInKaltura = useCallback(() => {
    if (!publishedEntry) return;
    const url = `${mediaService["client"]["serviceUrl"]}/index.php/kmcng/content/entries/entry/${publishedEntry.id}`;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const uxp = require("uxp");
      uxp.shell.openExternal(url);
    } catch {
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

        {/* Category picker */}
        {categories.length > 0 && (
          <div>
            <sp-detail size="S">Category</sp-detail>
            <sp-picker
              size="s"
              value={selectedCategoryId?.toString() ?? ""}
              onChange={(e: Event) => {
                const val = (e.target as HTMLSelectElement).value;
                setSelectedCategoryId(val ? parseInt(val) : null);
              }}
              style={{ width: "100%" }}
            >
              <sp-menu-item value="">None</sp-menu-item>
              {categories.map((cat) => (
                <sp-menu-item key={cat.id} value={String(cat.id)}>
                  {cat.fullName || cat.name}
                </sp-menu-item>
              ))}
            </sp-picker>
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
