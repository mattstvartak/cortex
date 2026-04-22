import type { Logger, SourceAdapter } from "@cortex/core";

/**
 * Adapter scheduler. Runs each enabled adapter on its cron schedule.
 *
 * Phase 1 stub — no cron, no runtime. Just the shape. Real implementation
 * will use node-cron or an interval loop plus per-adapter concurrency caps.
 */
export interface Scheduler {
  register(adapter: SourceAdapter, schedule: string | undefined): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createScheduler(_logger: Logger): Scheduler {
  // TODO: implement in Phase 4 when the first adapter goes live.
  return {
    register() {
      /* stub */
    },
    async start() {
      /* stub */
    },
    async stop() {
      /* stub */
    },
  };
}
