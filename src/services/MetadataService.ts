import { KalturaClient } from "./KalturaClient";
import { KalturaMediaEntry, KalturaCategory, KalturaListResponse } from "../types/kaltura";
import { createLogger } from "../utils/logger";

const log = createLogger("MetadataService");

export interface MetadataProfile {
  id: number;
  name: string;
  systemName?: string;
  description?: string;
  xsd: string;
}

export interface MetadataField {
  key: string;
  label: string;
  type: "text" | "date" | "list" | "number" | "boolean";
  required: boolean;
  options?: string[];
}

export interface MetadataValues {
  profileId: number;
  values: Record<string, string>;
  xmlData?: string;
}

/**
 * Manages Kaltura metadata operations: standard fields, custom metadata profiles,
 * tag search, and category management.
 */
export class MetadataService {
  constructor(private client: KalturaClient) {}

  /** Update entry metadata (standard fields) */
  async updateEntry(
    entryId: string,
    fields: Partial<Pick<KalturaMediaEntry, "name" | "description" | "tags" | "categoriesIds">>,
  ): Promise<KalturaMediaEntry> {
    log.info("Updating entry metadata", { entryId, fields: Object.keys(fields) });

    return this.client.request<KalturaMediaEntry>({
      service: "media",
      action: "update",
      params: {
        entryId,
        mediaEntry: {
          objectType: "KalturaMediaEntry",
          ...fields,
        },
      },
    });
  }

  /** Search tags for autocomplete */
  async searchTags(query: string, limit: number = 20): Promise<string[]> {
    log.debug("Searching tags", { query });

    try {
      const response = await this.client.request<
        { objectType?: string; tags: string } & Record<string, unknown>
      >({
        service: "tag",
        action: "search",
        params: {
          tagFilter: {
            objectType: "KalturaTagFilter",
            tagStartsWith: query,
            objectTypeEqual: 1, // entry
          },
          pager: {
            objectType: "KalturaFilterPager",
            pageSize: limit,
            pageIndex: 1,
          },
        },
      });

      if (Array.isArray(response)) {
        return (response as Array<{ tag: string }>).map((t) => t.tag);
      }
      const listResponse = response as unknown as KalturaListResponse<{ tag: string }>;
      if (listResponse.objects) {
        return listResponse.objects.map((t) => t.tag);
      }
      return [];
    } catch {
      return [];
    }
  }

  /** List categories with optional parent filter */
  async listCategories(parentId?: number): Promise<KalturaCategory[]> {
    const filter: Record<string, unknown> = {
      objectType: "KalturaCategoryFilter",
      orderBy: "+name",
    };
    if (parentId !== undefined) {
      filter.parentIdEqual = parentId;
    }

    const response = await this.client.request<KalturaListResponse<KalturaCategory>>({
      service: "category",
      action: "list",
      params: { filter },
    });

    return response.objects || [];
  }

  /** List custom metadata profiles for the partner */
  async listMetadataProfiles(): Promise<MetadataProfile[]> {
    try {
      const response = await this.client.request<KalturaListResponse<MetadataProfile>>({
        service: "metadata_metadataProfile",
        action: "list",
        params: {
          filter: {
            objectType: "KalturaMetadataProfileFilter",
            metadataObjectTypeEqual: 1, // Entry
          },
        },
      });

      return response.objects || [];
    } catch {
      log.warn("Custom metadata profiles not available");
      return [];
    }
  }

  /** Get custom metadata for an entry */
  async getEntryMetadata(entryId: string, profileId: number): Promise<MetadataValues | null> {
    try {
      const response = await this.client.request<
        KalturaListResponse<{ id: number; xml: string; metadataProfileId: number }>
      >({
        service: "metadata_metadata",
        action: "list",
        params: {
          filter: {
            objectType: "KalturaMetadataFilter",
            objectIdEqual: entryId,
            metadataObjectTypeEqual: 1,
            metadataProfileIdEqual: profileId,
          },
        },
      });

      if (response.objects && response.objects.length > 0) {
        const xmlData = response.objects[0].xml;
        return {
          profileId,
          values: this.parseMetadataXml(xmlData),
          xmlData,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Save custom metadata for an entry */
  async saveEntryMetadata(
    entryId: string,
    profileId: number,
    values: Record<string, string>,
  ): Promise<void> {
    log.info("Saving custom metadata", { entryId, profileId });

    const xmlData = this.buildMetadataXml(values);
    const existing = await this.getEntryMetadata(entryId, profileId);

    if (existing) {
      await this.client.request({
        service: "metadata_metadata",
        action: "update",
        params: {
          id: (existing as unknown as { id: number }).id,
          xmlData,
        },
      });
    } else {
      await this.client.request({
        service: "metadata_metadata",
        action: "add",
        params: {
          metadataProfileId: profileId,
          objectType: 1,
          objectId: entryId,
          xmlData,
        },
      });
    }
  }

  /** Add entry to a category */
  async addToCategory(entryId: string, categoryId: number): Promise<void> {
    await this.client.request({
      service: "categoryEntry",
      action: "add",
      params: {
        categoryEntry: {
          objectType: "KalturaCategoryEntry",
          entryId,
          categoryId,
        },
      },
    });
  }

  /** Remove entry from a category */
  async removeFromCategory(entryId: string, categoryId: number): Promise<void> {
    await this.client.request({
      service: "categoryEntry",
      action: "delete",
      params: { entryId, categoryId },
    });
  }

  /** Parse simple metadata XML to key-value pairs */
  private parseMetadataXml(xml: string): Record<string, string> {
    const values: Record<string, string> = {};
    const tagRegex = /<(\w+)>(.*?)<\/\1>/g;
    let match;
    while ((match = tagRegex.exec(xml)) !== null) {
      if (match[1] !== "metadata") {
        values[match[1]] = match[2];
      }
    }
    return values;
  }

  /** Build metadata XML from key-value pairs */
  private buildMetadataXml(values: Record<string, string>): string {
    const fields = Object.entries(values)
      .map(([key, value]) => `<${key}>${this.escapeXml(value)}</${key}>`)
      .join("");
    return `<metadata>${fields}</metadata>`;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /** Parse XSD to extract field definitions */
  parseProfileXsd(xsd: string): MetadataField[] {
    const fields: MetadataField[] = [];
    const elementRegex = /<xsd:element\s+name="(\w+)"\s+type="([^"]*)"\s*(?:minOccurs="(\d+)")?/g;
    let match;
    while ((match = elementRegex.exec(xsd)) !== null) {
      const type = match[2].includes("date")
        ? "date"
        : match[2].includes("int") || match[2].includes("decimal")
          ? "number"
          : match[2].includes("boolean")
            ? "boolean"
            : "text";
      fields.push({
        key: match[1],
        label: match[1].replace(/([A-Z])/g, " $1").trim(),
        type,
        required: match[3] === "1",
      });
    }
    return fields;
  }
}
