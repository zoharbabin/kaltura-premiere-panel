import React, { useState, useCallback } from "react";
import { KalturaMediaType } from "../types/kaltura";

export interface FilterState {
  mediaType: KalturaMediaType | null;
  dateRange: DateRange | null;
  ownerFilter: OwnerFilter;
  categoryId: number | null;
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
    <div style={{ borderBottom: "1px solid var(--spectrum-global-color-gray-300)" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "4px 8px", gap: "8px" }}>
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
            gap: "8px",
            padding: "4px 8px 8px",
          }}
        >
          {/* Media Type */}
          <sp-picker
            size="s"
            label="Type"
            value={filters.mediaType?.toString() ?? ""}
            onChange={(e: Event) => {
              const val = (e.target as HTMLSelectElement).value;
              updateFilter("mediaType", val ? (parseInt(val) as KalturaMediaType) : null);
            }}
            style={{ minWidth: "100px" }}
          >
            <sp-menu-item value="">All types</sp-menu-item>
            <sp-menu-item value={String(KalturaMediaType.VIDEO)}>Video</sp-menu-item>
            <sp-menu-item value={String(KalturaMediaType.AUDIO)}>Audio</sp-menu-item>
            <sp-menu-item value={String(KalturaMediaType.IMAGE)}>Image</sp-menu-item>
          </sp-picker>

          {/* Date Range */}
          <sp-picker
            size="s"
            label="Date"
            value={filters.dateRange ?? ""}
            onChange={(e: Event) => {
              const val = (e.target as HTMLSelectElement).value;
              updateFilter("dateRange", (val as DateRange) || null);
            }}
            style={{ minWidth: "100px" }}
          >
            <sp-menu-item value="">Any time</sp-menu-item>
            <sp-menu-item value="week">Last week</sp-menu-item>
            <sp-menu-item value="month">Last month</sp-menu-item>
            <sp-menu-item value="quarter">Last quarter</sp-menu-item>
            <sp-menu-item value="year">Last year</sp-menu-item>
          </sp-picker>

          {/* Owner */}
          <sp-picker
            size="s"
            label="Owner"
            value={filters.ownerFilter}
            onChange={(e: Event) => {
              updateFilter("ownerFilter", (e.target as HTMLSelectElement).value as OwnerFilter);
            }}
            style={{ minWidth: "100px" }}
          >
            <sp-menu-item value="all">All content</sp-menu-item>
            <sp-menu-item value="mine">My content</sp-menu-item>
          </sp-picker>
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
