import { describe, expect, it } from "vitest";
import { sampleQuestions } from "@/content/sample-questions";
import { largestSwing } from "@/lib/swing";

describe("largestSwing", () => {
  it("returns null for a flat history", () => {
    expect(largestSwing([50, 50, 50, 50, 50, 50, 50, 50])).toBeNull();
  });

  it("returns null for a history too short to move", () => {
    expect(largestSwing([])).toBeNull();
    expect(largestSwing([50])).toBeNull();
  });

  it("returns null when no window reaches 5 points", () => {
    expect(largestSwing([50, 51, 52, 53, 54])).toBeNull();
    expect(largestSwing([50, 54])).toBeNull();
  });

  it("counts exactly 5 points as a swing", () => {
    expect(largestSwing([50, 55])).toEqual({ startIndex: 0, endIndex: 1, from: 50, to: 55, change: 5 });
  });

  it("finds a sharp one-day drop", () => {
    expect(largestSwing([57, 57, 57, 51, 51, 51])).toEqual({ startIndex: 2, endIndex: 3, from: 57, to: 51, change: -6 });
  });

  it("finds a rise spread over several days", () => {
    expect(largestSwing([40, 42, 44, 45, 47, 47])).toEqual({ startIndex: 0, endIndex: 4, from: 40, to: 47, change: 7 });
  });

  it("ignores a slow drift that never swings within 7 days", () => {
    // 5 points over 10 days, but no 7-day window moves by 5.
    expect(largestSwing([60, 60, 59, 59, 58, 58, 57, 57, 56, 56, 55])).toBeNull();
  });

  it("prefers the shorter move on a tie, then the most recent", () => {
    // A 6-point rise in a day, a 6-point fall in a day, and a 6-point fall over two days.
    expect(largestSwing([50, 56, 56, 50])).toEqual({ startIndex: 2, endIndex: 3, from: 56, to: 50, change: -6 });
  });

  it("respects a custom window", () => {
    expect(largestSwing([50, 55, 60], 1)).toEqual({ startIndex: 1, endIndex: 2, from: 55, to: 60, change: 5 });
    expect(largestSwing([50, 55, 60], 1)).not.toEqual({ startIndex: 0, endIndex: 2, from: 50, to: 60, change: 10 });
  });

  it("names the Bank of Canada question's sharp December drop", () => {
    const boc = sampleQuestions.find((q) => q.slug === "boc-cut-dec-2026")!;
    expect(largestSwing(boc.history)).toEqual({ startIndex: 12, endIndex: 17, from: 54, to: 40, change: -14 });
  });

  it("catches a swing exactly at the threshold in the jobs question", () => {
    const jobs = sampleQuestions.find((q) => q.slug === "jobs-rate-oct-2026")!;
    expect(largestSwing(jobs.history)).toEqual({ startIndex: 23, endIndex: 28, from: 54, to: 49, change: -5 });
  });

  it("returns null for a question whose crowd barely moved", () => {
    const home = sampleQuestions.find((q) => q.slug === "home-prices-nov-2026")!;
    expect(largestSwing(home.history)).toBeNull();
  });
});
