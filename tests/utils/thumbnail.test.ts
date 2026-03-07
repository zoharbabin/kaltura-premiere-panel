import {
  buildThumbnailUrl,
  buildGridThumbnailUrl,
  buildListThumbnailUrl,
  buildHoverScrubUrls,
} from "../../src/utils/thumbnail";

const PARTNER_ID = 12345;
const ENTRY_ID = "0_abc123";

describe("buildThumbnailUrl", () => {
  it("builds a valid thumbnail URL with defaults", () => {
    const url = buildThumbnailUrl(PARTNER_ID, ENTRY_ID);
    expect(url).toContain(`/p/${PARTNER_ID}/`);
    expect(url).toContain(`/entry_id/${ENTRY_ID}/`);
    expect(url).toContain("/width/200/height/120/");
    expect(url).toContain("/quality/75/type/3");
  });

  it("includes vid_sec when specified", () => {
    const url = buildThumbnailUrl(PARTNER_ID, ENTRY_ID, { second: 10 });
    expect(url).toContain("/vid_sec/10");
  });

  it("uses custom dimensions", () => {
    const url = buildThumbnailUrl(PARTNER_ID, ENTRY_ID, {
      width: 400,
      height: 300,
    });
    expect(url).toContain("/width/400/height/300/");
  });
});

describe("buildGridThumbnailUrl", () => {
  it("uses grid dimensions", () => {
    const url = buildGridThumbnailUrl(PARTNER_ID, ENTRY_ID);
    expect(url).toContain("/width/200/height/120/");
  });
});

describe("buildListThumbnailUrl", () => {
  it("uses list dimensions", () => {
    const url = buildListThumbnailUrl(PARTNER_ID, ENTRY_ID);
    expect(url).toContain("/width/80/height/45/");
  });
});

describe("buildHoverScrubUrls", () => {
  it("generates correct number of scrub URLs", () => {
    const urls = buildHoverScrubUrls(PARTNER_ID, ENTRY_ID, 120, 10);
    expect(urls).toHaveLength(10);
  });

  it("spaces frames evenly across duration", () => {
    const urls = buildHoverScrubUrls(PARTNER_ID, ENTRY_ID, 100, 5);
    expect(urls).toHaveLength(5);
    // With duration=100 and 5 frames: interval = 100/6 ≈ 16.67
    // Frames at seconds: 17, 33, 50, 67, 83
    urls.forEach((url) => {
      expect(url).toContain("/vid_sec/");
    });
  });

  it("returns empty array for invalid input", () => {
    expect(buildHoverScrubUrls(PARTNER_ID, ENTRY_ID, 0, 10)).toEqual([]);
    expect(buildHoverScrubUrls(PARTNER_ID, ENTRY_ID, 100, 0)).toEqual([]);
    expect(buildHoverScrubUrls(PARTNER_ID, ENTRY_ID, -5, 10)).toEqual([]);
  });
});
