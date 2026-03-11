import {
  THUMBNAIL_CDN_URL,
  THUMBNAIL_GRID_WIDTH,
  THUMBNAIL_GRID_HEIGHT,
  THUMBNAIL_GRID_QUALITY,
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
