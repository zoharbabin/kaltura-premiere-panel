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

  /** Log a panel action locally and optionally to Kaltura's audit trail */
  async logAction(action: AuditAction, entryId?: string, details?: string): Promise<void> {
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

    try {
      await this.client.request({
        service: "auditTrail",
        action: "add",
        params: {
          auditTrail: {
            objectType: "KalturaAuditTrail",
            action,
            relatedObjectId: entryId || "",
            relatedObjectType: entryId ? "entry" : "kuser",
            description: details || `Panel action: ${action}`,
          },
        },
      });
    } catch {
      // Audit trail plugin may not be enabled — log locally only
      log.debug("Remote audit logging unavailable, stored locally");
    }
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
