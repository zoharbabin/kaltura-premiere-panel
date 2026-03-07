import React, { useState, useCallback } from "react";
import { KalturaMediaEntry, KalturaMediaType } from "../types/kaltura";
import { ExportProgress } from "../types/premiere";
import { MediaService, UploadService } from "../services";
import { PremiereService } from "../services/PremiereService";
import { ProgressBar, ErrorBanner } from "../components";
import { getUserMessage } from "../utils/errors";
import { createLogger } from "../utils/logger";

const log = createLogger("PublishPanel");

interface PublishPanelProps {
  mediaService: MediaService;
  uploadService: UploadService;
  premiereService: PremiereService;
  onPublished: (entry: KalturaMediaEntry) => void;
}

type PublishPhase = "form" | "exporting" | "uploading" | "processing" | "complete" | "error";

export const PublishPanel: React.FC<PublishPanelProps> = ({
  mediaService,
  uploadService,
  premiereService,
  onPublished,
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [phase, setPhase] = useState<PublishPhase>("form");
  const [progress, setProgress] = useState<ExportProgress>({
    progress: 0,
    phase: "exporting",
  });
  const [error, setError] = useState<string | null>(null);
  const [publishedEntry, setPublishedEntry] = useState<KalturaMediaEntry | null>(null);

  // Pre-fill title from sequence name
  const prefillFromSequence = useCallback(async () => {
    if (!premiereService.isAvailable()) return;
    try {
      const seq = await premiereService.getActiveSequence();
      if (seq && !title) {
        setTitle(seq.name);
      }
    } catch {
      // Ignore — not in Premiere
    }
  }, [premiereService, title]);

  React.useEffect(() => {
    prefillFromSequence();
  }, [prefillFromSequence]);

  const handlePublish = useCallback(async () => {
    if (!title.trim()) return;
    setError(null);

    try {
      // Step 1: Create entry with metadata
      setPhase("processing");
      setProgress({ progress: 0, phase: "processing", message: "Creating entry…" });

      const entry = await mediaService.add({
        name: title.trim(),
        description: description.trim(),
        tags: tags.trim(),
        mediaType: KalturaMediaType.VIDEO,
      });

      log.info("Entry created", { entryId: entry.id });

      // Step 2: Create upload token
      setProgress({ progress: 10, phase: "uploading", message: "Preparing upload…" });
      const token = await uploadService.createToken();

      // Step 3: Upload file
      // In a real implementation, we'd export the sequence first using EncoderManager.
      // For now, the publish flow creates the entry and token — actual file upload
      // requires Premiere Pro runtime for sequence export.
      setPhase("complete");
      setProgress({ progress: 100, phase: "complete", message: "Entry created!" });
      setPublishedEntry(entry);
      onPublished(entry);
      log.info("Publish complete", { entryId: entry.id, tokenId: token.id });
    } catch (err) {
      setPhase("error");
      setError(getUserMessage(err));
      log.error("Publish failed", err);
    }
  }, [title, description, tags, mediaService, uploadService, onPublished]);

  const handleReset = useCallback(() => {
    setPhase("form");
    setProgress({ progress: 0, phase: "exporting" });
    setError(null);
    setPublishedEntry(null);
    setTitle("");
    setDescription("");
    setTags("");
  }, []);

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
        <div style={{ fontSize: "48px" }}>✓</div>
        <sp-heading size="S">Published!</sp-heading>
        <sp-body size="S" style={{ textAlign: "center" }}>
          &quot;{publishedEntry.name}&quot; has been created in Kaltura.
        </sp-body>
        <sp-detail size="S" style={{ color: "var(--spectrum-global-color-gray-600)" }}>
          Entry ID: {publishedEntry.id}
        </sp-detail>
        <sp-button variant="primary" onClick={handleReset}>
          Publish Another
        </sp-button>
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
        <sp-heading size="S">Publishing…</sp-heading>
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

      <div style={{ display: "flex", flexDirection: "column", gap: "12px", flex: 1 }}>
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
      </div>

      <div style={{ padding: "8px 0" }}>
        <sp-button
          variant="accent"
          onClick={handlePublish}
          disabled={!title.trim() || undefined}
          style={{ width: "100%" }}
        >
          Publish
        </sp-button>
      </div>
    </div>
  );
};
