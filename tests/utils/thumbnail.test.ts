import { buildThumbnailUrl, buildGridThumbnailUrl } from "../../src/utils/thumbnail";

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
