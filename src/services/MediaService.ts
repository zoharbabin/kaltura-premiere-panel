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
} from "../types/kaltura";
import { DEFAULT_PAGE_SIZE } from "../utils/constants";
import { createLogger } from "../utils/logger";

const log = createLogger("MediaService");

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

  /** Search using eSearch (advanced full-text search) */
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
}
