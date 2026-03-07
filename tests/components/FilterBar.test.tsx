import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  FilterBar,
  FilterState,
  defaultFilters,
  countActiveFilters,
  dateRangeToTimestamp,
} from "../../src/components/FilterBar";

describe("FilterBar", () => {
  const defaultProps = {
    filters: defaultFilters,
    onFiltersChange: jest.fn(),
    activeFilterCount: 0,
  };

  beforeEach(() => jest.clearAllMocks());

  it("renders Filters button", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByText("Filters")).toBeTruthy();
  });

  it("shows active filter count in button text", () => {
    render(<FilterBar {...defaultProps} activeFilterCount={3} />);
    expect(screen.getByText("Filters (3)")).toBeTruthy();
  });

  it("shows Clear all when filters are active", () => {
    render(<FilterBar {...defaultProps} activeFilterCount={2} />);
    expect(screen.getByText("Clear all")).toBeTruthy();
  });

  it("hides Clear all when no filters active", () => {
    render(<FilterBar {...defaultProps} activeFilterCount={0} />);
    expect(screen.queryByText("Clear all")).toBeNull();
  });

  it("calls onFiltersChange with defaults when Clear all clicked", () => {
    render(<FilterBar {...defaultProps} activeFilterCount={1} />);
    fireEvent.click(screen.getByText("Clear all"));
    expect(defaultProps.onFiltersChange).toHaveBeenCalledWith(defaultFilters);
  });

  it("expands filter panel when Filters button clicked", () => {
    const { container } = render(<FilterBar {...defaultProps} />);
    // Initially no pickers visible
    expect(container.querySelectorAll("sp-picker").length).toBe(0);

    fireEvent.click(screen.getByText("Filters"));
    // After expand, pickers should be visible
    expect(container.querySelectorAll("sp-picker").length).toBe(3);
  });

  it("collapses filter panel when Filters button clicked again", () => {
    const { container } = render(<FilterBar {...defaultProps} />);
    fireEvent.click(screen.getByText("Filters"));
    expect(container.querySelectorAll("sp-picker").length).toBe(3);

    fireEvent.click(screen.getByText("Filters"));
    expect(container.querySelectorAll("sp-picker").length).toBe(0);
  });
});

describe("countActiveFilters", () => {
  it("returns 0 for default filters", () => {
    expect(countActiveFilters(defaultFilters)).toBe(0);
  });

  it("counts mediaType filter", () => {
    expect(countActiveFilters({ ...defaultFilters, mediaType: 1 })).toBe(1);
  });

  it("counts dateRange filter", () => {
    expect(countActiveFilters({ ...defaultFilters, dateRange: "week" })).toBe(1);
  });

  it("counts ownerFilter when not 'all'", () => {
    expect(countActiveFilters({ ...defaultFilters, ownerFilter: "mine" })).toBe(1);
  });

  it("counts categoryId filter", () => {
    expect(countActiveFilters({ ...defaultFilters, categoryId: 42 })).toBe(1);
  });

  it("counts multiple active filters", () => {
    const filters: FilterState = {
      mediaType: 1,
      dateRange: "month",
      ownerFilter: "mine",
      categoryId: 5,
    };
    expect(countActiveFilters(filters)).toBe(4);
  });
});

describe("dateRangeToTimestamp", () => {
  it("returns undefined for null", () => {
    expect(dateRangeToTimestamp(null)).toBeUndefined();
  });

  it("returns timestamp for week", () => {
    const result = dateRangeToTimestamp("week");
    const now = Math.floor(Date.now() / 1000);
    expect(result).toBeGreaterThan(now - 7 * 86400 - 5);
    expect(result).toBeLessThanOrEqual(now - 7 * 86400 + 5);
  });

  it("returns timestamp for month", () => {
    const result = dateRangeToTimestamp("month");
    const now = Math.floor(Date.now() / 1000);
    expect(result).toBeGreaterThan(now - 30 * 86400 - 5);
  });

  it("returns timestamp for quarter", () => {
    const result = dateRangeToTimestamp("quarter");
    const now = Math.floor(Date.now() / 1000);
    expect(result).toBeGreaterThan(now - 90 * 86400 - 5);
  });

  it("returns timestamp for year", () => {
    const result = dateRangeToTimestamp("year");
    const now = Math.floor(Date.now() / 1000);
    expect(result).toBeGreaterThan(now - 365 * 86400 - 5);
  });
});
