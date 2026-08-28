/**
 * Sourcing safety caps for lead generation.
 *
 * `requested` is the number of QUALIFIED leads the user wants, so jobs
 * deliberately over-source: many scraped businesses are filtered out by
 * location validation, OpenAI qualification or dedup.
 */
export const MAX_BATCHES = 4; // sourcing rounds per job
export const MAX_CRAWL_PER_BATCH = 80; // extra places Apify may crawl in one round
export const MAX_JOB_MS = 15 * 60 * 1000; // wall-clock budget for a whole job

/** Total places a job may ever crawl, scaled to the target with a hard ceiling. */
export function maxTotalCrawl(target: number) {
  return Math.min(200, Math.max(15, target * 6));
}

/** Cumulative crawl size for the next sourcing batch (~3x the leads still needed). */
export function nextCrawlLimit(target: number, accepted: number, currentLimit: number) {
  const remaining = Math.max(0, target - accepted);
  const want = currentLimit + Math.max(5, remaining * 3);
  return Math.min(maxTotalCrawl(target), Math.max(currentLimit + 5, want), currentLimit + MAX_CRAWL_PER_BATCH);
}
