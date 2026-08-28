import { describe, expect, it } from "vitest";
import { MAX_BATCHES, maxTotalCrawl, nextCrawlLimit } from "./leadgen-limits";

describe("lead sourcing caps", () => {
  it("over-sources ~3x the qualified target on the first batch", () => {
    expect(nextCrawlLimit(5, 0, 0)).toBe(15);
    expect(nextCrawlLimit(25, 0, 0)).toBe(75);
    expect(nextCrawlLimit(50, 0, 0)).toBe(80);
  });

  it("keeps sourcing more when qualification filters candidates out", () => {
    // target 5, only 2 accepted from the first 15 places -> crawl more
    const second = nextCrawlLimit(5, 2, 15);
    expect(second).toBeGreaterThan(15);
    expect(second).toBeLessThanOrEqual(maxTotalCrawl(5));
  });

  it("never exceeds the hard ceiling however many rounds run", () => {
    for (const target of [5, 25, 50]) {
      let limit = nextCrawlLimit(target, 0, 0);
      for (let i = 1; i < MAX_BATCHES; i += 1) limit = nextCrawlLimit(target, 0, limit);
      expect(limit).toBeLessThanOrEqual(maxTotalCrawl(target));
      expect(limit).toBeLessThanOrEqual(200);
    }
  });

  it("stops growing once the target is met", () => {
    expect(nextCrawlLimit(5, 5, 15)).toBe(20); // caller only calls this while short
    expect(maxTotalCrawl(5)).toBe(30);
  });
});
