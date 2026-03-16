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
export interface ESearchBrowseParams {
  searchText?: string;
  mediaType?: KalturaMediaType;
  createdAfter?: number;
  createdBefore?: number;
  userId?: string;
  categoryIds?: string;
  withCaptionsOnly?: boolean;
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

/** Strip HTML tags from eSearch highlight text */
function stripHighlightTags(text: string): string {
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
   * Get a direct download URL for an entry's source file.
   * Works for all entry types including images and documents that have
   * no flavor assets. Uses baseEntry/getDownloadUrl API.
   */
  async getEntryDownloadUrl(entryId: string): Promise<string> {
    const response = await this.client.request<string>({
      service: "baseEntry",
      action: "getDownloadUrl",
      params: { entryId },
    });

    const url = typeof response === "string" ? response : String(response);
    log.info("Entry download URL", { entryId, url: url.substring(0, 120) });
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
      service: "eSearch",
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
    const searchItems: KalturaESearchItem[] = [];

    if (params.searchText) {
      searchItems.push({
        objectType: "KalturaESearchUnifiedItem",
        itemType: ESearchItemType.PARTIAL,
        searchTerm: params.searchText,
        addHighlight: true,
      });
    }

    if (params.withCaptionsOnly) {
      searchItems.push({
        objectType: "KalturaESearchCaptionItem",
        fieldName: "content",
        itemType: ESearchItemType.EXISTS,
      });
    }

    if (params.categoryIds) {
      searchItems.push({
        objectType: "KalturaESearchCategoryEntryItem",
        fieldName: "full_ids",
        itemType: ESearchItemType.EXACT_MATCH,
        searchTerm: params.categoryIds,
        categoryEntryStatus: 1,
      });
    }

    if (params.mediaType !== undefined) {
      searchItems.push({
        objectType: "KalturaESearchEntryItem",
        fieldName: "media_type",
        itemType: ESearchItemType.EXACT_MATCH,
        searchTerm: String(params.mediaType),
      });
    }

    if (params.createdAfter !== undefined || params.createdBefore !== undefined) {
      searchItems.push({
        objectType: "KalturaESearchEntryItem",
        fieldName: "created_at",
        itemType: ESearchItemType.RANGE,
        range: {
          greaterThanOrEqual: params.createdAfter,
          lessThanOrEqual: params.createdBefore,
        },
      });
    }

    if (params.userId) {
      searchItems.push({
        objectType: "KalturaESearchEntryItem",
        fieldName: "user_id",
        itemType: ESearchItemType.EXACT_MATCH,
        searchTerm: params.userId,
      });
    }

    // eSearch requires at least one search item
    if (searchItems.length === 0) {
      return { totalCount: 0, entries: [], highlights: new Map() };
    }

    log.debug("eSearchBrowse", { params, itemCount: searchItems.length });

    const response = await this.client.request<ESearchResponse>({
      service: "eSearch",
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
      const itemsDataList = entryResult.itemsData || [];
      for (const itemsData of itemsDataList) {
        const items = itemsData.items || [];
        for (const item of items) {
          entryHighlights.push({
            type: resolveHighlightType(item.itemType),
            text: stripHighlightTags(item.highlight ?? item.searchTerm ?? ""),
            startTime: item.startTime,
            endTime: item.endTime,
          });
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
