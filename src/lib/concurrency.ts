/**
 * Concurrency helpers for the lead pipeline.
 *
 * Provides an adaptive worker pool (scales parallel requests up while the
 * provider is happy, backs off the moment it rate limits) and retry with
 * exponential backoff for individual failed requests — a single failure never
 * restarts the pipeline.
 */

export type RetryClass = "RETRY" | "FATAL";

/** Classify a provider error: only rate limits / transient upstream faults retry. */
export function classifyError(error: unknown): RetryClass {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  if (message.includes("rate limit") || message.includes("429")) return "RETRY";
  if (/\b5\d\d\b/.test(message)) return "RETRY";
  if (message.includes("timeout") || message.includes("fetch failed") || message.includes("network")) return "RETRY";
  return "FATAL";
}

export function isRateLimit(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  return message.includes("rate limit") || message.includes("429");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retry one unit of work with exponential backoff + jitter. Never retries fatal errors. */
export async function withRetry<T>(
  run: () => Promise<T>,
  options: { retries?: number; baseMs?: number; onRetry?: (attempt: number, error: unknown) => void } = {},
): Promise<T> {
  const retries = options.retries ?? 3;
  const baseMs = options.baseMs ?? 600;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (classifyError(error) === "FATAL" || attempt === retries) throw error;
      options.onRetry?.(attempt + 1, error);
      const backoff = baseMs * 2 ** attempt;
      await sleep(backoff + Math.random() * backoff * 0.3);
    }
  }
  throw lastError;
}

export type PoolOptions = {
  /** Starting parallel requests. */
  concurrency?: number;
  /** Never exceed this many parallel requests. */
  maxConcurrency?: number;
  /** Never drop below this many parallel requests. */
  minConcurrency?: number;
  retries?: number;
};

export type PoolResult<T> = {
  results: T[];
  failures: Array<{ index: number; error: string }>;
  /** Concurrency the pool settled on — useful for tuning/logging. */
  finalConcurrency: number;
};

/**
 * Runs `task` over `items` with a bounded, self-tuning pool.
 * Rate-limit responses halve the active concurrency; sustained successes grow
 * it back one slot at a time, so we stay as fast as the provider allows.
 */
export async function mapPool<I, O>(
  items: I[],
  task: (item: I, index: number) => Promise<O>,
  options: PoolOptions = {},
): Promise<PoolResult<O>> {
  const max = Math.max(1, options.maxConcurrency ?? 24);
  const min = Math.max(1, Math.min(options.minConcurrency ?? 2, max));
  let limit = Math.max(min, Math.min(options.concurrency ?? 10, max));

  const results: O[] = [];
  const failures: Array<{ index: number; error: string }> = [];
  let cursor = 0;
  let active = 0;
  let successStreak = 0;

  return await new Promise<PoolResult<O>>((resolve) => {
    const settle = () => {
      if (active === 0 && cursor >= items.length) {
        resolve({ results, failures, finalConcurrency: limit });
      }
    };

    const pump = () => {
      while (active < limit && cursor < items.length) {
        const index = cursor++;
        active += 1;
        withRetry(() => task(items[index] as I, index), {
          retries: options.retries ?? 3,
          onRetry: (_attempt, error) => {
            if (isRateLimit(error)) {
              limit = Math.max(min, Math.floor(limit / 2));
              successStreak = 0;
            }
          },
        })
          .then((value) => {
            results.push(value);
            successStreak += 1;
            if (successStreak >= 4 && limit < max) {
              limit += 1;
              successStreak = 0;
            }
          })
          .catch((error: unknown) => {
            failures.push({ index, error: error instanceof Error ? error.message : String(error) });
          })
          .finally(() => {
            active -= 1;
            if (cursor < items.length) pump();
            else settle();
          });
      }
      settle();
    };

    pump();
  });
}

/** Split a list into fixed-size chunks. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  const step = Math.max(1, size);
  for (let i = 0; i < items.length; i += step) out.push(items.slice(i, i + step));
  return out;
}

/** Simple stage timer used to log where a run spends its time. */
export function createStageTimer() {
  const timings: Record<string, number> = {};
  return {
    async time<T>(stage: string, run: () => Promise<T>): Promise<T> {
      const started = Date.now();
      try {
        return await run();
      } finally {
        timings[stage] = (timings[stage] ?? 0) + (Date.now() - started);
      }
    },
    add(stage: string, ms: number) {
      timings[stage] = (timings[stage] ?? 0) + ms;
    },
    /** Timings plus the slowest stage, so bottlenecks surface automatically. */
    summary() {
      const entries = Object.entries(timings);
      const slowest = entries.sort((a, b) => b[1] - a[1])[0];
      return {
        ...timings,
        total_ms: entries.reduce((sum, [, ms]) => sum + ms, 0),
        bottleneck: slowest?.[0] ?? null,
        bottleneck_ms: slowest?.[1] ?? 0,
      };
    },
  };
}
