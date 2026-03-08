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
    setImportError(null);
  }, []);

  const [importError, setImportError] = useState<string | null>(null);

  const handleImportClick = useCallback(() => {
    setImportError(null);
    if (!selectedEntry) return;
    if (isContentHeld(selectedEntry.entry)) {
      setImportError("This entry is under content hold and cannot be imported.");
      return;
    }
    if (selectedEntry.flavors.length === 0) {
      setImportError("No downloadable renditions available for this entry.");
      return;
    }
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
        importError={importError}
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
    <div className="panel-root">
      {/* Search bar */}
      <div className="search-bar">
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
        <div className="result-count">
          {totalCount > 0
            ? `Showing ${entries.length} of ${totalCount} results`
            : searchText || activeFilterCount > 0
              ? "No results"
              : ""}
        </div>
      )}

      {/* Offline mode banner */}
      {isOffline && (
        <div className="offline-banner">
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
      <div ref={scrollRef} onScroll={handleScroll} className="panel-scroll">
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
          <div className="thumb-grid">
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
          <div className="flex-col gap-2">
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
  <div onClick={onClick} onDoubleClick={onDoubleClick} className="thumb-card" title={entry.name}>
    <div className="thumb-card-img-wrap">
      <img src={buildGridThumbnailUrl(partnerId, entry.id)} alt={entry.name} loading="lazy" />
      {entry.duration > 0 && <div className="badge-duration">{formatDuration(entry.duration)}</div>}
      {isContentHeld(entry) && (
        <div className="badge-overlay badge-hold" title={getHoldReason(entry) ?? "Content held"}>
          HOLD
        </div>
      )}
      {getLicenseStatus(entry) === "expired" && (
        <div
          className="badge-overlay badge-expired"
          style={isContentHeld(entry) ? { top: 20 } : undefined}
        >
          EXPIRED
        </div>
      )}
      {getLicenseStatus(entry) === "expiring" && (
        <div
          className="badge-overlay badge-expiring"
          style={isContentHeld(entry) ? { top: 20 } : undefined}
          title={`Expires: ${formatDate(entry.endDate!)}`}
        >
          EXPIRING
        </div>
      )}
      {imported && <div className="badge-imported">{"\u2713"}</div>}
    </div>
    <div className={`thumb-card-label${isContentHeld(entry) ? " text-error" : ""}`}>
      {truncate(entry.name, 30)}
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
  <div onClick={onClick} onDoubleClick={onDoubleClick} className="list-row">
    <img
      src={buildGridThumbnailUrl(partnerId, entry.id)}
      alt=""
      loading="lazy"
      className="list-row-thumb"
    />
    <div className="list-row-info">
      <div className={`list-row-name ellipsis${isContentHeld(entry) ? " text-error" : ""}`}>
        {isContentHeld(entry) && <span className="badge-inline badge-hold">HOLD</span>}
        {imported && "\u2713\u0020"}
        {entry.name}
      </div>
      <div className="list-row-meta">
        {formatDuration(entry.duration)} {"\u00B7"} {formatDate(entry.createdAt)}
        {isContentHeld(entry) && (
          <span className="text-error" style={{ marginLeft: 4 }}>
            {getHoldReason(entry) ? `Hold: ${getHoldReason(entry)}` : "Content held"}
          </span>
        )}
        {getLicenseStatus(entry) === "expired" && (
          <span style={{ color: "var(--spectrum-global-color-orange-600)", marginLeft: 4 }}>
            License expired
          </span>
        )}
        {getLicenseStatus(entry) === "expiring" && (
          <span style={{ color: "var(--spectrum-global-color-yellow-700)", marginLeft: 4 }}>
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
  importError: string | null;
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
  importError,
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
    <div className="panel-root">
      <div className="detail-header">
        <sp-action-button quiet size="s" onClick={onBack}>
          {"\u2190"} Back
        </sp-action-button>
        <sp-heading size="XS" className="flex-1 ellipsis">
          {entry.name}
        </sp-heading>
      </div>

      <div className="detail-scroll">
        <img
          src={buildGridThumbnailUrl(partnerId, entry.id)}
          alt={entry.name}
          className="detail-thumb"
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
        <div className="detail-meta">
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
            <strong>Entry ID:</strong> <span className="text-mono">{entry.id}</span>
          </div>
          {entry.userId && (
            <div>
              <strong>Owner:</strong> {entry.userId}
            </div>
          )}
          {isContentHeld(entry) && (
            <div className="section-info section-info-error">
              <strong>Content Hold</strong>
              <div style={{ marginTop: 4 }}>
                {getHoldReason(entry)
                  ? `Reason: ${getHoldReason(entry)}`
                  : "This entry is under content hold and cannot be imported."}
              </div>
            </div>
          )}
          {(getLicenseStatus(entry) === "expired" || getLicenseStatus(entry) === "expiring") && (
            <div
              className={`section-info ${getLicenseStatus(entry) === "expired" ? "section-info-error" : "section-info-warning"}`}
            >
              <strong>
                {getLicenseStatus(entry) === "expired"
                  ? "License Expired"
                  : "License Expiring Soon"}
              </strong>
              <div style={{ marginTop: 4 }}>
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
            <div className="detail-meta">
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
            <div style={{ padding: "8px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
              {drmPolicies.map((drm, i) => (
                <span key={i} className="badge-drm">
                  {drm.provider.toUpperCase()}
                </span>
              ))}
            </div>
          </>
        )}

        {flavors.length > 0 && (
          <>
            <sp-detail size="M">Available Qualities ({flavors.length})</sp-detail>
            <div style={{ padding: "8px 0" }}>
              {flavors.map((f) => (
                <div key={f.id} className="quality-item">
                  {f.width}
                  {"\u00D7"}
                  {f.height} {"\u00B7"} {f.fileExt} {"\u00B7"} {formatFileSize(f.size * 1024)}
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
            <div style={{ padding: "8px 0" }}>
              {captions.map((c) => (
                <div key={c.id} className="caption-item">
                  {c.language} {"\u00B7"} {c.label} {c.isDefault && "(Default)"}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="detail-actions">
        {importError && (
          <div className="alert-error" style={{ margin: 0 }}>
            {importError}
          </div>
        )}
        <div className="detail-actions-row">
          {onDelete && (
            <sp-action-button quiet size="s" onClick={onDelete} title="Delete entry">
              {"\u2716"}
            </sp-action-button>
          )}
          <sp-button variant="secondary" size="s" onClick={onEdit} style={{ flex: 1 }}>
            Edit Metadata
          </sp-button>
          <sp-button
            variant="accent"
            onClick={onImport}
            disabled={isImported || undefined}
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
    </div>
  );
};
