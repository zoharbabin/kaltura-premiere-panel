import { KalturaClient } from "./KalturaClient";
import {
  KalturaMediaEntry,
  KalturaListResponse,
  KalturaFilterPager,
  ESearchResponse,
} from "../types/kaltura";
import { createLogger } from "../utils/logger";
import { DEFAULT_PAGE_SIZE } from "../utils/constants";

const log = createLogger("SearchService");

/** A single highlight match within search results */
export interface SearchHighlight {
  type: "caption" | "metadata" | "content";
  text: string;
  startTime?: number;
  endTime?: number;
}

/** Transcript search result for a specific entry */
export interface TranscriptSearchResult {
  startTime: number;
  endTime: number;
  text: string;
  highlight: string;
}

/** Unified in-video search result across entries */
export interface InVideoSearchResult {
  entry: KalturaMediaEntry;
  highlights: SearchHighlight[];
}

/**
 * Smart search service wrapping Kaltura's eSearch API.
 * Supports transcript search, in-video search, tag-based search, and similar entry discovery.
 */
export class SearchService {
  constructor(private client: KalturaClient) {}

  /** Search within captions/transcripts of a specific entry */
  async searchTranscripts(entryId: string, searchText: string): Promise<TranscriptSearchResult[]> {
    log.debug("Searching transcripts", { entryId, searchText });

    const response = await this.client.request<ESearchResponse>({
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
                objectType: "KalturaESearchCaptionItem",
                searchTerm: searchText,
                itemType: 2, // Partial match
                addHighlight: true,
              },
            ],
          },
          objectStatuses: "2", // READY
        },
        pager: {
          objectType: "KalturaFilterPager",
          pageSize: DEFAULT_PAGE_SIZE,
          pageIndex: 1,
        },
      },
    });

    const results: TranscriptSearchResult[] = [];
    const objects = response.objects || [];

    for (const entryResult of objects) {
      if (entryResult.object?.id !== entryId) continue;

      const itemsDataList = entryResult.itemsData || [];
      for (const itemsData of itemsDataList) {
        const items = itemsData.items || [];
        for (const item of items) {
          results.push({
            startTime: item.startTime ?? 0,
            endTime: item.endTime ?? 0,
            text: item.searchTerm ?? searchText,
            highlight: item.highlight ?? item.searchTerm ?? searchText,
          });
        }
      }
    }

    log.debug("Transcript search results", { entryId, count: results.length });
    return results;
  }

  /** Unified search across entries including captions, metadata, and transcript content */
  async searchInVideo(
    searchText: string,
    pager: KalturaFilterPager = { pageSize: DEFAULT_PAGE_SIZE, pageIndex: 1 },
  ): Promise<InVideoSearchResult[]> {
    log.debug("In-video search", { searchText, pager });

    const response = await this.client.request<ESearchResponse>({
      service: "elasticsearch_esearch",
      action: "searchEntry",
      params: {
        searchParams: {
          objectType: "KalturaESearchEntryParams",
          searchOperator: {
            objectType: "KalturaESearchEntryOperator",
            operator: 2, // OR
            searchItems: [
              {
                objectType: "KalturaESearchCaptionItem",
                searchTerm: searchText,
                itemType: 2,
                addHighlight: true,
              },
              {
                objectType: "KalturaESearchUnifiedItem",
                searchTerm: searchText,
                itemType: 2,
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

    const results: InVideoSearchResult[] = [];
    const objects = response.objects || [];

    for (const entryResult of objects) {
      const highlights: SearchHighlight[] = [];
      const itemsDataList = entryResult.itemsData || [];

      for (const itemsData of itemsDataList) {
        const items = itemsData.items || [];
        for (const item of items) {
          const highlightType = this.resolveHighlightType(item.itemType);
          highlights.push({
            type: highlightType,
            text: item.highlight ?? item.searchTerm ?? searchText,
            startTime: item.startTime,
            endTime: item.endTime,
          });
        }
      }

      results.push({
        entry: entryResult.object,
        highlights,
      });
    }

    log.debug("In-video search results", { count: results.length });
    return results;
  }

  /** Search entries by multiple tags (AND logic) */
  async searchByTags(
    tags: string[],
    pager: KalturaFilterPager = { pageSize: DEFAULT_PAGE_SIZE, pageIndex: 1 },
  ): Promise<KalturaListResponse<KalturaMediaEntry>> {
    log.debug("Searching by tags", { tags, pager });

    const searchItems = tags.map((tag) => ({
      objectType: "KalturaESearchUnifiedItem",
      searchTerm: tag,
      itemType: 1, // Exact match
      addHighlight: false,
    }));

    return this.client.request<KalturaListResponse<KalturaMediaEntry>>({
      service: "elasticsearch_esearch",
      action: "searchEntry",
      params: {
        searchParams: {
          objectType: "KalturaESearchEntryParams",
          searchOperator: {
            objectType: "KalturaESearchEntryOperator",
            operator: 1, // AND
            searchItems,
          },
        },
        pager: {
          objectType: "KalturaFilterPager",
          ...pager,
        },
      },
    });
  }

  /** Find entries similar to a given entry based on metadata */
  async searchSimilar(
    entryId: string,
    pager: KalturaFilterPager = { pageSize: DEFAULT_PAGE_SIZE, pageIndex: 1 },
  ): Promise<KalturaListResponse<KalturaMediaEntry>> {
    log.debug("Searching similar entries", { entryId, pager });

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
                searchTerm: entryId,
                itemType: 3, // Similar (starts-with/related)
                addHighlight: false,
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

  /** Map raw eSearch item type strings to SearchHighlight types */
  private resolveHighlightType(itemType: string | undefined): SearchHighlight["type"] {
    switch (itemType) {
      case "caption":
        return "caption";
      case "metadata":
        return "metadata";
      default:
        return "content";
    }
  }
}
