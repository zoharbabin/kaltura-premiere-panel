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
      analyticsService.getViewerStats(entryId).catch(() => null),
      analyticsService.getTopMoments(entryId, 5).catch(() => []),
      analyticsService.getDropOffPoints(entryId).catch(() => []),
    ])
      .then(([s, m, d]) => {
        if (!s && m.length === 0 && d.length === 0) {
          setError("Failed to load analytics data.");
        }
        if (s) setStats(s);
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
    <div className="panel-root panel-padding">
      <div style={{ marginBottom: 8 }}>
        <sp-detail size="S" className="text-muted">
          {entryName || entryId}
        </sp-detail>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* View tabs */}
      <div className="sub-tabs" style={{ margin: "0 -8px 8px", padding: "4px 8px" }}>
        <button
          className={`sub-tab${view === "overview" ? " sub-tab--active" : ""}`}
          onClick={() => setView("overview")}
        >
          Overview
        </button>
        <button
          className={`sub-tab${view === "moments" ? " sub-tab--active" : ""}`}
          onClick={() => setView("moments")}
        >
          Top Moments ({moments.length})
        </button>
        <button
          className={`sub-tab${view === "dropoff" ? " sub-tab--active" : ""}`}
          onClick={() => setView("dropoff")}
        >
          Drop-off ({dropoffs.length})
        </button>
      </div>

      <div style={{ flexGrow: 1, flexShrink: 1, flexBasis: "0%", overflowY: "auto" }}>
        {view === "overview" && stats && <OverviewView stats={stats} />}
        {view === "moments" && <MomentsView moments={moments} />}
        {view === "dropoff" && <DropOffView dropoffs={dropoffs} />}
      </div>
    </div>
  );
};

// --- Sub-components ---

const StatCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="stat-card">
    <div className="stat-card-value">{value}</div>
    <div className="stat-card-label">{label}</div>
  </div>
);

const OverviewView: React.FC<{ stats: ViewerStats }> = ({ stats }) => (
  <div className="flex-col gap-8">
    <div className="stat-grid">
      <StatCard label="Total Plays" value={stats.totalPlays.toLocaleString()} />
      <StatCard label="Unique Viewers" value={stats.uniqueViewers.toLocaleString()} />
    </div>
    <div className="stat-grid">
      <StatCard label="Avg Completion" value={`${Math.round(stats.avgCompletionRate)}%`} />
      <StatCard label="Avg View Duration" value={formatDuration(stats.avgViewDuration)} />
    </div>
    <div className="stat-grid">
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
    <div className="flex-col gap-6">
      {moments.map((moment, i) => (
        <div key={i} className="card-item">
          <div className="card-item-header">
            <div>
              <span style={{ fontWeight: 600 }}>
                {formatDuration(moment.startTime)} - {formatDuration(moment.endTime)}
              </span>
              {moment.label && (
                <span className="text-muted" style={{ marginLeft: 8 }}>
                  {moment.label}
                </span>
              )}
            </div>
            <span className="text-success" style={{ fontWeight: 600 }}>
              {moment.replayCount} replays
            </span>
          </div>
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
    <div className="flex-col gap-6">
      {dropoffs.map((point, i) => (
        <div key={i} className="card-item">
          <div className="card-item-header" style={{ marginBottom: 4 }}>
            <span style={{ fontWeight: 600 }}>{formatDuration(point.timestamp)}</span>
            <span className="text-error" style={{ fontWeight: 600 }}>
              -{Math.round(point.dropOffRate)}% drop
            </span>
          </div>
          <div className="text-muted" style={{ fontSize: 10 }}>
            {point.viewersBefore} viewers {"\u2192"} {point.viewersAfter} viewers
          </div>
          <div className="dropoff-bar-track">
            <div
              className="dropoff-bar-fill"
              style={{ width: `${Math.min(point.dropOffRate, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
