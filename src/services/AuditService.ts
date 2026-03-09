import { KalturaClient } from "./KalturaClient";
import { KalturaObjectBase, KalturaListResponse } from "../types/kaltura";
import { createLogger } from "../utils/logger";

const log = createLogger("AuditService");

/** Panel action types logged to audit trail */
export type AuditAction =
  | "login"
  | "logout"
  | "search"
  | "import"
  | "publish"
  | "update_metadata"
  | "delete"
  | "caption_order"
  | "download"
  | "set_hold"
  | "remove_hold";

/** Audit log entry stored locally and sent to Kaltura */
export interface AuditLogEntry {
  action: AuditAction;
  entryId?: string;
  details?: string;
  timestamp: number;
}

/** Access control profile from Kaltura */
export interface AccessControlProfile {
  id: number;
  name: string;
  description?: string;
  isDefault: boolean;
  restrictions: AccessControlRestriction[];
}

/** Individual restriction within an access control profile */
export interface AccessControlRestriction {
  type: string;
  description: string;
}

/** Compliance metadata template for auto-populating required fields */
export interface ComplianceTemplate {
  id: string;
  name: string;
  fields: ComplianceField[];
}

/** A single field in a compliance template */
export interface ComplianceField {
  key: string;
  label: string;
  type: "text" | "select" | "date";
  required: boolean;
  defaultValue?: string;
  options?: string[];
}

/** DRM policy information */
export interface DrmPolicy {
  provider: "widevine" | "fairplay" | "playready" | "none";
  licenseUrl?: string;
  schemeId?: string;
}

/**
 * Audit and governance service: logs panel actions, retrieves access control
 * profiles, and checks DRM policy for entries.
 */
export class AuditService {
  private localLog: AuditLogEntry[] = [];
  private readonly MAX_LOCAL_LOG = 500;

  constructor(private client: KalturaClient) {}

  /** Log a panel action locally */
  logAction(action: AuditAction, entryId?: string, details?: string): void {
    const entry: AuditLogEntry = {
      action,
      entryId,
      details,
      timestamp: Date.now(),
    };

    this.localLog.push(entry);
    if (this.localLog.length > this.MAX_LOCAL_LOG) {
      this.localLog = this.localLog.slice(-this.MAX_LOCAL_LOG);
    }

    log.debug("Audit action", { action, entryId, details });
  }

  /** Get the local audit log for current session */
  getLocalLog(): AuditLogEntry[] {
    return [...this.localLog];
  }

  /** Clear local audit log */
  clearLocalLog(): void {
    this.localLog = [];
  }

  /** Get access control profile for a given profile ID */
  async getAccessControlProfile(profileId: number): Promise<AccessControlProfile | null> {
    try {
      const response = await this.client.request<
        KalturaObjectBase & {
          id: number;
          name: string;
          description?: string;
          isDefault: boolean;
          rules?: Array<{
            conditions?: Array<{ type: string; description?: string }>;
            actions?: Array<{ type: string }>;
          }>;
        }
      >({
        service: "accessControlProfile",
        action: "get",
        params: { id: profileId },
      });

      const restrictions: AccessControlRestriction[] = [];
      if (response.rules) {
        for (const rule of response.rules) {
          if (rule.conditions) {
            for (const cond of rule.conditions) {
              restrictions.push({
                type: cond.type,
                description: cond.description || cond.type,
              });
            }
          }
        }
      }

      return {
        id: response.id,
        name: response.name,
        description: response.description,
        isDefault: response.isDefault,
        restrictions,
      };
    } catch {
      log.debug("Could not fetch access control profile", { profileId });
      return null;
    }
  }

  /** List all access control profiles for the partner */
  async listAccessControlProfiles(): Promise<AccessControlProfile[]> {
    try {
      const response = await this.client.request<
        KalturaListResponse<{
          id: number;
          name: string;
          description?: string;
          isDefault: boolean;
        }>
      >({
        service: "accessControlProfile",
        action: "list",
        params: {},
      });

      return (response.objects || []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        isDefault: p.isDefault,
        restrictions: [],
      }));
    } catch {
      log.debug("Access control profiles not available");
      return [];
    }
  }

  /** List compliance metadata templates configured for the partner */
  async listComplianceTemplates(): Promise<ComplianceTemplate[]> {
    try {
      const response = await this.client.request<
        KalturaListResponse<{
          id: number;
          systemName: string;
          name: string;
          xsd: string;
        }>
      >({
        service: "metadataProfile",
        action: "list",
        params: {
          filter: {
            objectType: "KalturaMetadataProfileFilter",
            systemNameEqual: "compliance",
          },
        },
      });

      return (response.objects || []).map((profile) => ({
        id: String(profile.id),
        name: profile.name || profile.systemName,
        fields: this.parseXsdToFields(profile.xsd),
      }));
    } catch {
      log.debug("Compliance templates not available");
      return this.getDefaultComplianceTemplates();
    }
  }

  /** Get built-in default compliance templates when server-side not configured */
  getDefaultComplianceTemplates(): ComplianceTemplate[] {
    return [
      {
        id: "default_compliance",
        name: "Standard Compliance",
        fields: [
          {
            key: "contentClassification",
            label: "Content Classification",
            type: "select",
            required: true,
            options: ["Public", "Internal", "Confidential", "Restricted"],
            defaultValue: "Internal",
          },
          {
            key: "retentionPolicy",
            label: "Retention Policy",
            type: "select",
            required: true,
            options: ["30 days", "90 days", "1 year", "3 years", "Indefinite"],
            defaultValue: "1 year",
          },
          {
            key: "department",
            label: "Department",
            type: "text",
            required: true,
          },
          {
            key: "complianceReviewDate",
            label: "Review Date",
            type: "date",
            required: false,
          },
          {
            key: "legalApproval",
            label: "Legal Approval",
            type: "select",
            required: false,
            options: ["Not Required", "Pending", "Approved", "Rejected"],
            defaultValue: "Not Required",
          },
        ],
      },
    ];
  }

  /** Parse XSD schema to compliance fields (simplified) */
  private parseXsdToFields(xsd: string): ComplianceField[] {
    const fields: ComplianceField[] = [];
    const elementRegex = /<xsd:element\s+name="(\w+)"[^>]*(?:\/>|>[\s\S]*?<\/xsd:element>)/g;
    let match;
    while ((match = elementRegex.exec(xsd)) !== null) {
      const name = match[1];
      const block = match[0];
      const required = !block.includes('minOccurs="0"');
      const hasEnum = block.includes("xsd:enumeration");

      const options: string[] = [];
      if (hasEnum) {
        const enumRegex = /value="([^"]+)"/g;
        let enumMatch;
        while ((enumMatch = enumRegex.exec(block)) !== null) {
          options.push(enumMatch[1]);
        }
      }

      fields.push({
        key: name,
        label: name.replace(/([A-Z])/g, " $1").trim(),
        type: hasEnum ? "select" : "text",
        required,
        options: options.length > 0 ? options : undefined,
      });
    }
    return fields;
  }

  /** Get DRM policy info for an entry's flavor assets */
  async getEntryDrmPolicy(entryId: string): Promise<DrmPolicy[]> {
    try {
      const response = await this.client.request<
        KalturaListResponse<{
          flavorParamsId: number;
          drmProvider?: string;
          scheme?: string;
          licenseServerUrl?: string;
        }>
      >({
        service: "drmPolicy",
        action: "list",
        params: {
          filter: {
            objectType: "KalturaDrmPolicyFilter",
            partnerIdEqual: this.client.getPartnerId(),
          },
        },
      });

      if (!response.objects || response.objects.length === 0) {
        return [{ provider: "none" }];
      }

      return response.objects.map((p) => ({
        provider: (p.drmProvider?.toLowerCase() as DrmPolicy["provider"]) || "none",
        licenseUrl: p.licenseServerUrl,
        schemeId: p.scheme,
      }));
    } catch {
      // DRM plugin may not be enabled
      return [{ provider: "none" }];
    }
  }
}
