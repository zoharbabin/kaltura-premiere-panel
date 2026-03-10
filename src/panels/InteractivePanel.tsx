import React, { useState, useEffect, useCallback } from "react";
import { LoadingSpinner, ErrorBanner, EmptyState } from "../components";
import { getUserMessage } from "../utils/errors";
import { formatDuration } from "../utils/format";

/** Local data interfaces */
interface CuePointItem {
  id: string;
  type: string;
  startTime: number;
  label?: string;
}

interface MarkerData {
  name: string;
  start: number;
  comments: string;
  colorIndex: number;
}

/** Minimal InteractiveService interface for the panel */
interface InteractiveServiceLike {
  listCuePoints(entryId: string, type?: string): Promise<CuePointItem[]>;
  addChapter(entryId: string, data: { title: string; startTime: number }): Promise<{ id: string }>;
  deleteCuePoint(id: string): Promise<void>;
  syncMarkersToChapters(entryId: string, markers: MarkerData[]): Promise<{ created: number }>;
}

/** Minimal PremiereService interface for marker access */
interface PremiereServiceLike {
  getMarkers?(): Promise<{ name: string; start: number; comments: string }[]>;
}

interface InteractivePanelProps {
  interactiveService: InteractiveServiceLike;
  premiereService?: PremiereServiceLike;
  entryId: string | null;
  entryName: string | null;
}

type InteractiveView = "chapters" | "cuepoints" | "sync";

function parseTimestamp(input: string): number {
  if (!input.trim()) return 0;
  const parts = input.split(":").map(Number);
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  return parseFloat(input) || 0;
}

export const InteractivePanel: React.FC<InteractivePanelProps> = ({
  interactiveService,
  premiereService,
  entryId,
  entryName,
}) => {
  const [view, setView] = useState<InteractiveView>("chapters");
  const [chapters, setChapters] = useState<CuePointItem[]>([]);
  const [cuePoints, setCuePoints] = useState<CuePointItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState("");
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const loadData = useCallback(
    async (id: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const [chapterItems, allItems] = await Promise.all([
          interactiveService.listCuePoints(id, "chapter").catch(() => []),
          interactiveService.listCuePoints(id).catch(() => []),
        ]);
        setChapters(chapterItems);
        setCuePoints(allItems);
      } catch (err) {
        setError(getUserMessage(err));
      } finally {
        setIsLoading(false);
      }
    },
    [interactiveService],
  );

  useEffect(() => {
    if (!entryId) return;
    loadData(entryId);
  }, [entryId, loadData]);

  const handleAddChapter = useCallback(async () => {
    if (!entryId || !newTitle.trim()) return;
    setError(null);

    try {
      const { id } = await interactiveService.addChapter(entryId, {
        title: newTitle.trim(),
        startTime: parseTimestamp(newTime),
      });
      const chapter: CuePointItem = {
        id,
        type: "chapter",
        startTime: parseTimestamp(newTime),
        label: newTitle.trim(),
      };
      setChapters((prev) => [...prev, chapter]);
      setCuePoints((prev) => [...prev, chapter]);
      setNewTitle("");
      setNewTime("");
    } catch (err) {
      setError(getUserMessage(err));
    }
  }, [entryId, newTitle, newTime, interactiveService]);

  const handleDeleteCuePoint = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await interactiveService.deleteCuePoint(id);
        setCuePoints((prev) => prev.filter((cp) => cp.id !== id));
        setChapters((prev) => prev.filter((cp) => cp.id !== id));
      } catch (err) {
        setError(getUserMessage(err));
      }
    },
    [interactiveService],
  );

  const handleSync = useCallback(async () => {
    if (!entryId) return;
    setError(null);
    setSyncStatus("Reading Premiere markers...");

    try {
      let markers: MarkerData[];
      if (premiereService?.getMarkers) {
        const raw = await premiereService.getMarkers();
        markers = raw.map((m) => ({ name: m.name, start: m.start, comments: "", colorIndex: 0 }));
      } else {
        markers = chapters.map((ch) => ({
          name: ch.label || "",
          start: ch.startTime,
          comments: "",
          colorIndex: 0,
        }));
      }

      setSyncStatus(`Syncing ${markers.length} marker(s) to chapters...`);
      const result = await interactiveService.syncMarkersToChapters(entryId, markers);
      setSyncStatus(
        `Sync complete: ${result.created} chapter${result.created !== 1 ? "s" : ""} created`,
      );
      await loadData(entryId);
      setTimeout(() => setSyncStatus(null), 5000);
    } catch (err) {
      setError(getUserMessage(err));
      setSyncStatus(null);
    }
  }, [entryId, premiereService, chapters, interactiveService, loadData]);

  if (!entryId) {
    return (
      <EmptyState
        title="No entry selected"
        description="Select a Kaltura entry from the Browse tab to manage interactive elements."
      />
    );
  }

  if (isLoading) {
    return <LoadingSpinner label="Loading interactive data..." />;
  }

  return (
    <div className="panel-root panel-padding">
      {/* Header */}
      <div style={{ marginBottom: 8 }}>
        <sp-detail size="s" className="text-muted">
          {entryName || entryId}
        </sp-detail>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {syncStatus && <div className="sync-banner">{syncStatus}</div>}

      {/* View tabs */}
      <div className="sub-tabs" style={{ margin: "0 -8px 8px", padding: "4px 8px" }}>
        <button
          className={`sub-tab${view === "chapters" ? " sub-tab--active" : ""}`}
          onClick={() => setView("chapters")}
        >
          Chapters ({chapters.length})
        </button>
        <button
          className={`sub-tab${view === "cuepoints" ? " sub-tab--active" : ""}`}
          onClick={() => setView("cuepoints")}
        >
          Cue Points ({cuePoints.length})
        </button>
        <button
          className={`sub-tab${view === "sync" ? " sub-tab--active" : ""}`}
          onClick={() => setView("sync")}
        >
          Sync
        </button>
      </div>

      <div style={{ flexGrow: 1, flexShrink: 1, flexBasis: "0%", overflowY: "auto" }}>
        {view === "chapters" && (
          <ChaptersView
            chapters={chapters}
            newTitle={newTitle}
            newTime={newTime}
            onTitleChange={setNewTitle}
            onTimeChange={setNewTime}
            onAdd={handleAddChapter}
          />
        )}
        {view === "cuepoints" && (
          <CuePointsView cuePoints={cuePoints} onDelete={handleDeleteCuePoint} />
        )}
        {view === "sync" && <SyncView onSync={handleSync} />}
      </div>
    </div>
  );
};

// --- Sub-components ---

const ChaptersView: React.FC<{
  chapters: CuePointItem[];
  newTitle: string;
  newTime: string;
  onTitleChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onAdd: () => void;
}> = ({ chapters, newTitle, newTime, onTitleChange, onTimeChange, onAdd }) => (
  <div className="flex-col gap-8">
    {chapters.length === 0 ? (
      <EmptyState title="No chapters" description="Add a chapter below to get started." />
    ) : (
      <div className="flex-col gap-6">
        {chapters.map((ch) => (
          <div
            key={ch.id}
            className="card-item flex-row"
            style={{ justifyContent: "space-between" }}
          >
            <span style={{ fontWeight: 600 }}>{ch.label || "Untitled"}</span>
            <span className="text-muted">{formatDuration(ch.startTime)}</span>
          </div>
        ))}
      </div>
    )}

    {/* Add chapter form */}
    <div className="flex-col gap-4" style={{ borderTop: "1px solid #4a4a4a", paddingTop: 8 }}>
      <sp-heading size="s">Add Chapter</sp-heading>
      <div className="flex-row gap-4">
        <sp-textfield
          size="s"
          placeholder="Chapter title"
          value={newTitle}
          onInput={(e: Event) => onTitleChange((e.target as HTMLInputElement).value)}
          style={{ flexGrow: 1, flexShrink: 1, flexBasis: "0%" }}
        />
        <sp-textfield
          size="s"
          placeholder="Time (e.g. 1:30)"
          value={newTime}
          onInput={(e: Event) => onTimeChange((e.target as HTMLInputElement).value)}
          style={{ width: 80 }}
        />
      </div>
      <sp-button
        size="s"
        variant="accent"
        onClick={onAdd}
        disabled={!newTitle.trim() || undefined}
        style={{ alignSelf: "flex-end" }}
      >
        Add Chapter
      </sp-button>
    </div>
  </div>
);

const CuePointsView: React.FC<{
  cuePoints: CuePointItem[];
  onDelete: (id: string) => void;
}> = ({ cuePoints, onDelete }) => {
  if (cuePoints.length === 0) {
    return <EmptyState title="No cue points" description="This entry has no cue points yet." />;
  }

  return (
    <div className="flex-col gap-6">
      {cuePoints.map((cp) => (
        <div
          key={cp.id}
          className="card-item"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <div className="flex-col gap-2">
            <div className="flex-row gap-8">
              <span
                className="text-muted-light"
                style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}
              >
                {cp.type}
              </span>
              <span className="text-muted">{formatDuration(cp.startTime)}</span>
            </div>
            {cp.label && <span style={{ fontWeight: 600 }}>{cp.label}</span>}
          </div>
          <sp-action-button quiet size="s" onClick={() => onDelete(cp.id)}>
            Delete
          </sp-action-button>
        </div>
      ))}
    </div>
  );
};

const SyncView: React.FC<{ onSync: () => void }> = ({ onSync }) => (
  <div className="login-container" style={{ padding: "24px 8px" }}>
    <sp-heading size="s">Sync Markers to Chapters</sp-heading>
    <sp-detail size="s" className="text-muted" style={{ textAlign: "center" }}>
      Convert timeline markers from your Premiere Pro sequence into Kaltura chapters for this entry.
    </sp-detail>
    <sp-button size="m" variant="accent" onClick={onSync}>
      Sync Markers to Chapters
    </sp-button>
  </div>
);
