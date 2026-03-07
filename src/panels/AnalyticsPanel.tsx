import React, { useState, useEffect } from "react";
import { LoadingSpinner, ErrorBanner, EmptyState } from "../components";
import { getUserMessage } from "../utils/errors";
import { formatDuration } from "../utils/format";

/** Minimal AnalyticsService interface for the panel */
interface AnalyticsServiceLike {
  getViewerStats(entryId: string): Promise<ViewerStats>;
  getTopMoments(entryId: string, count?: number): Promise<TopMoment[]>;
  getDropOffPoints(entryId: string, threshold?: number): Promise<DropOffPoint[]>;
}

interface ViewerStats {
  totalPlays: number;
  uniqueViewers: number;
  avgCompletionRate: number;
  avgViewDuration: number;
  peakConcurrentViewers: number;
}

interface TopMoment {
  startTime: number;
  endTime: number;
  replayCount: number;
  label?: string;
}

interface DropOffPoint {
  timestamp: number;
  dropOffRate: number;
  viewersBefore: number;
  viewersAfter: number;
}

interface AnalyticsPanelProps {
  analyticsService: AnalyticsServiceLike;
  entryId: string | null;
  entryName: string | null;
}

type AnalyticsView = "overview" | "moments" | "dropoff";

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({
  analyticsService,
  entryId,
  entryName,
}) => {
  const [view, setView] = useState<AnalyticsView>("overview");
  const [stats, setStats] = useState<ViewerStats | null>(null);
  const [moments, setMoments] = useState<TopMoment[]>([]);
  const [dropoffs, setDropoffs] = useState<DropOffPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entryId) return;
    setIsLoading(true);
    setError(null);

    Promise.all([
      analyticsService.getViewerStats(entryId),
      analyticsService.getTopMoments(entryId, 5),
      analyticsService.getDropOffPoints(entryId),
    ])
      .then(([s, m, d]) => {
        setStats(s);
        setMoments(m);
        setDropoffs(d);
      })
      .catch((err) => setError(getUserMessage(err)))
      .finally(() => setIsLoading(false));
  }, [entryId, analyticsService]);

  if (!entryId) {
    return (
      <EmptyState
        title="No entry selected"
        description="Select a Kaltura entry from the Browse tab to view analytics."
      />
    );
  }

  if (isLoading) {
    return <LoadingSpinner label="Loading analytics..." />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "8px" }}>
      <div style={{ marginBottom: "8px" }}>
        <sp-detail size="S" style={{ color: "var(--spectrum-global-color-gray-600)" }}>
          {entryName || entryId}
        </sp-detail>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* View tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "8px" }}>
        <sp-action-button
          quiet={view !== "overview" || undefined}
          size="s"
          onClick={() => setView("overview")}
        >
          Overview
        </sp-action-button>
        <sp-action-button
          quiet={view !== "moments" || undefined}
          size="s"
          onClick={() => setView("moments")}
        >
          Top Moments ({moments.length})
        </sp-action-button>
        <sp-action-button
          quiet={view !== "dropoff" || undefined}
          size="s"
          onClick={() => setView("dropoff")}
        >
          Drop-off ({dropoffs.length})
        </sp-action-button>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {view === "overview" && stats && <OverviewView stats={stats} />}
        {view === "moments" && <MomentsView moments={moments} />}
        {view === "dropoff" && <DropOffView dropoffs={dropoffs} />}
      </div>
    </div>
  );
};

// --- Sub-components ---

const StatCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div
    style={{
      padding: "12px",
      borderRadius: "4px",
      border: "1px solid var(--spectrum-global-color-gray-300)",
      textAlign: "center",
    }}
  >
    <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "4px" }}>{value}</div>
    <div style={{ fontSize: "10px", color: "var(--spectrum-global-color-gray-600)" }}>{label}</div>
  </div>
);

const OverviewView: React.FC<{ stats: ViewerStats }> = ({ stats }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
    <div style={{ display: "flex", gap: "8px" }}>
      <StatCard label="Total Plays" value={stats.totalPlays.toLocaleString()} />
      <StatCard label="Unique Viewers" value={stats.uniqueViewers.toLocaleString()} />
    </div>
    <div style={{ display: "flex", gap: "8px" }}>
      <StatCard label="Avg Completion" value={`${Math.round(stats.avgCompletionRate)}%`} />
      <StatCard label="Avg View Duration" value={formatDuration(stats.avgViewDuration)} />
    </div>
    <div style={{ display: "flex", gap: "8px" }}>
      <StatCard label="Peak Concurrent" value={stats.peakConcurrentViewers.toLocaleString()} />
    </div>
  </div>
);

const MomentsView: React.FC<{ moments: TopMoment[] }> = ({ moments }) => {
  if (moments.length === 0) {
    return (
      <EmptyState title="No data" description="Not enough viewer data to identify top moments." />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {moments.map((moment, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px",
            borderRadius: "4px",
            border: "1px solid var(--spectrum-global-color-gray-300)",
            fontSize: "12px",
          }}
        >
          <div>
            <span style={{ fontWeight: 600 }}>
              {formatDuration(moment.startTime)} - {formatDuration(moment.endTime)}
            </span>
            {moment.label && (
              <span style={{ marginLeft: "8px", color: "var(--spectrum-global-color-gray-600)" }}>
                {moment.label}
              </span>
            )}
          </div>
          <span style={{ color: "var(--spectrum-global-color-green-600)", fontWeight: 600 }}>
            {moment.replayCount} replays
          </span>
        </div>
      ))}
    </div>
  );
};

const DropOffView: React.FC<{ dropoffs: DropOffPoint[] }> = ({ dropoffs }) => {
  if (dropoffs.length === 0) {
    return (
      <EmptyState title="No significant drop-offs" description="Viewer retention is consistent." />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {dropoffs.map((point, i) => (
        <div
          key={i}
          style={{
            padding: "8px",
            borderRadius: "4px",
            border: "1px solid var(--spectrum-global-color-gray-300)",
            fontSize: "12px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ fontWeight: 600 }}>{formatDuration(point.timestamp)}</span>
            <span style={{ color: "var(--spectrum-global-color-red-500)", fontWeight: 600 }}>
              -{Math.round(point.dropOffRate)}% drop
            </span>
          </div>
          <div style={{ fontSize: "10px", color: "var(--spectrum-global-color-gray-600)" }}>
            {point.viewersBefore} viewers → {point.viewersAfter} viewers
          </div>
          {/* Simple visual bar */}
          <div
            style={{
              marginTop: "4px",
              height: "4px",
              borderRadius: "2px",
              backgroundColor: "var(--spectrum-global-color-gray-200)",
              position: "relative",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: "2px",
                backgroundColor: "var(--spectrum-global-color-red-400)",
                width: `${Math.min(point.dropOffRate, 100)}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
