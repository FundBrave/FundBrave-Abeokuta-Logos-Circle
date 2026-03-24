/**
 * Shared utilities: retry logic and consecutive-failure tracking.
 * W-H2: Exponential backoff retry for network calls.
 */

import { logger } from "./logger";

/**
 * Retry an async function with exponential backoff.
 * Default: 3 retries with delays 1s → 2s → 4s.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  label = "operation"
): Promise<T> {
  let delay = 1_000;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      logger.warn(`[retry] ${label} failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms`, {
        error: String(err),
      });
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
  // TypeScript requires this — unreachable in practice
  throw new Error("unreachable");
}

/**
 * Tracks consecutive failures for a named operation.
 * Emits an alert log when the threshold is exceeded.
 * W-H2: Alert if > 5 consecutive failures.
 */
export class FailureTracker {
  private count = 0;

  constructor(
    private readonly label: string,
    private readonly alertThreshold = 5
  ) {}

  record(): void {
    this.count++;
    if (this.count >= this.alertThreshold) {
      logger.error(
        `[alert] ${this.label} has failed ${this.count} consecutive times — manual intervention may be required`
      );
    }
  }

  reset(): void {
    if (this.count > 0) {
      logger.info(`[recovery] ${this.label} recovered after ${this.count} consecutive failures`);
    }
    this.count = 0;
  }

  get failures(): number {
    return this.count;
  }
}
