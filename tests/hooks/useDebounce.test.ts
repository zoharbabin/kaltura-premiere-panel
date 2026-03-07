import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "../../src/hooks/useDebounce";

describe("useDebounce", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("hello", 500));
    expect(result.current).toBe("hello");
  });

  it("returns debounced value after delay", () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: "initial", delay: 500 },
    });

    rerender({ value: "updated", delay: 500 });

    // Value should still be the initial one before the delay elapses
    expect(result.current).toBe("initial");

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current).toBe("updated");
  });

  it("resets timer on rapid value changes and only keeps the last value", () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: "a", delay: 300 },
    });

    rerender({ value: "b", delay: 300 });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    rerender({ value: "c", delay: 300 });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    rerender({ value: "d", delay: 300 });

    // Not enough time has passed for any debounced update
    expect(result.current).toBe("a");

    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Only the last value should survive
    expect(result.current).toBe("d");
  });

  it("works with different delay values", () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 1, delay: 200 },
    });

    rerender({ value: 2, delay: 200 });

    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(result.current).toBe(2);

    // Change to a longer delay
    rerender({ value: 3, delay: 1000 });

    act(() => {
      jest.advanceTimersByTime(500);
    });

    // Should still be 2 because 1000ms hasn't elapsed
    expect(result.current).toBe(2);

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current).toBe(3);
  });
});
