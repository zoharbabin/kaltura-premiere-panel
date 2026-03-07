/** Kaltura Session types */
export enum KalturaSessionType {
  USER = 0,
  ADMIN = 2,
}

/** Kaltura entry status */
export enum KalturaEntryStatus {
  ERROR_IMPORTING = -2,
  ERROR_CONVERTING = -1,
  IMPORT = 0,
  PRECONVERT = 1,
  READY = 2,
  DELETED = 3,
  PENDING = 4,
  MODERATE = 5,
  BLOCKED = 6,
  NO_CONTENT = 7,
}

/** Kaltura media type */
export enum KalturaMediaType {
  VIDEO = 1,
  IMAGE = 2,
  AUDIO = 5,
}

/** Upload token status */
export enum KalturaUploadTokenStatus {
  PENDING = 0,
  PARTIAL_UPLOAD = 1,
  FULL_UPLOAD = 2,
  CLOSED = 3,
}

/** Kaltura moderation status */
export enum KalturaModerationStatus {
  PENDING = 1,
  APPROVED = 2,
  REJECTED = 3,
  FLAGGED = 5,
  AUTO_APPROVED = 6,
}

/** Caption format */
export enum KalturaCaptionType {
  SRT = 1,
  DFXP = 2,
  WEBVTT = 3,
  CAP = 4,
  SCC = 5,
}

/** REACH vendor task status */
export enum KalturaVendorTaskStatus {
  PENDING = 1,
  READY = 2,
  PROCESSING = 3,
  ERROR = 5,
}

/** REACH service feature */
export enum KalturaVendorServiceFeature {
  CAPTIONS = 1,
  TRANSLATION = 2,
  ALIGNMENT = 3,
  AUDIO_DESCRIPTION = 4,
}

/** REACH service type */
export enum KalturaVendorServiceType {
  HUMAN = 1,
  MACHINE = 2,
}

/** Base Kaltura object with objectType identifier */
export interface KalturaObjectBase {
  objectType?: string;
}

/** Kaltura API error response */
export interface KalturaApiException extends KalturaObjectBase {
  objectType: "KalturaAPIException";
  message: string;
  code: string;
  args?: Record<string, string>;
}

/** Kaltura media entry */
export interface KalturaMediaEntry extends KalturaObjectBase {
  id: string;
  name: string;
  description?: string;
  tags?: string;
  categories?: string;
  categoriesIds?: string;
  userId?: string;
  creatorId?: string;
  partnerId: number;
  status: KalturaEntryStatus;
  moderationStatus?: KalturaModerationStatus;
  mediaType: KalturaMediaType;
  duration: number;
  thumbnailUrl?: string;
  dataUrl?: string;
  createdAt: number;
  updatedAt: number;
  startDate?: number;
  endDate?: number;
  plays?: number;
  views?: number;
  lastPlayedAt?: number;
  accessControlId?: number;
}

/** Flavor (rendition) asset */
export interface KalturaFlavorAsset extends KalturaObjectBase {
  id: string;
  entryId: string;
  partnerId: number;
  status: number;
  size: number;
  width: number;
  height: number;
  bitrate: number;
  frameRate: number;
  fileExt: string;
  isWeb: boolean;
  isOriginal: boolean;
  containerFormat?: string;
  videoCodecId?: string;
  language?: string;
}

/** Caption asset */
export interface KalturaCaptionAsset extends KalturaObjectBase {
  id: string;
  entryId: string;
  label: string;
  language: string;
  format: KalturaCaptionType;
  status: number;
  isDefault: boolean;
  accuracy?: number;
  createdAt: number;
  updatedAt: number;
}

/** Category */
export interface KalturaCategory extends KalturaObjectBase {
  id: number;
  name: string;
  fullName: string;
  parentId: number;
  depth: number;
  entriesCount: number;
  directEntriesCount: number;
}

/** Upload token */
export interface KalturaUploadToken extends KalturaObjectBase {
  id: string;
  partnerId: number;
  status: KalturaUploadTokenStatus;
  uploadedFileSize: number;
  fileName?: string;
  fileSize?: number;
}

/** Timed annotation (review comment) */
export interface KalturaAnnotation extends KalturaObjectBase {
  id: string;
  entryId: string;
  text: string;
  startTime: number;
  endTime?: number;
  parentId?: string;
  userId?: string;
  isPublic: boolean;
  status: number;
  createdAt: number;
  updatedAt: number;
  depth?: number;
  childrenCount?: number;
  tags?: string;
}

/** REACH vendor task */
export interface KalturaEntryVendorTask extends KalturaObjectBase {
  id: number;
  entryId: string;
  status: KalturaVendorTaskStatus;
  serviceType: KalturaVendorServiceType;
  serviceFeature: KalturaVendorServiceFeature;
  sourceLanguage?: string;
  targetLanguage?: string;
  createdAt: number;
  updatedAt: number;
  expectedFinishTime?: number;
}

/** App token for secure auth */
export interface KalturaAppToken extends KalturaObjectBase {
  id: string;
  token: string;
  partnerId: number;
  sessionType: KalturaSessionType;
  expiry?: number;
}

/** List response wrapper */
export interface KalturaListResponse<T> extends KalturaObjectBase {
  totalCount: number;
  objects: T[];
}

/** Filter for media.list / eSearch */
export interface KalturaMediaEntryFilter {
  searchTextMatchAnd?: string;
  searchTextMatchOr?: string;
  mediaTypeEqual?: KalturaMediaType;
  statusEqual?: KalturaEntryStatus;
  statusIn?: string;
  categoryAncestorIdIn?: string;
  createdAtGreaterThanOrEqual?: number;
  createdAtLessThanOrEqual?: number;
  userIdEqual?: string;
  orderBy?: string;
  tagsMultiLikeAnd?: string;
}

/** Pager for paginated requests */
export interface KalturaFilterPager {
  pageSize: number;
  pageIndex: number;
}

/** Kaltura API request configuration */
export interface KalturaRequestConfig {
  service: string;
  action: string;
  params?: Record<string, unknown>;
}

/** Kaltura client configuration */
export interface KalturaClientConfig {
  serviceUrl: string;
  partnerId: number;
  clientTag?: string;
}

/** Auth credentials for email/password login */
export interface KalturaLoginCredentials {
  email: string;
  password: string;
  partnerId: number;
}

/** Auth credentials for app token */
export interface KalturaAppTokenCredentials {
  appTokenId: string;
  appToken: string;
  userId?: string;
  sessionType?: KalturaSessionType;
}

/** User info */
export interface KalturaUser extends KalturaObjectBase {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  partnerId: number;
  isAdmin: boolean;
}
