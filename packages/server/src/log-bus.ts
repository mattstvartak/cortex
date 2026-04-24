import { EventEmitter } from "node:events";

export interface LogLine {
  ts: string;
  level: string;
  msg: string;
  [key: string]: unknown;
}

/**
 * In-memory log fanout. The logger writes every line to stderr (for
 * Docker's log driver to pick up) AND appends it to this bus so the
 * dashboard's `/api/logs/stream` SSE endpoint can serve them live.
 *
 * The ring buffer keeps the last N lines so a newly-connected client
 * gets recent context without having to tail the container log file.
 */
export class LogBus extends EventEmitter {
  private readonly capacity: number;
  private readonly ring: LogLine[] = [];

  constructor(capacity = 500) {
    super();
    this.capacity = capacity;
    // Allow many SSE subscribers without "MaxListenersExceeded" noise.
    this.setMaxListeners(100);
  }

  append(line: LogLine): void {
    this.ring.push(line);
    if (this.ring.length > this.capacity) this.ring.shift();
    this.emit("line", line);
  }

  recent(limit = this.capacity): LogLine[] {
    const n = Math.max(0, Math.min(limit, this.ring.length));
    return this.ring.slice(this.ring.length - n);
  }
}

/**
 * Process-wide singleton so every logger instance shares the same bus
 * without having to pipe it through every child() call. The API server
 * reads from it; the logger writes into it.
 */
let sharedBus: LogBus | undefined;

export function getSharedLogBus(): LogBus {
  if (!sharedBus) sharedBus = new LogBus();
  return sharedBus;
}
