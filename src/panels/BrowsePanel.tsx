import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  KalturaMediaEntry,
  KalturaMediaEntryFilter,
  KalturaFlavorAsset,
  KalturaCaptionAsset,
} from "../types/kaltura";
import { MediaService } from "../services/MediaService";
import { LoadingSpinner, EmptyState, ErrorBanner } from "../components";
import { useDebounce } from "../hooks/useDebounce";
import {
  DEFAULT_PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
  INFINITE_SCROLL_THRESHOLD_PX,
} from "../utils/constants";
import { buildGridThumbnailUrl } from "../utils/thumbnail";
import { formatDuration, formatDate, truncate } from "../utils/format";
import { getUserMessage } from "../utils/errors";

interface BrowsePanelProps {
  mediaService: MediaService;
  partnerId: number;
  isImported: (entryId: string) => boolean;
  onSelectEntry: (entry: KalturaMediaEntry) => void;
  onImportEntry: (entry: KalturaMediaEntry) => void;
}

interface EntryDetails {
  entry: KalturaMediaEntry;
  flavors: KalturaFlavorAsset[];
  captions: KalturaCaptionAsset[];
}

export const BrowsePanel: React.FC<BrowsePanelProps> = ({
  mediaService,
  partnerId,
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

  const debouncedSearch = useDebounce(searchText, SEARCH_DEBOUNCE_MS);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadEntries = useCallback(
    async (pageIndex: number, append: boolean = false) => {
      if (pageIndex === 1) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);

      try {
        const filter: KalturaMediaEntryFilter = {};
        if (debouncedSearch) {
          filter.searchTextMatchAnd = debouncedSearch;
        }
        filter.orderBy = "-createdAt";

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
    [debouncedSearch, mediaService],
  );

  // Reload when search changes
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
  }, []);

  // Asset detail flyout
  if (showDetail && selectedEntry) {
    return (
      <AssetDetail
        details={selectedEntry}
        partnerId={partnerId}
        onBack={handleBackToGrid}
        onImport={() => onImportEntry(selectedEntry.entry)}
        isImported={isImported(selectedEntry.entry.id)}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search bar */}
      <div style={{ padding: "8px", display: "flex", gap: "8px", alignItems: "center" }}>
        <sp-search
          placeholder="Search assets…"
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
          {viewMode === "grid" ? "☰" : "⊞"}
        </sp-action-button>
      </div>

      {/* Result count */}
      {!isLoading && (
        <div
          style={{
            padding: "0 8px 4px",
            fontSize: "11px",
            color: "var(--spectrum-global-color-gray-600)",
          }}
        >
          {totalCount > 0
            ? `Showing ${entries.length} of ${totalCount} results`
            : searchText
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
          <LoadingSpinner label="Loading assets…" />
        ) : entries.length === 0 ? (
          <EmptyState
            title={searchText ? "No results found" : "No assets yet"}
            description={
              searchText
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
                onDoubleClick={() => onImportEntry(entry)}
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
                onDoubleClick={() => onImportEntry(entry)}
              />
            ))}
          </div>
        )}

        {isLoadingMore && <LoadingSpinner label="Loading more…" size="small" />}
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
          ✓
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
        {imported && "✓ "}
        {entry.name}
      </div>
      <div style={{ fontSize: "10px", color: "var(--spectrum-global-color-gray-600)" }}>
        {formatDuration(entry.duration)} · {formatDate(entry.createdAt)}
      </div>
    </div>
  </div>
);

interface AssetDetailProps {
  details: EntryDetails;
  partnerId: number;
  onBack: () => void;
  onImport: () => void;
  isImported: boolean;
}

const AssetDetail: React.FC<AssetDetailProps> = ({
  details,
  partnerId,
  onBack,
  onImport,
  isImported,
}) => {
  const { entry, flavors, captions } = details;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "8px" }}>
      <div style={{ padding: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
        <sp-action-button quiet size="s" onClick={onBack}>
          ← Back
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
          <div>
            <strong>Entry ID:</strong> {entry.id}
          </div>
        </div>

        {flavors.length > 0 && (
          <>
            <sp-detail size="M">Available Qualities ({flavors.length})</sp-detail>
            <div style={{ padding: "8px 0", fontSize: "11px" }}>
              {flavors.map((f) => (
                <div key={f.id} style={{ padding: "2px 0" }}>
                  {f.width}×{f.height} · {f.fileExt} · {Math.round(f.size / 1024)} MB
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
                  {c.language} · {c.label} {c.isDefault && "(Default)"}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ padding: "8px", display: "flex", gap: "8px" }}>
        <sp-button
          variant="accent"
          onClick={onImport}
          disabled={isImported || undefined}
          style={{ flex: 1 }}
        >
          {isImported ? "Already Imported" : "Import to Project"}
        </sp-button>
      </div>
    </div>
  );
};
