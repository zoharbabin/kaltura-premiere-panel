import {
  THUMBNAIL_CDN_URL,
  THUMBNAIL_GRID_WIDTH,
  THUMBNAIL_GRID_HEIGHT,
  THUMBNAIL_GRID_QUALITY,
  THUMBNAIL_LIST_WIDTH,
  THUMBNAIL_LIST_HEIGHT,
} from "./constants";

interface ThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number;
  second?: number;
  cropType?: 1 | 2 | 3;
}

/**
 * Constructs a Kaltura thumbnail URL from entry ID.
 * Uses the URL-based API — zero API calls, CDN-cached.
 *
 * Crop types: 1=aspect-fit, 2=fill, 3=center-crop
 */
export function buildThumbnailUrl(
  partnerId: number,
  entryId: string,
  options: ThumbnailOptions = {},
): string {
  const {
    width = THUMBNAIL_GRID_WIDTH,
    height = THUMBNAIL_GRID_HEIGHT,
    quality = THUMBNAIL_GRID_QUALITY,
    second,
    cropType = 3,
  } = options;

  let url =
    `${THUMBNAIL_CDN_URL}/p/${partnerId}` +
    `/thumbnail/entry_id/${entryId}` +
    `/width/${width}/height/${height}` +
    `/quality/${quality}/type/${cropType}`;

  if (second !== undefined) {
    url += `/vid_sec/${second}`;
  }

  return url;
}

/** Build a grid-sized thumbnail URL */
export function buildGridThumbnailUrl(partnerId: number, entryId: string): string {
  return buildThumbnailUrl(partnerId, entryId, {
    width: THUMBNAIL_GRID_WIDTH,
    height: THUMBNAIL_GRID_HEIGHT,
  });
}

/** Build a list-sized thumbnail URL */
export function buildListThumbnailUrl(partnerId: number, entryId: string): string {
  return buildThumbnailUrl(partnerId, entryId, {
    width: THUMBNAIL_LIST_WIDTH,
    height: THUMBNAIL_LIST_HEIGHT,
  });
}

/** Build hover-scrub thumbnail URLs (N frames evenly spaced) */
export function buildHoverScrubUrls(
  partnerId: number,
  entryId: string,
  duration: number,
  frameCount: number = 10,
): string[] {
  if (duration <= 0 || frameCount <= 0) return [];

  const interval = duration / (frameCount + 1);
  return Array.from({ length: frameCount }, (_, i) =>
    buildThumbnailUrl(partnerId, entryId, {
      second: Math.round(interval * (i + 1)),
      quality: 50,
    }),
  );
}
