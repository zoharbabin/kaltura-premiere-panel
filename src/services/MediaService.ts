import { KalturaClient } from "./KalturaClient";
import {
  KalturaMediaEntry,
  KalturaFlavorAsset,
  KalturaCaptionAsset,
  KalturaCategory,
  KalturaListResponse,
  KalturaMediaEntryFilter,
  KalturaFilterPager,
  KalturaMediaType,
  KalturaEntryStatus,
  ESearchItemType,
  ESearchOperatorType,
  KalturaESearchItem,
  ESearchResponse,
} from "../types/kaltura";
import { DEFAULT_PAGE_SIZE } from "../utils/constants";
import { createLogger } from "../utils/logger";

const log = createLogger("MediaService");

/** A single highlight match within eSearch browse results */
export interface BrowseHighlight {
  type: "caption" | "metadata" | "content";
  text: string;
  startTime?: number;
  endTime?: number;
}

/** Parameters for eSearch-based browsing */
export type ESearchSortField =
  | "relevance"
  | "updated_at"
  | "created_at"
  | "name"
  | "plays"
  | "last_played_at";

export interface ESearchBrowseParams {
  searchText?: string;
  mediaType?: KalturaMediaType;
  createdAfter?: number;
  createdBefore?: number;
  userId?: string;
  categoryIds?: string;
  withCaptionsOnly?: boolean;
  sortField?: ESearchSortField;
  sortOrder?: "asc" | "desc";
}

/** Result from eSearch browse including highlights */
export interface ESearchBrowseResult {
  totalCount: number;
  entries: KalturaMediaEntry[];
  highlights: Map<string, BrowseHighlight[]>;
}

/** Map raw eSearch item type strings to highlight types */
function resolveHighlightType(itemType: string | undefined): BrowseHighlight["type"] {
  switch (itemType) {
    case "caption":
      return "caption";
    case "metadata":
      return "metadata";
    default:
      return "content";
  }
}

/** Map top-level highlight fieldName to a BrowseHighlight type */
function fieldNameToHighlightType(fieldName: string | undefined): BrowseHighlight["type"] {
  if (!fieldName) return "content";
  if (fieldName.startsWith("caption")) return "caption";
  if (fieldName.startsWith("metadata")) return "metadata";
  return "content";
}

/** Strip HTML tags from eSearch highlight text */
function stripHighlightTags(text: unknown): string {
  if (typeof text !== "string") return String(text ?? "");
  return text.replace(/<\/?em>/g, "");
}

/**
 * Kaltura media operations: browse, search, get details, manage entries.
 */
export class MediaService {
  constructor(private client: KalturaClient) {}

  /** Get the configured service URL (for constructing KMC links) */
  getServerUrl(): string {
    return this.client.getServiceUrl();
  }

  /** List media entries with optional filter and pager */
  async list(
    filter: KalturaMediaEntryFilter = {},
    pager: KalturaFilterPager = { pageSize: DEFAULT_PAGE_SIZE, pageIndex: 1 },
  ): Promise<KalturaListResponse<KalturaMediaEntry>> {
    log.debug("Listing media", { filter, pager });

    return this.client.request<KalturaListResponse<KalturaMediaEntry>>({
      service: "media",
      action: "list",
      params: {
        filter: {
          objectType: "KalturaMediaEntryFilter",
          statusIn: `${KalturaEntryStatus.READY},${KalturaEntryStatus.PENDING},${KalturaEntryStatus.MODERATE}`,
          ...filter,
        },
        pager: {
          objectType: "KalturaFilterPager",
          ...pager,
        },
      },
    });
  }

  /** Get a single entry by ID */
  async get(entryId: string): Promise<KalturaMediaEntry> {
    return this.client.request<KalturaMediaEntry>({
      service: "media",
      action: "get",
      params: { entryId },
    });
  }

  /**
   * Get entry details with flavors and captions in a single HTTP request.
   * Uses multi-request with dependency mapping.
   */
  async getEntryDetails(entryId: string): Promise<{
    entry: KalturaMediaEntry;
    flavors: KalturaFlavorAsset[];
    captions: KalturaCaptionAsset[];
  }> {
    log.debug("Getting entry details (batched)", { entryId });

    const [entry, flavorsResponse, captionsResponse] = await this.client.multiRequest<
      [
        KalturaMediaEntry,
        KalturaListResponse<KalturaFlavorAsset>,
        KalturaListResponse<KalturaCaptionAsset>,
      ]
    >([
      {
        service: "media",
        action: "get",
        params: { entryId },
      },
      {
        service: "flavorAsset",
        action: "list",
        params: {
          filter: {
            objectType: "KalturaFlavorAssetFilter",
            entryIdEqual: entryId,
          },
        },
      },
      {
        service: "caption_captionAsset",
        action: "list",
        params: {
          filter: {
            objectType: "KalturaCaptionAssetFilter",
            entryIdEqual: entryId,
          },
        },
      },
    ]);

    return {
      entry,
      flavors: flavorsResponse.objects || [],
      captions: captionsResponse.objects || [],
    };
  }

  /** Create a new media entry (metadata only, no content) */
  async add(entry: Partial<KalturaMediaEntry>): Promise<KalturaMediaEntry> {
    log.info("Creating new entry", { name: entry.name });

    return this.client.request<KalturaMediaEntry>({
      service: "media",
      action: "add",
      params: {
        entry: {
          objectType: "KalturaMediaEntry",
          mediaType: KalturaMediaType.VIDEO,
          ...entry,
        },
      },
    });
  }

  /** Attach uploaded content to an entry */
  async addContent(entryId: string, uploadTokenId: string): Promise<KalturaMediaEntry> {
    log.info("Attaching content to entry", { entryId, uploadTokenId });

    return this.client.request<KalturaMediaEntry>({
      service: "media",
      action: "addContent",
      params: {
        entryId,
        resource: {
          objectType: "KalturaUploadedFileTokenResource",
          token: uploadTokenId,
        },
      },
    });
  }

  /** Replace the content of an existing entry with a new uploaded file */
  async updateContent(entryId: string, uploadTokenId: string): Promise<KalturaMediaEntry> {
    log.info("Replacing content on entry", { entryId, uploadTokenId });

    return this.client.request<KalturaMediaEntry>({
      service: "media",
      action: "updateContent",
      params: {
        entryId,
        resource: {
          objectType: "KalturaUploadedFileTokenResource",
          token: uploadTokenId,
        },
      },
    });
  }

  /**
   * Create a new media entry from an already-uploaded file token.
   * Combines entry creation + content attachment in a single API call.
   * This is the recommended approach per Kaltura best practices.
   */
  async addFromUploadedFile(
    entry: Partial<KalturaMediaEntry>,
    uploadTokenId: string,
  ): Promise<KalturaMediaEntry> {
    log.info("Creating entry from uploaded file", { name: entry.name, uploadTokenId });

    return this.client.request<KalturaMediaEntry>({
      service: "media",
      action: "addFromUploadedFile",
      params: {
        mediaEntry: {
          objectType: "KalturaMediaEntry",
          mediaType: KalturaMediaType.VIDEO,
          ...entry,
        },
        uploadTokenId,
      },
    });
  }

  /** Update entry metadata */
  async update(entryId: string, entry: Partial<KalturaMediaEntry>): Promise<KalturaMediaEntry> {
    log.info("Updating entry", { entryId });

    return this.client.request<KalturaMediaEntry>({
      service: "media",
      action: "update",
      params: {
        entryId,
        mediaEntry: {
          objectType: "KalturaMediaEntry",
          ...entry,
        },
      },
    });
  }

  /**
   * Build a direct download URL for an entry's source file.
   * Uses the raw/direct_serve CDN path which works for all entry types
   * including images (which don't support flavorAsset/getDownloadUrl).
   */
  getEntryDownloadUrl(entryId: string, fileName?: string): string {
    const partnerId = this.client.getPartnerId();
    const serviceUrl = this.client.getServiceUrl();
    // Derive CDN base: replace www. prefix with cdnapi-ev., or prepend cdnapi-ev. to domain
    const cdnBase = serviceUrl.includes("://www.")
      ? serviceUrl.replace("://www.", "://cdnapi-ev.")
      : serviceUrl.replace("://", "://cdnapi-ev.");
    const safeName = fileName ? `/${encodeURIComponent(fileName)}` : "";
    const ks = this.client.getKs();
    const ksParam = ks ? `?ks=${encodeURIComponent(ks)}` : "";
    const url = `${cdnBase}/p/${partnerId}/raw/entry_id/${entryId}/direct_serve/1/forceproxy/true${safeName}${ksParam}`;
    log.info("Entry download URL", { entryId, url: url.substring(0, 150) });
    return url;
  }

  /**
   * Get a direct download URL for a specific flavor asset.
   * Uses flavorAsset/getDownloadUrl API which works for all delivery types,
   * including entries with enforce_delivery:static_content where playManifest
   * with format/url returns 404.
   */
  async getFlavorDownloadUrl(entryId: string, flavorId: string): Promise<string> {
    const response = await this.client.request<string>({
      service: "flavorAsset",
      action: "getDownloadUrl",
      params: { id: flavorId, useCdn: true },
    });

    const url = typeof response === "string" ? response : String(response);
    log.info("Download URL", { entryId, flavorId, url: url.substring(0, 120) });
    return url;
  }

  /** List categories */
  async listCategories(parentId?: number): Promise<KalturaListResponse<KalturaCategory>> {
    const filter: Record<string, unknown> = {
      objectType: "KalturaCategoryFilter",
      orderBy: "+name",
    };
    if (parentId !== undefined) {
      filter.parentIdEqual = parentId;
    }

    return this.client.request<KalturaListResponse<KalturaCategory>>({
      service: "category",
      action: "list",
      params: { filter },
    });
  }

  /** Search using eSearch (simple text-only, legacy) */
  async eSearch(
    searchText: string,
    pager: KalturaFilterPager = { pageSize: DEFAULT_PAGE_SIZE, pageIndex: 1 },
  ): Promise<KalturaListResponse<KalturaMediaEntry>> {
    log.debug("eSearch", { searchText });

    return this.client.request<KalturaListResponse<KalturaMediaEntry>>({
      service: "elasticsearch_esearch",
      action: "searchEntry",
      params: {
        searchParams: {
          objectType: "KalturaESearchEntryParams",
          searchOperator: {
            objectType: "KalturaESearchEntryOperator",
            operator: 1, // AND
            searchItems: [
              {
                objectType: "KalturaESearchUnifiedItem",
                itemType: 2, // Partial match
                searchTerm: searchText,
                addHighlight: true,
              },
            ],
          },
        },
        pager: {
          objectType: "KalturaFilterPager",
          ...pager,
        },
      },
    });
  }

  /**
   * Advanced eSearch-based browse with full filter support and highlights.
   * Builds composite search items from structured parameters.
   */
  async eSearchBrowse(
    params: ESearchBrowseParams,
    pager: KalturaFilterPager = { pageSize: DEFAULT_PAGE_SIZE, pageIndex: 1 },
  ): Promise<ESearchBrowseResult> {
    // Build content/filter items (everything except ownership)
    const filterItems: KalturaESearchItem[] = [];

    if (params.searchText) {
      filterItems.push({
        objectType: "KalturaESearchUnifiedItem",
        itemType: ESearchItemType.STARTS_WITH,
        searchTerm: params.searchText,
        addHighlight: true,
      });
    }

    if (params.withCaptionsOnly) {
      filterItems.push({
        objectType: "KalturaESearchCaptionItem",
        fieldName: "content",
        itemType: ESearchItemType.EXISTS,
      });
    }

    if (params.categoryIds) {
      filterItems.push({
        objectType: "KalturaESearchCategoryEntryItem",
        fieldName: "full_ids",
        itemType: ESearchItemType.EXACT_MATCH,
        searchTerm: params.categoryIds,
        categoryEntryStatus: 1,
      });
    }

    if (params.mediaType !== undefined) {
      filterItems.push({
        objectType: "KalturaESearchEntryItem",
        fieldName: "media_type",
        itemType: ESearchItemType.EXACT_MATCH,
        searchTerm: String(params.mediaType),
      });
    }

    if (params.createdAfter !== undefined || params.createdBefore !== undefined) {
      filterItems.push({
        objectType: "KalturaESearchEntryItem",
        fieldName: "created_at",
        itemType: ESearchItemType.RANGE,
        range: {
          greaterThanOrEqual: params.createdAfter,
          lessThanOrEqual: params.createdBefore,
        },
      });
    }

    // Build top-level searchItems:
    // When userId is set: AND[ OR[user fields], AND[search/filter fields] ]
    // Otherwise: AND[ filter items... ]
    let searchItems: KalturaESearchItem[];

    if (params.userId) {
      // Ensure filter items has at least the default item
      if (filterItems.length === 0) {
        filterItems.push({
          objectType: "KalturaESearchEntryItem",
          fieldName: "display_in_search",
          itemType: ESearchItemType.EXACT_MATCH,
          searchTerm: "1",
        });
      }

      searchItems = [
        // OR: ownership fields
        {
          objectType: "KalturaESearchEntryOperator",
          operator: ESearchOperatorType.OR_OP,
          searchItems: [
            {
              objectType: "KalturaESearchEntryItem",
              fieldName: "kuser_id",
              itemType: ESearchItemType.EXACT_MATCH,
              searchTerm: params.userId,
              addHighlight: false,
            },
            {
              objectType: "KalturaESearchEntryItem",
              fieldName: "creator_kuser_id",
              itemType: ESearchItemType.EXACT_MATCH,
              searchTerm: params.userId,
              addHighlight: false,
            },
            {
              objectType: "KalturaESearchEntryItem",
              fieldName: "entitled_kusers_edit",
              itemType: ESearchItemType.EXACT_MATCH,
              searchTerm: params.userId,
              addHighlight: false,
            },
            {
              objectType: "KalturaESearchEntryItem",
              fieldName: "entitled_kusers_publish",
              itemType: ESearchItemType.EXACT_MATCH,
              searchTerm: params.userId,
              addHighlight: false,
            },
          ],
        },
        // AND: search/filter fields
        {
          objectType: "KalturaESearchEntryOperator",
          operator: ESearchOperatorType.AND_OP,
          searchItems: filterItems,
        },
      ];
    } else {
      searchItems = filterItems;
    }

    // Always restrict to media clips (entry_type=1) — excludes playlists, data, live
    searchItems.push({
      objectType: "KalturaESearchEntryItem",
      fieldName: "entry_type",
      itemType: ESearchItemType.EXACT_MATCH,
      searchTerm: "1",
    });

    // Always include display_in_search=1 as a base filter
    if (searchItems.length === 1) {
      searchItems.push({
        objectType: "KalturaESearchEntryItem",
        fieldName: "display_in_search",
        itemType: ESearchItemType.EXACT_MATCH,
        searchTerm: "1",
      });
    }

    log.debug("eSearchBrowse", { params, itemCount: searchItems.length });

    const response = await this.client.request<ESearchResponse>({
      service: "elasticsearch_esearch",
      action: "searchEntry",
      params: {
        searchParams: {
          objectType: "KalturaESearchEntryParams",
          searchOperator: {
            objectType: "KalturaESearchEntryOperator",
            operator: ESearchOperatorType.AND_OP,
            searchItems,
          },
          objectStatuses: "2", // READY only
          ...((!params.sortField || params.sortField !== "relevance") && {
            orderBy: {
              objectType: "KalturaESearchOrderBy",
              orderItems: [
                {
                  objectType: "KalturaESearchEntryOrderByItem",
                  sortField: params.sortField || "updated_at",
                  sortOrder: params.sortOrder || "desc",
                },
              ],
            },
          }),
        },
        pager: {
          objectType: "KalturaFilterPager",
          ...pager,
        },
      },
    });

    const entries: KalturaMediaEntry[] = [];
    const highlights = new Map<string, BrowseHighlight[]>();
    const objects = response.objects || [];

    for (const entryResult of objects) {
      const entry = entryResult.object;
      if (!entry) continue;
      entries.push(entry);

      const entryHighlights: BrowseHighlight[] = [];

      // 1. Top-level highlights (fieldName + hits with <em> tags)
      const topHighlights = entryResult.highlight || [];
      for (const hl of topHighlights) {
        const type = fieldNameToHighlightType(hl.fieldName);
        const hits = hl.hits || [];
        for (const hit of hits) {
          if (hit.value) {
            entryHighlights.push({
              type,
              text: stripHighlightTags(hit.value),
            });
          }
        }
      }

      // 2. itemsData for granular caption/metadata results (timecodes, etc.)
      const itemsDataList = entryResult.itemsData || [];
      for (const itemsData of itemsDataList) {
        const items = itemsData.items || [];
        const itemsType = itemsData.itemsType;
        for (const item of items) {
          // Only add caption items with timecodes (avoid duplicating top-level highlights)
          if (item.startTime !== undefined) {
            entryHighlights.push({
              type: resolveHighlightType(itemsType ?? item.itemType),
              text: stripHighlightTags(item.highlight ?? item.searchTerm ?? ""),
              startTime: item.startTime,
              endTime: item.endTime,
            });
          }
        }
      }

      if (entryHighlights.length > 0) {
        highlights.set(entry.id, entryHighlights);
      }
    }

    log.debug("eSearchBrowse results", { total: response.totalCount, entries: entries.length });
    return { totalCount: response.totalCount, entries, highlights };
  }
}
