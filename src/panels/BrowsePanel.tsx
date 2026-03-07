import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  KalturaMediaEntry,
  KalturaMediaEntryFilter,
  KalturaFlavorAsset,
  KalturaCaptionAsset,
} from "../types/kaltura";
import { MediaService } from "../services/MediaService";
import { MetadataService } from "../services/MetadataService";
import {
  LoadingSpinner,
  EmptyState,
  ErrorBanner,
  FilterBar,
  FilterState,
  defaultFilters,
  countActiveFilters,
  dateRangeToTimestamp,
  QualityPicker,
  MetadataEditor,
} from "../components";
import { useDebounce } from "../hooks/useDebounce";
import {
  DEFAULT_PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
  INFINITE_SCROLL_THRESHOLD_PX,
} from "../utils/constants";
import { buildGridThumbnailUrl } from "../utils/thumbnail";
import { formatDuration, formatDate, formatFileSize, truncate } from "../utils/format";
import { getUserMessage } from "../utils/errors";

interface BrowsePanelProps {
  mediaService: MediaService;
  metadataService: MetadataService;
  partnerId: number;
  userId?: string;
  isImported: (entryId: string) => boolean;
  onSelectEntry: (entry: KalturaMediaEntry) => void;
  onImportEntry: (entry: KalturaMediaEntry, flavor: KalturaFlavorAsset) => void;
}

interface EntryDetails {
  entry: KalturaMediaEntry;
  flavors: KalturaFlavorAsset[];
  captions: KalturaCaptionAsset[];
}

export const BrowsePanel: React.FC<BrowsePanelProps> = ({
  mediaService,
  metadataService,
  partnerId,
  userId,
  isImported,
  onSelectEntry,
  onImportEntry,
}) => {
  const [entries, setEntries] = useState<KalturaMediaEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedEntry, setSelectedEntry] = useState<EntryDetails | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [showQualityPicker, setShowQualityPicker] = useState(false);
  const [selectedFlavor, setSelectedFlavor] = useState<KalturaFlavorAsset | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const debouncedSearch = useDebounce(searchText, SEARCH_DEBOUNCE_MS);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeFilterCount = countActiveFilters(filters);

  const buildFilter = useCallback((): KalturaMediaEntryFilter => {
    const filter: KalturaMediaEntryFilter = {};

    if (debouncedSearch) {
      filter.searchTextMatchAnd = debouncedSearch;
    }
    if (filters.mediaType !== null) {
      filter.mediaTypeEqual = filters.mediaType;
    }
    if (filters.dateRange) {
      filter.createdAtGreaterThanOrEqual = dateRangeToTimestamp(filters.dateRange);
    }
    if (filters.ownerFilter === "mine" && userId) {
      filter.userIdEqual = userId;
    }
    if (filters.categoryId !== null) {
      filter.categoryAncestorIdIn = String(filters.categoryId);
    }

    filter.orderBy = "-createdAt";
    return filter;
  }, [debouncedSearch, filters, userId]);

  const loadEntries = useCallback(
    async (pageIndex: number, append: boolean = false) => {
      if (pageIndex === 1) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);

      try {
        const filter = buildFilter();
        const result = await mediaService.list(filter, {
          pageSize: DEFAULT_PAGE_SIZE,
          pageIndex,
        });

        setEntries((prev) => (append ? [...prev, ...result.objects] : result.objects));
        setTotalCount(result.totalCount);
        setPage(pageIndex);
      } catch (err) {
        setError(getUserMessage(err));
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [buildFilter, mediaService],
  );

  // Reload when search or filters change
  useEffect(() => {
    loadEntries(1);
  }, [loadEntries]);

  // Infinite scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || isLoadingMore || isLoading) return;

    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    const hasMore = entries.length < totalCount;

    if (remaining < INFINITE_SCROLL_THRESHOLD_PX && hasMore) {
      loadEntries(page + 1, true);
    }
  }, [entries.length, totalCount, page, isLoadingMore, isLoading, loadEntries]);

  const handleEntryClick = useCallback(
    async (entry: KalturaMediaEntry) => {
      onSelectEntry(entry);
      try {
        const details = await mediaService.getEntryDetails(entry.id);
        setSelectedEntry(details);
        setShowDetail(true);
      } catch {
        setSelectedEntry({ entry, flavors: [], captions: [] });
        setShowDetail(true);
      }
    },
    [mediaService, onSelectEntry],
  );

  const handleBackToGrid = useCallback(() => {
    setShowDetail(false);
    setSelectedEntry(null);
    setShowQualityPicker(false);
    setSelectedFlavor(null);
    setIsEditing(false);
  }, []);

  const handleImportClick = useCallback(() => {
    if (!selectedEntry || selectedEntry.flavors.length === 0) return;
    if (selectedEntry.flavors.length === 1) {
      onImportEntry(selectedEntry.entry, selectedEntry.flavors[0]);
      return;
    }
    // Pre-select the smallest web flavor as default
    const webFlavors = selectedEntry.flavors.filter((f) => f.isWeb);
    const defaultFlavor =
      webFlavors.length > 0
        ? webFlavors.reduce((a, b) => ((a.height || 0) < (b.height || 0) ? a : b))
        : selectedEntry.flavors[0];
    setSelectedFlavor(defaultFlavor);
    setShowQualityPicker(true);
  }, [selectedEntry, onImportEntry]);

  const handleQualityConfirm = useCallback(() => {
    if (selectedEntry && selectedFlavor) {
      onImportEntry(selectedEntry.entry, selectedFlavor);
      setShowQualityPicker(false);
    }
  }, [selectedEntry, selectedFlavor, onImportEntry]);

  const handleMetadataSaved = useCallback(
    (updated: KalturaMediaEntry) => {
      setIsEditing(false);
      if (selectedEntry) {
        setSelectedEntry({ ...selectedEntry, entry: updated });
      }
      // Update in the grid
      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    },
    [selectedEntry],
  );

  // Metadata editor view
  if (isEditing && selectedEntry) {
    return (
      <MetadataEditor
        entry={selectedEntry.entry}
        metadataService={metadataService}
        onSave={handleMetadataSaved}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  // Asset detail flyout
  if (showDetail && selectedEntry) {
    return (
      <AssetDetail
        details={selectedEntry}
        partnerId={partnerId}
        onBack={handleBackToGrid}
        onImport={handleImportClick}
        onEdit={() => setIsEditing(true)}
        isImported={isImported(selectedEntry.entry.id)}
        showQualityPicker={showQualityPicker}
        selectedFlavor={selectedFlavor}
        onFlavorSelect={setSelectedFlavor}
        onQualityCancel={() => setShowQualityPicker(false)}
        onQualityConfirm={handleQualityConfirm}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search bar */}
      <div style={{ padding: "8px", display: "flex", gap: "8px", alignItems: "center" }}>
        <sp-search
          placeholder="Search assets..."
          value={searchText}
          onInput={(e: Event) => setSearchText((e.target as HTMLInputElement).value)}
          onSubmit={(e: Event) => e.preventDefault()}
          style={{ flex: 1 }}
        />
        <sp-action-button
          quiet
          size="s"
          onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
          title={viewMode === "grid" ? "Switch to list view" : "Switch to grid view"}
        >
          {viewMode === "grid" ? "\u2630" : "\u229E"}
        </sp-action-button>
      </div>

      {/* Filter bar */}
      <FilterBar
        filters={filters}
        onFiltersChange={setFilters}
        activeFilterCount={activeFilterCount}
      />

      {/* Result count */}
      {!isLoading && (
        <div
          style={{
            padding: "4px 8px",
            fontSize: "11px",
            color: "var(--spectrum-global-color-gray-600)",
          }}
        >
          {totalCount > 0
            ? `Showing ${entries.length} of ${totalCount} results`
            : searchText || activeFilterCount > 0
              ? "No results"
              : ""}
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={() => loadEntries(1)} />}

      {/* Content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: "auto", padding: "4px" }}
      >
        {isLoading ? (
          <LoadingSpinner label="Loading assets..." />
        ) : entries.length === 0 ? (
          <EmptyState
            title={searchText || activeFilterCount > 0 ? "No results found" : "No assets yet"}
            description={
              searchText || activeFilterCount > 0
                ? "Try different search terms or clear filters."
                : "Your Kaltura library is empty."
            }
          />
        ) : viewMode === "grid" ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              justifyContent: "flex-start",
            }}
          >
            {entries.map((entry) => (
              <ThumbnailCard
                key={entry.id}
                entry={entry}
                partnerId={partnerId}
                imported={isImported(entry.id)}
                onClick={() => handleEntryClick(entry)}
                onDoubleClick={() => {
                  // Quick import with first web flavor
                  mediaService.getEntryDetails(entry.id).then((details) => {
                    const webFlavor = details.flavors.find((f) => f.isWeb);
                    if (webFlavor) onImportEntry(entry, webFlavor);
                    else if (details.flavors.length > 0) onImportEntry(entry, details.flavors[0]);
                  });
                }}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {entries.map((entry) => (
              <ListRow
                key={entry.id}
                entry={entry}
                partnerId={partnerId}
                imported={isImported(entry.id)}
                onClick={() => handleEntryClick(entry)}
                onDoubleClick={() => {
                  mediaService.getEntryDetails(entry.id).then((details) => {
                    const webFlavor = details.flavors.find((f) => f.isWeb);
                    if (webFlavor) onImportEntry(entry, webFlavor);
                    else if (details.flavors.length > 0) onImportEntry(entry, details.flavors[0]);
                  });
                }}
              />
            ))}
          </div>
        )}

        {isLoadingMore && <LoadingSpinner label="Loading more..." size="small" />}
      </div>
    </div>
  );
};

// --- Sub-components ---

interface ThumbnailCardProps {
  entry: KalturaMediaEntry;
  partnerId: number;
  imported: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}

const ThumbnailCard: React.FC<ThumbnailCardProps> = ({
  entry,
  partnerId,
  imported,
  onClick,
  onDoubleClick,
}) => (
  <div
    onClick={onClick}
    onDoubleClick={onDoubleClick}
    style={{
      width: "calc(33.33% - 6px)",
      minWidth: "90px",
      cursor: "pointer",
      borderRadius: "4px",
      overflow: "hidden",
      position: "relative",
      border: "1px solid var(--spectrum-global-color-gray-300)",
    }}
    title={entry.name}
  >
    <div style={{ position: "relative", paddingBottom: "60%" }}>
      <img
        src={buildGridThumbnailUrl(partnerId, entry.id)}
        alt={entry.name}
        loading="lazy"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      {/* Duration badge */}
      {entry.duration > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: 4,
            right: 4,
            backgroundColor: "rgba(0,0,0,0.75)",
            color: "white",
            padding: "1px 4px",
            borderRadius: "2px",
            fontSize: "10px",
          }}
        >
          {formatDuration(entry.duration)}
        </div>
      )}
      {/* Imported indicator */}
      {imported && (
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            backgroundColor: "var(--spectrum-global-color-green-500)",
            color: "white",
            borderRadius: "50%",
            width: 16,
            height: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "10px",
          }}
        >
          \u2713
        </div>
      )}
    </div>
    <div style={{ padding: "4px 6px" }}>
      <div
        style={{
          fontSize: "11px",
          lineHeight: "14px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {truncate(entry.name, 30)}
      </div>
    </div>
  </div>
);

interface ListRowProps {
  entry: KalturaMediaEntry;
  partnerId: number;
  imported: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}

const ListRow: React.FC<ListRowProps> = ({
  entry,
  partnerId,
  imported,
  onClick,
  onDoubleClick,
}) => (
  <div
    onClick={onClick}
    onDoubleClick={onDoubleClick}
    style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "4px 8px",
      cursor: "pointer",
      borderRadius: "4px",
      border: "1px solid transparent",
    }}
  >
    <img
      src={buildGridThumbnailUrl(partnerId, entry.id)}
      alt=""
      loading="lazy"
      style={{ width: 80, height: 45, objectFit: "cover", borderRadius: "2px" }}
    />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: "12px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {imported && "\u2713 "}
        {entry.name}
      </div>
      <div style={{ fontSize: "10px", color: "var(--spectrum-global-color-gray-600)" }}>
        {formatDuration(entry.duration)} \u00B7 {formatDate(entry.createdAt)}
      </div>
    </div>
  </div>
);

interface AssetDetailProps {
  details: EntryDetails;
  partnerId: number;
  onBack: () => void;
  onImport: () => void;
  onEdit: () => void;
  isImported: boolean;
  showQualityPicker: boolean;
  selectedFlavor: KalturaFlavorAsset | null;
  onFlavorSelect: (flavor: KalturaFlavorAsset) => void;
  onQualityCancel: () => void;
  onQualityConfirm: () => void;
}

const AssetDetail: React.FC<AssetDetailProps> = ({
  details,
  partnerId,
  onBack,
  onImport,
  onEdit,
  isImported,
  showQualityPicker,
  selectedFlavor,
  onFlavorSelect,
  onQualityCancel,
  onQualityConfirm,
}) => {
  const { entry, flavors, captions } = details;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "8px" }}>
      <div style={{ padding: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
        <sp-action-button quiet size="s" onClick={onBack}>
          \u2190 Back
        </sp-action-button>
        <sp-heading
          size="XS"
          style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {entry.name}
        </sp-heading>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
        <img
          src={buildGridThumbnailUrl(partnerId, entry.id)}
          alt={entry.name}
          style={{ width: "100%", borderRadius: "4px", marginBottom: "12px" }}
        />

        {/* Quality picker overlay */}
        {showQualityPicker && (
          <QualityPicker
            flavors={flavors}
            selectedFlavorId={selectedFlavor?.id ?? null}
            onSelect={onFlavorSelect}
            onCancel={onQualityCancel}
            onConfirm={onQualityConfirm}
          />
        )}

        <sp-detail size="M">Details</sp-detail>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            padding: "8px 0",
            fontSize: "12px",
          }}
        >
          <div>
            <strong>Duration:</strong> {formatDuration(entry.duration)}
          </div>
          <div>
            <strong>Created:</strong> {formatDate(entry.createdAt)}
          </div>
          {entry.description && (
            <div>
              <strong>Description:</strong> {entry.description}
            </div>
          )}
          {entry.tags && (
            <div>
              <strong>Tags:</strong> {entry.tags}
            </div>
          )}
          {entry.categories && (
            <div>
              <strong>Categories:</strong> {entry.categories}
            </div>
          )}
          <div>
            <strong>Entry ID:</strong>{" "}
            <span style={{ fontFamily: "monospace", fontSize: "11px" }}>{entry.id}</span>
          </div>
          {entry.userId && (
            <div>
              <strong>Owner:</strong> {entry.userId}
            </div>
          )}
        </div>

        {flavors.length > 0 && (
          <>
            <sp-detail size="M">Available Qualities ({flavors.length})</sp-detail>
            <div style={{ padding: "8px 0", fontSize: "11px" }}>
              {flavors.map((f) => (
                <div key={f.id} style={{ padding: "2px 0" }}>
                  {f.width}\u00D7{f.height} \u00B7 {f.fileExt} \u00B7{" "}
                  {formatFileSize(f.size * 1024)}
                  {f.isOriginal && " (Original)"}
                  {f.isWeb && " (Web)"}
                </div>
              ))}
            </div>
          </>
        )}

        {captions.length > 0 && (
          <>
            <sp-detail size="M">Caption Tracks ({captions.length})</sp-detail>
            <div style={{ padding: "8px 0", fontSize: "11px" }}>
              {captions.map((c) => (
                <div key={c.id} style={{ padding: "2px 0" }}>
                  {c.language} \u00B7 {c.label} {c.isDefault && "(Default)"}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ padding: "8px", display: "flex", gap: "8px" }}>
        <sp-button variant="secondary" size="s" onClick={onEdit} style={{ flex: 1 }}>
          Edit Metadata
        </sp-button>
        <sp-button
          variant="accent"
          onClick={onImport}
          disabled={isImported || flavors.length === 0 || undefined}
          style={{ flex: 1 }}
        >
          {isImported ? "Already Imported" : "Import to Project"}
        </sp-button>
      </div>
    </div>
  );
};
