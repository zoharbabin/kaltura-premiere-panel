import React, { useState, useCallback } from "react";
import { KalturaMediaType } from "../types/kaltura";

export interface FilterState {
  mediaType: KalturaMediaType | null;
  dateRange: DateRange | null;
  ownerFilter: OwnerFilter;
  categoryId: number | null;
  withCaptionsOnly: boolean;
}

export type DateRange = "week" | "month" | "quarter" | "year" | null;
export type OwnerFilter = "all" | "mine";

interface FilterBarProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  activeFilterCount: number;
}

export const defaultFilters: FilterState = {
  mediaType: null,
  dateRange: null,
  ownerFilter: "all",
  categoryId: null,
  withCaptionsOnly: false,
};

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onFiltersChange,
  activeFilterCount,
}) => {
  const [expanded, setExpanded] = useState(false);

  const updateFilter = useCallback(
    <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
      onFiltersChange({ ...filters, [key]: value });
    },
    [filters, onFiltersChange],
  );

  const clearAll = useCallback(() => {
    onFiltersChange(defaultFilters);
  }, [onFiltersChange]);

  return (
    <div className="filter-bar">
      <div style={{ display: "flex", alignItems: "center", padding: "4px 8px" }}>
        <sp-action-button quiet size="s" onClick={() => setExpanded(!expanded)}>
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </sp-action-button>
        {activeFilterCount > 0 && (
          <sp-action-button quiet size="s" onClick={clearAll}>
            Clear all
          </sp-action-button>
        )}
      </div>

      {expanded && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            padding: "4px 8px 8px",
          }}
        >
          {/* Media Type */}
          <select
            className="native-select"
            value={filters.mediaType?.toString() ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              updateFilter("mediaType", val ? (parseInt(val) as KalturaMediaType) : null);
            }}
            style={{ minWidth: "100px", maxWidth: "140px", marginRight: "8px" }}
          >
            <option value="">All types</option>
            <option value={String(KalturaMediaType.VIDEO)}>Video</option>
            <option value={String(KalturaMediaType.AUDIO)}>Audio</option>
            <option value={String(KalturaMediaType.IMAGE)}>Image</option>
          </select>

          {/* Date Range */}
          <select
            className="native-select"
            value={filters.dateRange ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              updateFilter("dateRange", (val as DateRange) || null);
            }}
            style={{ minWidth: "100px", maxWidth: "140px", marginRight: "8px" }}
          >
            <option value="">Any time</option>
            <option value="week">Last week</option>
            <option value="month">Last month</option>
            <option value="quarter">Last quarter</option>
            <option value="year">Last year</option>
          </select>

          {/* Owner */}
          <select
            className="native-select"
            value={filters.ownerFilter}
            onChange={(e) => {
              updateFilter("ownerFilter", e.target.value as OwnerFilter);
            }}
            style={{ minWidth: "100px", maxWidth: "140px", marginRight: "8px" }}
          >
            <option value="all">All content</option>
            <option value="mine">My content</option>
          </select>

          {/* Has captions */}
          <label
            className="filter-checkbox"
            style={{
              display: "flex",
              alignItems: "center",
              marginRight: "8px",
              fontSize: "11px",
              color: "#8b8b8b",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={filters.withCaptionsOnly}
              onChange={(e) => updateFilter("withCaptionsOnly", e.target.checked)}
              style={{ marginRight: "4px" }}
            />
            Has captions
          </label>
        </div>
      )}
    </div>
  );
};

/** Count active (non-default) filters */
export function countActiveFilters(filters: FilterState): number {
  let count = 0;
  if (filters.mediaType !== null) count++;
  if (filters.dateRange !== null) count++;
  if (filters.ownerFilter !== "all") count++;
  if (filters.categoryId !== null) count++;
  if (filters.withCaptionsOnly) count++;
  return count;
}

/** Convert date range to epoch timestamp */
export function dateRangeToTimestamp(range: DateRange): number | undefined {
  if (!range) return undefined;
  const now = Math.floor(Date.now() / 1000);
  const day = 86400;
  switch (range) {
    case "week":
      return now - 7 * day;
    case "month":
      return now - 30 * day;
    case "quarter":
      return now - 90 * day;
    case "year":
      return now - 365 * day;
    default:
      return undefined;
  }
}
