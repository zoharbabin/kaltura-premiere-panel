import React, { useState, useEffect, useCallback } from "react";
import { KalturaAnnotation } from "../types/kaltura";
import { LoadingSpinner, ErrorBanner, EmptyState } from "../components";
import { getUserMessage } from "../utils/errors";
import { formatDateTime } from "../utils/format";

/** Minimal ReviewService interface for the panel */
interface ReviewServiceLike {
  listAnnotations(entryId: string): Promise<KalturaAnnotation[]>;
  addAnnotation(
    entryId: string,
    text: string,
    startTime: number,
    endTime?: number,
    parentId?: string,
  ): Promise<KalturaAnnotation>;
  deleteAnnotation(annotationId: string): Promise<void>;
  syncToMarkers(
    entryId: string,
  ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }>;
  syncFromMarkers(
    entryId: string,
  ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }>;
}

interface ReviewPanelProps {
  reviewService: ReviewServiceLike;
  entryId: string | null;
  entryName: string | null;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({ reviewService, entryId, entryName }) => {
  const [annotations, setAnnotations] = useState<KalturaAnnotation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [newTimestamp, setNewTimestamp] = useState("");
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  useEffect(() => {
    if (!entryId) return;
    setIsLoading(true);
    setError(null);

    reviewService
      .listAnnotations(entryId)
      .then((items) => setAnnotations(items))
      .catch((err) => setError(getUserMessage(err)))
      .finally(() => setIsLoading(false));
  }, [entryId, reviewService]);

  const handleAddComment = useCallback(async () => {
    if (!entryId || !newComment.trim()) return;
    setError(null);

    const startTime = parseTimestamp(newTimestamp);
    try {
      const annotation = await reviewService.addAnnotation(entryId, newComment.trim(), startTime);
      setAnnotations((prev) => [...prev, annotation]);
      setNewComment("");
      setNewTimestamp("");
    } catch (err) {
      setError(getUserMessage(err));
    }
  }, [entryId, newComment, newTimestamp, reviewService]);

  const handleAddReply = useCallback(async () => {
    if (!entryId || !replyTo || !replyText.trim()) return;
    setError(null);

    try {
      const annotation = await reviewService.addAnnotation(
        entryId,
        replyText.trim(),
        0,
        undefined,
        replyTo,
      );
      setAnnotations((prev) => [...prev, annotation]);
      setReplyTo(null);
      setReplyText("");
    } catch (err) {
      setError(getUserMessage(err));
    }
  }, [entryId, replyTo, replyText, reviewService]);

  const handleDelete = useCallback(
    async (annotationId: string) => {
      setError(null);
      try {
        await reviewService.deleteAnnotation(annotationId);
        setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
      } catch (err) {
        setError(getUserMessage(err));
      }
    },
    [reviewService],
  );

  const handleSyncToMarkers = useCallback(async () => {
    if (!entryId) return;
    setError(null);
    setSyncStatus("Syncing comments to timeline markers...");

    try {
      const result = await reviewService.syncToMarkers(entryId);
      setSyncStatus(
        `Synced: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`,
      );
      setTimeout(() => setSyncStatus(null), 5000);
    } catch (err) {
      setError(getUserMessage(err));
      setSyncStatus(null);
    }
  }, [entryId, reviewService]);

  const handleSyncFromMarkers = useCallback(async () => {
    if (!entryId) return;
    setError(null);
    setSyncStatus("Syncing markers to Kaltura comments...");

    try {
      const result = await reviewService.syncFromMarkers(entryId);
      setSyncStatus(
        `Synced: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`,
      );
      // Refresh annotations list
      const updated = await reviewService.listAnnotations(entryId);
      setAnnotations(updated);
      setTimeout(() => setSyncStatus(null), 5000);
    } catch (err) {
      setError(getUserMessage(err));
      setSyncStatus(null);
    }
  }, [entryId, reviewService]);

  if (!entryId) {
    return (
      <EmptyState
        title="No entry selected"
        description="Select a Kaltura entry from the Browse tab to view and manage review comments."
      />
    );
  }

  if (isLoading) {
    return <LoadingSpinner label="Loading comments..." />;
  }

  // Separate root annotations and replies
  const rootAnnotations = annotations.filter((a) => !a.parentId);
  const repliesMap = new Map<string, KalturaAnnotation[]>();
  for (const a of annotations) {
    if (a.parentId) {
      const existing = repliesMap.get(a.parentId) || [];
      existing.push(a);
      repliesMap.set(a.parentId, existing);
    }
  }

  return (
    <div className="panel-root panel-padding">
      {/* Header */}
      <div style={{ marginBottom: 8 }}>
        <sp-detail size="S" className="text-muted">
          {entryName || entryId}
        </sp-detail>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {syncStatus && <div className="sync-banner">{syncStatus}</div>}

      {/* Sync controls */}
      <div className="flex-row gap-4" style={{ marginBottom: 8 }}>
        <sp-action-button quiet size="s" onClick={handleSyncToMarkers}>
          Pull to Markers
        </sp-action-button>
        <sp-action-button quiet size="s" onClick={handleSyncFromMarkers}>
          Push from Markers
        </sp-action-button>
      </div>

      {/* Annotation list */}
      <div style={{ flex: 1, overflowY: "auto", marginBottom: 8 }}>
        {rootAnnotations.length === 0 ? (
          <EmptyState title="No comments" description="Add a comment below to start a review." />
        ) : (
          <div className="flex-col gap-8">
            {rootAnnotations.map((annotation) => (
              <AnnotationCard
                key={annotation.id}
                annotation={annotation}
                replies={repliesMap.get(annotation.id) || []}
                isReplying={replyTo === annotation.id}
                replyText={replyText}
                onReplyClick={() => setReplyTo(replyTo === annotation.id ? null : annotation.id)}
                onReplyTextChange={setReplyText}
                onReplySubmit={handleAddReply}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* New comment form */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          borderTop: "1px solid var(--spectrum-global-color-gray-300)",
          paddingTop: "8px",
        }}
      >
        <div style={{ display: "flex", gap: "4px" }}>
          <sp-textfield
            size="s"
            placeholder="Timecode (e.g. 1:30)"
            value={newTimestamp}
            onInput={(e: Event) => setNewTimestamp((e.target as HTMLInputElement).value)}
            style={{ width: "80px" }}
          />
          <sp-textfield
            size="s"
            placeholder="Add a comment..."
            value={newComment}
            onInput={(e: Event) => setNewComment((e.target as HTMLInputElement).value)}
            style={{ flex: 1 }}
          />
        </div>
        <sp-button
          size="s"
          variant="accent"
          onClick={handleAddComment}
          disabled={!newComment.trim() || undefined}
          style={{ alignSelf: "flex-end" }}
        >
          Add Comment
        </sp-button>
      </div>
    </div>
  );
};

// --- Sub-components ---

const AnnotationCard: React.FC<{
  annotation: KalturaAnnotation;
  replies: KalturaAnnotation[];
  isReplying: boolean;
  replyText: string;
  onReplyClick: () => void;
  onReplyTextChange: (text: string) => void;
  onReplySubmit: () => void;
  onDelete: (id: string) => void;
}> = ({
  annotation,
  replies,
  isReplying,
  replyText,
  onReplyClick,
  onReplyTextChange,
  onReplySubmit,
  onDelete,
}) => (
  <div className="card-item">
    {/* Header */}
    <div className="card-item-header">
      <div className="flex-row gap-8">
        <span style={{ fontWeight: 600 }}>{annotation.userId || "Anonymous"}</span>
        <span className="text-muted-light" style={{ fontSize: 10 }}>
          {formatTimestamp(annotation.startTime)}
          {annotation.endTime ? ` - ${formatTimestamp(annotation.endTime)}` : ""}
        </span>
      </div>
      <span className="text-muted-light" style={{ fontSize: 10 }}>
        {formatDateTime(annotation.createdAt)}
      </span>
    </div>

    {/* Text */}
    <div className="card-item-body" style={{ margin: "4px 0" }}>
      {annotation.text}
    </div>

    {/* Actions */}
    <div className="card-item-footer">
      <sp-action-button quiet size="s" onClick={onReplyClick}>
        {isReplying ? "Cancel" : `Reply${replies.length > 0 ? ` (${replies.length})` : ""}`}
      </sp-action-button>
      <sp-action-button quiet size="s" onClick={() => onDelete(annotation.id)}>
        Delete
      </sp-action-button>
    </div>

    {/* Replies */}
    {replies.length > 0 && (
      <div className="reply-thread">
        {replies.map((reply) => (
          <div key={reply.id} style={{ fontSize: 11 }}>
            <span style={{ fontWeight: 600 }}>{reply.userId || "Anonymous"}</span>
            <span style={{ marginLeft: 4 }}>{reply.text}</span>
            <span className="text-muted-light" style={{ marginLeft: 4, fontSize: 10 }}>
              {formatDateTime(reply.createdAt)}
            </span>
          </div>
        ))}
      </div>
    )}

    {/* Reply form */}
    {isReplying && (
      <div style={{ display: "flex", gap: "4px", marginTop: "8px" }}>
        <sp-textfield
          size="s"
          placeholder="Write a reply..."
          value={replyText}
          onInput={(e: Event) => onReplyTextChange((e.target as HTMLInputElement).value)}
          style={{ flex: 1 }}
        />
        <sp-button
          size="s"
          variant="primary"
          onClick={onReplySubmit}
          disabled={!replyText.trim() || undefined}
        >
          Reply
        </sp-button>
      </div>
    )}
  </div>
);

function parseTimestamp(input: string): number {
  if (!input.trim()) return 0;
  const parts = input.split(":").map(Number);
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  return parseFloat(input) || 0;
}
