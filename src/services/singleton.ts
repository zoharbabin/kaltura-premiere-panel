/**
 * Shared singleton service instances.
 *
 * All panels and commands import from this module so they share the same
 * KalturaClient, AuthService, and derived services. Login from any panel
 * authenticates every panel; Sign Out clears state globally.
 */
import {
  KalturaClient,
  AuthService,
  MediaService,
  UploadService,
  DownloadService,
  MetadataService,
  CaptionService,
  BatchService,
  PublishWorkflowService,
  SearchService,
  AuditService,
  OfflineService,
  createHostService,
} from "./index";
import { DEFAULT_SERVICE_URL } from "../utils/constants";

const PARTNER_ID = 0; // Updated by login

export const client = new KalturaClient({
  serviceUrl: DEFAULT_SERVICE_URL,
  partnerId: PARTNER_ID,
});
export const authService = new AuthService(client);
export const mediaService = new MediaService(client);
export const uploadService = new UploadService(client);
export const hostService = createHostService();
export const downloadService = new DownloadService(client, mediaService, hostService);
export const metadataService = new MetadataService(client);
export const captionService = new CaptionService(client);
export const batchService = new BatchService(client);
export const publishWorkflowService = new PublishWorkflowService(client, mediaService);
export const searchService = new SearchService(client);
export const auditService = new AuditService(client);
export const offlineService = new OfflineService();
