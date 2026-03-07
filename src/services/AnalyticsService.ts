import { KalturaClient } from "./KalturaClient";
import { KalturaObjectBase } from "../types/kaltura";
import { createLogger } from "../utils/logger";

const log = createLogger("AnalyticsService");

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export type EngagementGranularity = "second" | "10seconds" | "minute";

export interface EngagementDataPoint {
  timestamp: number;
  plays: number;
  dropOff: number;
  percentViewed: number;
}

export interface EngagementData {
  entryId: string;
  dataPoints: EngagementDataPoint[];
  totalPlays: number;
  avgCompletion: number;
}

export interface ViewerStats {
  totalPlays: number;
  uniqueViewers: number;
  avgCompletionRate: number;
  avgViewDuration: number;
  peakConcurrentViewers: number;
}

export interface TopMoment {
  startTime: number;
  endTime: number;
  replayCount: number;
  label?: string;
}

export interface DropOffPoint {
  timestamp: number;
  dropOffRate: number;
  viewersBefore: number;
  viewersAfter: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map granularity to the Kaltura analytics time-bucket dimension value. */
const GRANULARITY_DIMENSION: Record<EngagementGranularity, string> = {
  second: "1",
  "10seconds": "10",
  minute: "60",
};

interface AnalyticsRow {
  [key: string]: string | number;
}

interface AnalyticsQueryResponse extends KalturaObjectBase {
  columns?: string;
  results?: string;
  totalCount?: number;
}

/**
 * Parse the tabular response returned by the Kaltura analytics.query API.
 *
 * The API returns a `columns` field (semicolon-delimited header names) and a
 * `results` field (rows delimited by newlines, values within a row delimited
 * by semicolons).
 */
function parseAnalyticsResponse(response: AnalyticsQueryResponse): AnalyticsRow[] {
  if (!response.columns || !response.results) {
    return [];
  }

  const headers = response.columns.split(";");
  const rows: AnalyticsRow[] = [];

  for (const line of response.results.split("\n")) {
    if (!line.trim()) continue;

    const values = line.split(";");
    const row: AnalyticsRow = {};

    headers.forEach((header, index) => {
      const raw = values[index] ?? "";
      const num = Number(raw);
      row[header] = isNaN(num) || raw === "" ? raw : num;
    });

    rows.push(row);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Viewer engagement analytics and heatmap data overlay for the Premiere timeline.
 *
 * Wraps the Kaltura `analytics.query` API to provide engagement curves,
 * viewer stats, top moments, and drop-off analysis for a given media entry.
 */
export class AnalyticsService {
  constructor(private client: KalturaClient) {}

  // -----------------------------------------------------------------------
  // Engagement data
  // -----------------------------------------------------------------------

  /**
   * Fetch viewer engagement analytics (play / drop-off heat by time).
   *
   * Returns a per-time-bucket breakdown of plays, drop-off counts, and the
   * percentage of the audience still watching at each point.
   */
  async getEngagementData(
    entryId: string,
    granularity: EngagementGranularity = "10seconds",
  ): Promise<EngagementData> {
    log.debug("Fetching engagement data", { entryId, granularity });

    const response = await this.client.request<AnalyticsQueryResponse>({
      service: "analytics",
      action: "query",
      params: {
        reportType: "engagement_timeline",
        filter: {
          objectType: "KalturaAnalyticsFilter",
          entryIdIn: entryId,
          timeZoneOffset: 0,
        },
        dimension: `time:${GRANULARITY_DIMENSION[granularity]}`,
        metrics: "plays,drop_off,avg_view_drop_off",
        objectIds: entryId,
      },
    });

    const rows = parseAnalyticsResponse(response);

    let totalPlays = 0;
    let completionSum = 0;

    const dataPoints: EngagementDataPoint[] = rows.map((row) => {
      const plays = Number(row.plays ?? 0);
      const dropOff = Number(row.drop_off ?? 0);
      const percentViewed = Number(row.avg_view_drop_off ?? 0);

      totalPlays += plays;
      completionSum += percentViewed;

      return {
        timestamp: Number(row.time ?? 0),
        plays,
        dropOff,
        percentViewed,
      };
    });

    const avgCompletion = dataPoints.length > 0 ? completionSum / dataPoints.length : 0;

    return { entryId, dataPoints, totalPlays, avgCompletion };
  }

  // -----------------------------------------------------------------------
  // Viewer stats
  // -----------------------------------------------------------------------

  /** Total plays, unique viewers, average completion rate, and average view duration. */
  async getViewerStats(entryId: string): Promise<ViewerStats> {
    log.debug("Fetching viewer stats", { entryId });

    const response = await this.client.request<AnalyticsQueryResponse>({
      service: "analytics",
      action: "query",
      params: {
        reportType: "player_engagement",
        filter: {
          objectType: "KalturaAnalyticsFilter",
          entryIdIn: entryId,
          timeZoneOffset: 0,
        },
        metrics:
          "plays,unique_viewers,avg_completion_rate,avg_view_duration,peak_concurrent_viewers",
        objectIds: entryId,
      },
    });

    const rows = parseAnalyticsResponse(response);
    const row = rows[0] ?? {};

    return {
      totalPlays: Number(row.plays ?? 0),
      uniqueViewers: Number(row.unique_viewers ?? 0),
      avgCompletionRate: Number(row.avg_completion_rate ?? 0),
      avgViewDuration: Number(row.avg_view_duration ?? 0),
      peakConcurrentViewers: Number(row.peak_concurrent_viewers ?? 0),
    };
  }

  // -----------------------------------------------------------------------
  // Top moments
  // -----------------------------------------------------------------------

  /**
   * Identify the N most-viewed / replayed moments in the video.
   *
   * Fetches second-level engagement data, ranks time windows by replay count,
   * and returns the top `count` moments.
   */
  async getTopMoments(entryId: string, count: number = 5): Promise<TopMoment[]> {
    log.debug("Fetching top moments", { entryId, count });

    const response = await this.client.request<AnalyticsQueryResponse>({
      service: "analytics",
      action: "query",
      params: {
        reportType: "top_moments",
        filter: {
          objectType: "KalturaAnalyticsFilter",
          entryIdIn: entryId,
          timeZoneOffset: 0,
        },
        dimension: "time:1",
        metrics: "replays,plays",
        objectIds: entryId,
        orderBy: "-replays",
        pageSize: count,
        pageIndex: 1,
      },
    });

    const rows = parseAnalyticsResponse(response);

    return rows.map((row) => ({
      startTime: Number(row.time ?? 0),
      endTime: Number(row.time ?? 0) + 1,
      replayCount: Number(row.replays ?? 0),
      label: row.label ? String(row.label) : undefined,
    }));
  }

  // -----------------------------------------------------------------------
  // Drop-off points
  // -----------------------------------------------------------------------

  /**
   * Identify significant viewer drop-off points.
   *
   * Fetches second-level engagement data and returns every point where the
   * audience drop-off exceeds `threshold` percent (default 20 %).
   */
  async getDropOffPoints(entryId: string, threshold: number = 20): Promise<DropOffPoint[]> {
    log.debug("Fetching drop-off points", { entryId, threshold });

    const { dataPoints } = await this.getEngagementData(entryId, "second");

    const dropOffPoints: DropOffPoint[] = [];

    for (let i = 1; i < dataPoints.length; i++) {
      const prev = dataPoints[i - 1];
      const curr = dataPoints[i];

      if (prev.plays === 0) continue;

      const dropOffRate = ((prev.plays - curr.plays) / prev.plays) * 100;

      if (dropOffRate >= threshold) {
        dropOffPoints.push({
          timestamp: curr.timestamp,
          dropOffRate,
          viewersBefore: prev.plays,
          viewersAfter: curr.plays,
        });
      }
    }

    return dropOffPoints;
  }
}
