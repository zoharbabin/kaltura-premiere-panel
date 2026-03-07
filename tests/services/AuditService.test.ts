import { AuditService } from "../../src/services/AuditService";
import { KalturaClient } from "../../src/services/KalturaClient";

const mockFetch = global.fetch as jest.Mock;

describe("AuditService", () => {
  let client: KalturaClient;
  let service: AuditService;

  beforeEach(() => {
    client = new KalturaClient({ serviceUrl: "https://test.kaltura.com", partnerId: 12345 });
    client.setKs("test_ks");
    service = new AuditService(client);
    mockFetch.mockReset();
  });

  describe("logAction()", () => {
    it("logs action locally and sends to Kaltura audit trail", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ objectType: "KalturaAuditTrail", id: "at-1" }),
      });

      await service.logAction("import", "0_abc", "Imported flavor xyz");

      const localLog = service.getLocalLog();
      expect(localLog).toHaveLength(1);
      expect(localLog[0].action).toBe("import");
      expect(localLog[0].entryId).toBe("0_abc");
      expect(localLog[0].details).toBe("Imported flavor xyz");

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.auditTrail.action).toBe("import");
      expect(body.auditTrail.relatedObjectId).toBe("0_abc");
    });

    it("stores locally even when remote audit fails", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Plugin not enabled"));

      await service.logAction("login", undefined, "User login");

      const localLog = service.getLocalLog();
      expect(localLog).toHaveLength(1);
      expect(localLog[0].action).toBe("login");
    });

    it("trims local log to MAX_LOCAL_LOG entries", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ objectType: "KalturaAuditTrail", id: "at-1" }),
      });

      for (let i = 0; i < 510; i++) {
        await service.logAction("search", undefined, `search ${i}`);
      }

      expect(service.getLocalLog().length).toBeLessThanOrEqual(500);
    });
  });

  describe("clearLocalLog()", () => {
    it("clears the local log", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ objectType: "KalturaAuditTrail", id: "at-1" }),
      });

      await service.logAction("login");
      expect(service.getLocalLog()).toHaveLength(1);

      service.clearLocalLog();
      expect(service.getLocalLog()).toHaveLength(0);
    });
  });

  describe("getAccessControlProfile()", () => {
    it("returns parsed access control profile", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaAccessControlProfile",
          id: 10,
          name: "Restricted",
          isDefault: false,
          rules: [
            {
              conditions: [{ type: "KalturaCountryCondition", description: "Country restriction" }],
            },
          ],
        }),
      });

      const profile = await service.getAccessControlProfile(10);

      expect(profile).not.toBeNull();
      expect(profile!.name).toBe("Restricted");
      expect(profile!.restrictions).toHaveLength(1);
      expect(profile!.restrictions[0].description).toBe("Country restriction");
    });

    it("returns null on error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Not found"));

      const profile = await service.getAccessControlProfile(999);
      expect(profile).toBeNull();
    });
  });

  describe("listAccessControlProfiles()", () => {
    it("returns list of profiles", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaAccessControlProfileListResponse",
          totalCount: 2,
          objects: [
            { id: 1, name: "Default", isDefault: true },
            { id: 2, name: "Restricted", isDefault: false },
          ],
        }),
      });

      const profiles = await service.listAccessControlProfiles();

      expect(profiles).toHaveLength(2);
      expect(profiles[0].name).toBe("Default");
      expect(profiles[0].isDefault).toBe(true);
    });

    it("returns empty array on error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const profiles = await service.listAccessControlProfiles();
      expect(profiles).toEqual([]);
    });
  });

  describe("listComplianceTemplates()", () => {
    it("returns server-side compliance templates", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaMetadataProfileListResponse",
          totalCount: 1,
          objects: [
            {
              id: 100,
              systemName: "compliance",
              name: "Corporate Compliance",
              xsd: `<xsd:schema><xsd:element name="classification"><xsd:simpleType><xsd:restriction><xsd:enumeration value="Public"/><xsd:enumeration value="Internal"/></xsd:restriction></xsd:simpleType></xsd:element><xsd:element name="department" minOccurs="0"/></xsd:schema>`,
            },
          ],
        }),
      });

      const templates = await service.listComplianceTemplates();

      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe("Corporate Compliance");
      expect(templates[0].fields.length).toBeGreaterThanOrEqual(1);
      const classField = templates[0].fields.find((f) => f.key === "classification");
      expect(classField).toBeDefined();
      expect(classField!.type).toBe("select");
      expect(classField!.options).toContain("Public");
    });

    it("falls back to default templates when server unavailable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Service not found"));

      const templates = await service.listComplianceTemplates();

      expect(templates).toHaveLength(1);
      expect(templates[0].id).toBe("default_compliance");
      expect(templates[0].fields.length).toBeGreaterThan(0);
    });
  });

  describe("getDefaultComplianceTemplates()", () => {
    it("returns built-in compliance template with required fields", () => {
      const templates = service.getDefaultComplianceTemplates();

      expect(templates).toHaveLength(1);
      const fields = templates[0].fields;
      const required = fields.filter((f) => f.required);
      expect(required.length).toBeGreaterThanOrEqual(2);
      expect(fields.find((f) => f.key === "contentClassification")).toBeDefined();
      expect(fields.find((f) => f.key === "retentionPolicy")).toBeDefined();
      expect(fields.find((f) => f.key === "department")).toBeDefined();
    });
  });

  describe("getEntryDrmPolicy()", () => {
    it("returns DRM policies", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          objectType: "KalturaDrmPolicyListResponse",
          totalCount: 1,
          objects: [
            {
              flavorParamsId: 1,
              drmProvider: "Widevine",
              scheme: "cenc",
              licenseServerUrl: "https://drm.example.com",
            },
          ],
        }),
      });

      const policies = await service.getEntryDrmPolicy("0_abc");

      expect(policies).toHaveLength(1);
      expect(policies[0].provider).toBe("widevine");
      expect(policies[0].licenseUrl).toBe("https://drm.example.com");
    });

    it("returns none when DRM plugin unavailable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Service not found"));

      const policies = await service.getEntryDrmPolicy("0_abc");

      expect(policies).toEqual([{ provider: "none" }]);
    });
  });
});
