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
  CONTENT_HOLD_TAG,
  HOLD_REASON_PREFIX,
  LICENSE_EXPIRY_WARNING_SECONDS,
} from "../utils/constants";
import { buildGridThumbnailUrl } from "../utils/thumbnail";
import { formatDuration, formatDate, formatFileSize, truncate } from "../utils/format";
import { getUserMessage } from "../utils/errors";

/** Check if an entry is under content hold (governance) */
function isContentHeld(entry: KalturaMediaEntry): boolean {
  return Boolean(entry.adminTags && entry.adminTags.includes(CONTENT_HOLD_TAG));
}

/** Extract hold reason from adminTags */
function getHoldReason(entry: KalturaMediaEntry): string | null {
  if (!entry.adminTags) return null;
  const prefix = HOLD_REASON_PREFIX;
  const idx = entry.adminTags.indexOf(prefix);
  if (idx === -1) return null;
  const afterPrefix = entry.adminTags.slice(idx + prefix.length);
  const commaIdx = afterPrefix.indexOf(",");
  return commaIdx === -1 ? afterPrefix : afterPrefix.slice(0, commaIdx);
}

/** Check if entry has an end date that is expiring soon or expired */
function getLicenseStatus(entry: KalturaMediaEntry): "expired" | "expiring" | "active" | null {
  if (!entry.endDate || entry.endDate === 0) return null;
  const now = Math.floor(Date.now() / 1000);
  if (entry.endDate < now) return "expired";
  if (entry.endDate - now < LICENSE_EXPIRY_WARNING_SECONDS) return "expiring";
  return "active";
}

/** Duck-typed SearchService for enhanced transcript/in-video search */
interface SearchServiceLike {
  searchTranscripts(
    entryId: string,
    searchText: string,
  ): Promise<{ startTime: number; endTime: number; text: string; highlight: string }[]>;
}

/** Duck-typed BatchService for bulk operations */
interface BatchServiceLike {
  batchDelete(entryIds: string[]): Promise<{ total: number; successful: number }>;
  batchUpdateMetadata(
    updates: { entryId: string; name?: string; tags?: string }[],
  ): Promise<{ total: number; successful: number }>;
}

/** Duck-typed AuditService for access control and DRM info */
interface AuditServiceLike {
  getAccessControlProfile(profileId: number): Promise<{
    id: number;
    name: string;
    restrictions: { type: string; description: string }[];
  } | null>;
  getEntryDrmPolicy(entryId: string): Promise<{ provider: string; licenseUrl?: string }[]>;
}

/** Duck-typed ProxyService for proxy editing workflow */
interface ProxyServiceLike {
  isProxyLoaded(entryId: string): boolean;
  downloadProxy(entryId: string, onProgress?: (percent: number) => void): Promise<unknown>;
  reconnectToOriginal(entryId: string): Promise<unknown>;
}

/** Duck-typed OfflineService for caching */
interface OfflineServiceLike {
  getIsOnline(): boolean;
  isCached(entryId: string): boolean;
  cacheEntries(entries: KalturaMediaEntry[]): void;
  getCachedEntries(): { entry: KalturaMediaEntry; cachedAt: number }[];
  getSyncStatus(): { isOnline: boolean; pendingOperations: number; cacheEntryCount: number };
  onStatusChange(listener: (online: boolean) => void): () => void;
}

interface BrowsePanelProps {
  mediaService: MediaService;
  metadataService: MetadataService;
  searchService?: SearchServiceLike;
  batchService?: BatchServiceLike;
  auditService?: AuditServiceLike;
  offlineService?: OfflineServiceLike;
  proxyService?: ProxyServiceLike;
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
  searchService,
  batchService,
  auditService,
  offlineService,
  proxyService: _proxyService,
  partnerId,
  userId,
  isImported,
  onSelectEntry,
  onImportEntry,
}) => {
  const [entries, setEntries] = useState<KalturaMediaEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [isOffline, setIsOffline] = useState(!offlineService?.getIsOnline());
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

        // Cache results for offline access
        if (offlineService && result.objects.length > 0) {
          offlineService.cacheEntries(result.objects);
        }
      } catch (err) {
        setError(getUserMessage(err));
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [buildFilter, mediaService],
  );

  // Subscribe to offline status changes
  useEffect(() => {
    if (!offlineService) return;
    return offlineService.onStatusChange((online) => {
      setIsOffline(!online);
      if (online) loadEntries(1); // Refresh when coming back online
    });
  }, [offlineService, loadEntries]);

  // Reload when search or filters change
  useEffect(() => {
    if (isOffline && offlineService) {
      // Show cached entries when offline
      const cached = offlineService.getCachedEntries();
      const cachedEntries = cached.map((c) => c.entry);
      setEntries(cachedEntries);
      setTotalCount(cachedEntries.length);
      return;
    }
    loadEntries(1);
  }, [loadEntries, isOffline, offlineService]);

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
    if (isContentHeld(selectedEntry.entry)) return;
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
        onDelete={
          batchService
            ? async () => {
                await batchService.batchDelete([selectedEntry.entry.id]);
                handleBackToGrid();
                loadEntries(1);
              }
            : undefined
        }
        isImported={isImported(selectedEntry.entry.id)}
        showQualityPicker={showQualityPicker}
        selectedFlavor={selectedFlavor}
        onFlavorSelect={setSelectedFlavor}
        onQualityCancel={() => setShowQualityPicker(false)}
        onQualityConfirm={handleQualityConfirm}
        auditService={auditService}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search bar */}
      <div style={{ padding: "8px", display: "flex", gap: "8px", alignItems: "center" }}>
        <sp-search
          placeholder={searchService ? "Search assets & transcripts..." : "Search assets..."}
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

      {/* Offline mode banner */}
      {isOffline && (
        <div
          style={{
            padding: "6px 8px",
            backgroundColor: "var(--spectrum-global-color-yellow-100)",
            borderBottom: "1px solid var(--spectrum-global-color-yellow-400)",
            fontSize: "11px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span style={{ fontSize: "14px" }}>{"\u26A0"}</span>
          <span>
            <strong>Offline Mode</strong> — Showing {entries.length} cached assets.
            {offlineService && offlineService.getSyncStatus().pendingOperations > 0 && (
              <span>
                {" "}
                {offlineService.getSyncStatus().pendingOperations} pending operations will sync when
                online.
              </span>
            )}
          </span>
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
                  if (isContentHeld(entry)) return; // Block import for held entries
                  mediaService
                    .getEntryDetails(entry.id)
                    .then((details) => {
                      const webFlavor = details.flavors.find((f) => f.isWeb);
                      if (webFlavor) onImportEntry(entry, webFlavor);
                      else if (details.flavors.length > 0) onImportEntry(entry, details.flavors[0]);
                    })
                    .catch(() => {
                      /* detail fetch failed — ignore double-click */
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
                  if (isContentHeld(entry)) return; // Block import for held entries
                  mediaService
                    .getEntryDetails(entry.id)
                    .then((details) => {
                      const webFlavor = details.flavors.find((f) => f.isWeb);
                      if (webFlavor) onImportEntry(entry, webFlavor);
                      else if (details.flavors.length > 0) onImportEntry(entry, details.flavors[0]);
                    })
                    .catch(() => {
                      /* detail fetch failed — ignore double-click */
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
      {/* Content hold badge */}
      {isContentHeld(entry) && (
        <div
          style={{
            position: "absolute",
            top: 4,
            left: 4,
            backgroundColor: "var(--spectrum-global-color-red-500)",
            color: "white",
            padding: "1px 5px",
            borderRadius: "2px",
            fontSize: "9px",
            fontWeight: "bold",
            letterSpacing: "0.5px",
          }}
          title={getHoldReason(entry) ?? "Content held"}
        >
          HOLD
        </div>
      )}
      {/* License expiry badge */}
      {getLicenseStatus(entry) === "expired" && (
        <div
          style={{
            position: "absolute",
            top: isContentHeld(entry) ? 20 : 4,
            left: 4,
            backgroundColor: "var(--spectrum-global-color-orange-500)",
            color: "white",
            padding: "1px 5px",
            borderRadius: "2px",
            fontSize: "9px",
            fontWeight: "bold",
          }}
        >
          EXPIRED
        </div>
      )}
      {getLicenseStatus(entry) === "expiring" && (
        <div
          style={{
            position: "absolute",
            top: isContentHeld(entry) ? 20 : 4,
            left: 4,
            backgroundColor: "var(--spectrum-global-color-yellow-600)",
            color: "white",
            padding: "1px 5px",
            borderRadius: "2px",
            fontSize: "9px",
            fontWeight: "bold",
          }}
          title={`Expires: ${formatDate(entry.endDate!)}`}
        >
          EXPIRING
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
          color: isContentHeld(entry) ? "var(--spectrum-global-color-red-600)" : undefined,
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
          color: isContentHeld(entry) ? "var(--spectrum-global-color-red-600)" : undefined,
        }}
      >
        {isContentHeld(entry) && (
          <span
            style={{
              backgroundColor: "var(--spectrum-global-color-red-500)",
              color: "white",
              padding: "0 4px",
              borderRadius: "2px",
              fontSize: "9px",
              fontWeight: "bold",
              marginRight: "4px",
            }}
          >
            HOLD
          </span>
        )}
        {imported && "\u2713 "}
        {entry.name}
      </div>
      <div style={{ fontSize: "10px", color: "var(--spectrum-global-color-gray-600)" }}>
        {formatDuration(entry.duration)} \u00B7 {formatDate(entry.createdAt)}
        {isContentHeld(entry) && (
          <span style={{ color: "var(--spectrum-global-color-red-500)", marginLeft: "4px" }}>
            {getHoldReason(entry) ? `Hold: ${getHoldReason(entry)}` : "Content held"}
          </span>
        )}
        {getLicenseStatus(entry) === "expired" && (
          <span style={{ color: "var(--spectrum-global-color-orange-600)", marginLeft: "4px" }}>
            License expired
          </span>
        )}
        {getLicenseStatus(entry) === "expiring" && (
          <span style={{ color: "var(--spectrum-global-color-yellow-700)", marginLeft: "4px" }}>
            Expiring: {formatDate(entry.endDate!)}
          </span>
        )}
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
  onDelete?: () => void;
  isImported: boolean;
  showQualityPicker: boolean;
  selectedFlavor: KalturaFlavorAsset | null;
  onFlavorSelect: (flavor: KalturaFlavorAsset) => void;
  onQualityCancel: () => void;
  onQualityConfirm: () => void;
  auditService?: AuditServiceLike;
}

const AssetDetail: React.FC<AssetDetailProps> = ({
  details,
  partnerId,
  onBack,
  onImport,
  onEdit,
  onDelete,
  isImported,
  showQualityPicker,
  selectedFlavor,
  onFlavorSelect,
  onQualityCancel,
  onQualityConfirm,
  auditService,
}) => {
  const { entry, flavors, captions } = details;

  const [accessControl, setAccessControl] = useState<{
    name: string;
    restrictions: { type: string; description: string }[];
  } | null>(null);
  const [drmPolicies, setDrmPolicies] = useState<{ provider: string }[]>([]);

  useEffect(() => {
    if (!auditService) return;
    if (entry.accessControlId) {
      auditService.getAccessControlProfile(entry.accessControlId).then((profile) => {
        if (profile) setAccessControl({ name: profile.name, restrictions: profile.restrictions });
      });
    }
    auditService.getEntryDrmPolicy(entry.id).then(setDrmPolicies);
  }, [auditService, entry.accessControlId, entry.id]);

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
          {isContentHeld(entry) && (
            <div
              style={{
                marginTop: "8px",
                padding: "8px",
                backgroundColor: "var(--spectrum-global-color-red-100)",
                border: "1px solid var(--spectrum-global-color-red-400)",
                borderRadius: "4px",
                fontSize: "12px",
              }}
            >
              <strong style={{ color: "var(--spectrum-global-color-red-700)" }}>
                Content Hold
              </strong>
              <div style={{ marginTop: "4px", color: "var(--spectrum-global-color-red-600)" }}>
                {getHoldReason(entry)
                  ? `Reason: ${getHoldReason(entry)}`
                  : "This entry is under content hold and cannot be imported."}
              </div>
            </div>
          )}
          {(getLicenseStatus(entry) === "expired" || getLicenseStatus(entry) === "expiring") && (
            <div
              style={{
                marginTop: "8px",
                padding: "8px",
                backgroundColor:
                  getLicenseStatus(entry) === "expired"
                    ? "var(--spectrum-global-color-orange-100)"
                    : "var(--spectrum-global-color-yellow-100)",
                border: `1px solid ${
                  getLicenseStatus(entry) === "expired"
                    ? "var(--spectrum-global-color-orange-400)"
                    : "var(--spectrum-global-color-yellow-400)"
                }`,
                borderRadius: "4px",
                fontSize: "12px",
              }}
            >
              <strong
                style={{
                  color:
                    getLicenseStatus(entry) === "expired"
                      ? "var(--spectrum-global-color-orange-700)"
                      : "var(--spectrum-global-color-yellow-700)",
                }}
              >
                {getLicenseStatus(entry) === "expired"
                  ? "License Expired"
                  : "License Expiring Soon"}
              </strong>
              <div style={{ marginTop: "4px" }}>
                {getLicenseStatus(entry) === "expired"
                  ? `This content's license expired on ${formatDate(entry.endDate!)}.`
                  : `This content's license expires on ${formatDate(entry.endDate!)}. Review usage rights before importing.`}
              </div>
            </div>
          )}
        </div>

        {/* Access control preview */}
        {accessControl && (
          <>
            <sp-detail size="M">Access Control</sp-detail>
            <div
              style={{
                padding: "8px 0",
                fontSize: "12px",
              }}
            >
              <div>
                <strong>Profile:</strong> {accessControl.name}
              </div>
              {accessControl.restrictions.length > 0 && (
                <div style={{ marginTop: "4px" }}>
                  <strong>Restrictions:</strong>
                  <ul style={{ margin: "4px 0 0 16px", padding: 0, fontSize: "11px" }}>
                    {accessControl.restrictions.map((r, i) => (
                      <li key={i}>{r.description}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}

        {/* DRM policy indicators */}
        {drmPolicies.length > 0 && drmPolicies[0].provider !== "none" && (
          <>
            <sp-detail size="M">DRM Protection</sp-detail>
            <div
              style={{
                padding: "8px 0",
                fontSize: "12px",
                display: "flex",
                gap: "6px",
                flexWrap: "wrap",
              }}
            >
              {drmPolicies.map((drm, i) => (
                <span
                  key={i}
                  style={{
                    padding: "2px 8px",
                    borderRadius: "3px",
                    backgroundColor: "var(--spectrum-global-color-blue-100)",
                    color: "var(--spectrum-global-color-blue-700)",
                    fontSize: "11px",
                    fontWeight: 600,
                  }}
                >
                  {drm.provider.toUpperCase()}
                </span>
              ))}
            </div>
          </>
        )}

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
        {onDelete && (
          <sp-action-button quiet size="s" onClick={onDelete} title="Delete entry">
            \u2716
          </sp-action-button>
        )}
        <sp-button variant="secondary" size="s" onClick={onEdit} style={{ flex: 1 }}>
          Edit Metadata
        </sp-button>
        <sp-button
          variant="accent"
          onClick={onImport}
          disabled={isImported || isContentHeld(entry) || flavors.length === 0 || undefined}
          style={{ flex: 1 }}
        >
          {isImported
            ? "Already Imported"
            : isContentHeld(entry)
              ? "Import Blocked (Hold)"
              : "Import to Project"}
        </sp-button>
      </div>
    </div>
  );
};
