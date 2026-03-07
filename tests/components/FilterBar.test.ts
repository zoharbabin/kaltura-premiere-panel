import {
  countActiveFilters,
  dateRangeToTimestamp,
  defaultFilters,
} from "../../src/components/FilterBar";
import { KalturaMediaType } from "../../src/types/kaltura";

describe("FilterBar utilities", () => {
  describe("countActiveFilters()", () => {
    it("returns 0 for default filters", () => {
      expect(countActiveFilters(defaultFilters)).toBe(0);
    });

    it("counts mediaType filter", () => {
      expect(countActiveFilters({ ...defaultFilters, mediaType: KalturaMediaType.VIDEO })).toBe(1);
    });

    it("counts dateRange filter", () => {
      expect(countActiveFilters({ ...defaultFilters, dateRange: "month" })).toBe(1);
    });

    it("counts ownerFilter when not 'all'", () => {
      expect(countActiveFilters({ ...defaultFilters, ownerFilter: "mine" })).toBe(1);
    });

    it("counts categoryId filter", () => {
      expect(countActiveFilters({ ...defaultFilters, categoryId: 42 })).toBe(1);
    });

    it("counts multiple active filters", () => {
      expect(
        countActiveFilters({
          mediaType: KalturaMediaType.AUDIO,
          dateRange: "week",
          ownerFilter: "mine",
          categoryId: 10,
        }),
      ).toBe(4);
    });
  });

  describe("dateRangeToTimestamp()", () => {
    it("returns undefined for null", () => {
      expect(dateRangeToTimestamp(null)).toBeUndefined();
    });

    it("returns a timestamp for 'week'", () => {
      const result = dateRangeToTimestamp("week");
      expect(result).toBeDefined();
      const now = Math.floor(Date.now() / 1000);
      // Should be approximately 7 days ago
      expect(now - result!).toBeGreaterThan(6 * 86400);
      expect(now - result!).toBeLessThan(8 * 86400);
    });

    it("returns a timestamp for 'month'", () => {
      const result = dateRangeToTimestamp("month");
      expect(result).toBeDefined();
      const now = Math.floor(Date.now() / 1000);
      expect(now - result!).toBeGreaterThan(29 * 86400);
      expect(now - result!).toBeLessThan(31 * 86400);
    });

    it("returns a timestamp for 'quarter'", () => {
      const result = dateRangeToTimestamp("quarter");
      expect(result).toBeDefined();
      const now = Math.floor(Date.now() / 1000);
      expect(now - result!).toBeGreaterThan(89 * 86400);
      expect(now - result!).toBeLessThan(91 * 86400);
    });

    it("returns a timestamp for 'year'", () => {
      const result = dateRangeToTimestamp("year");
      expect(result).toBeDefined();
      const now = Math.floor(Date.now() / 1000);
      expect(now - result!).toBeGreaterThan(364 * 86400);
      expect(now - result!).toBeLessThan(366 * 86400);
    });
  });
});
