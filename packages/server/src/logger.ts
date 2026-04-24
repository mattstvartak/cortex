import type { Logger } from "@onenomad/cortex-core";
import { getSharedLogBus, type LogLine } from "./log-bus.js";

/**
 * Minimal console logger. Structured enough for grep; swap for pino/winston
 * when ops need it.
 *
 * Every line is written to stderr (for Docker's log driver) and also
 * appended to the shared log bus so the dashboard's /api/logs/stream
 * SSE endpoint can fan it out to browsers in real time.
 */
export function createLogger(
  bindings: Record<string, unknown> = {},
): Logger {
  const bus = getSharedLogBus();
  const log = (level: string, message: string, meta?: Record<string, unknown>): void => {
    const line: LogLine = {
      ts: new Date().toISOString(),
      level,
      msg: message,
      ...bindings,
      ...meta,
    };
    // Always stderr. The MCP stdio transport owns stdout for protocol framing;
    // writing logs there would corrupt it.
    process.stderr.write(`${JSON.stringify(line)}\n`);
    bus.append(line);
  };

  return {
    debug(msg, meta) {
      if (process.env.LOG_LEVEL === "debug") log("debug", msg, meta);
    },
    info(msg, meta) {
      log("info", msg, meta);
    },
    warn(msg, meta) {
      log("warn", msg, meta);
    },
    error(msg, meta) {
      log("error", msg, meta);
    },
    child(extra) {
      return createLogger({ ...bindings, ...extra });
    },
  };
}
