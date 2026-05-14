"use client";

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Terminal,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SyncEvent {
  ts: string;
  level: string;
  msg: string;
  adapter?: string;
  sourceId?: string;
  ingested?: number;
  errors?: number;
  durationMs?: number;
  error?: string;
}

interface RunState {
  adapter: string;
  startedAt: number;
  ingested: number;
  errors: number;
  lastItem?: string;
  done: boolean;
  resultMs?: number;
  resultError?: string;
}

const SYNC_MSG_WHITELIST = new Set([
  "api.adapter.sync_begin",
  "api.adapter.sync_done",
  "api.adapter.sync_failed",
  "scheduler.run_begin",
  "scheduler.run_done",
  "scheduler.run_failed",
  "sync.run.trace",
  "sync.limit_reached",
  "ingest.item_ok",
  "ingest.item_failed",
]);

const MAX_LINES = 400;

/**
 * Persistent terminal-style dock anchored to the bottom of the
 * viewport. Subscribes to the cortex log SSE and filters for sync
 * events, surfacing per-item progress in a familiar terminal idiom.
 *
 * Collapsed: slim status bar showing the active run (if any).
 * Expanded: scrolling line feed + counters, click outside to dismiss.
 */
export function SyncDock(): React.JSX.Element | null {
  const [lines, setLines] = React.useState<SyncEvent[]>([]);
  const [expanded, setExpanded] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  const [runs, setRuns] = React.useState<Record<string, RunState>>({});
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const es = new EventSource("/api/cortex/logs/stream");

    es.onmessage = (evt) => {
      try {
        const line = JSON.parse(evt.data) as SyncEvent;
        if (!SYNC_MSG_WHITELIST.has(line.msg)) return;

        setLines((prev) => {
          const next = [...prev, line];
          if (next.length > MAX_LINES) next.splice(0, next.length - MAX_LINES);
          return next;
        });

        if (line.adapter) {
          setRuns((prev) => {
            const existing = prev[line.adapter!];
            if (
              line.msg === "api.adapter.sync_begin" ||
              line.msg === "scheduler.run_begin" ||
              line.msg === "sync.run.trace"
            ) {
              return {
                ...prev,
                [line.adapter!]: {
                  adapter: line.adapter!,
                  startedAt: Date.now(),
                  ingested: existing?.ingested ?? 0,
                  errors: existing?.errors ?? 0,
                  done: false,
                },
              };
            }
            if (line.msg === "ingest.item_ok") {
              return {
                ...prev,
                [line.adapter!]: {
                  ...(existing ?? {
                    adapter: line.adapter!,
                    startedAt: Date.now(),
                    ingested: 0,
                    errors: 0,
                    done: false,
                  }),
                  ingested: (existing?.ingested ?? 0) + 1,
                  ...(line.sourceId ? { lastItem: line.sourceId } : {}),
                },
              };
            }
            if (line.msg === "ingest.item_failed") {
              return {
                ...prev,
                [line.adapter!]: {
                  ...(existing ?? {
                    adapter: line.adapter!,
                    startedAt: Date.now(),
                    ingested: 0,
                    errors: 0,
                    done: false,
                  }),
                  errors: (existing?.errors ?? 0) + 1,
                  ...(line.sourceId ? { lastItem: line.sourceId } : {}),
                },
              };
            }
            if (
              line.msg === "api.adapter.sync_done" ||
              line.msg === "scheduler.run_done"
            ) {
              return {
                ...prev,
                [line.adapter!]: {
                  ...(existing ?? {
                    adapter: line.adapter!,
                    startedAt: Date.now(),
                    ingested: 0,
                    errors: 0,
                    done: false,
                  }),
                  ingested: line.ingested ?? existing?.ingested ?? 0,
                  errors: line.errors ?? existing?.errors ?? 0,
                  done: true,
                  ...(line.durationMs !== undefined ? { resultMs: line.durationMs } : {}),
                },
              };
            }
            if (
              line.msg === "api.adapter.sync_failed" ||
              line.msg === "scheduler.run_failed"
            ) {
              return {
                ...prev,
                [line.adapter!]: {
                  ...(existing ?? {
                    adapter: line.adapter!,
                    startedAt: Date.now(),
                    ingested: 0,
                    errors: 1,
                    done: false,
                  }),
                  done: true,
                  ...(line.error ? { resultError: line.error } : {}),
                },
              };
            }
            return prev;
          });

          // Auto-surface the dock when a new run begins.
          if (
            line.msg === "api.adapter.sync_begin" ||
            line.msg === "scheduler.run_begin"
          ) {
            setHidden(false);
          }
        }
      } catch {
        // malformed frame — skip
      }
    };
    return () => es.close();
  }, []);

  React.useEffect(() => {
    if (!expanded) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, expanded]);

  if (hidden) return null;

  const activeRuns = Object.values(runs).filter((r) => !r.done);
  const recentRuns = Object.values(runs)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 4);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center">
      <div
        className={cn(
          "pointer-events-auto w-full max-w-5xl overflow-hidden border-t border-x border-border bg-card shadow-lg transition-[height] duration-200",
          expanded ? "rounded-t-lg" : "rounded-t-md",
        )}
        style={{ height: expanded ? 320 : 40 }}
      >
        {/* Header bar — always visible */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex h-10 w-full items-center gap-2 px-3 text-left transition-colors hover:bg-accent"
        >
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium">Sync</span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {activeRuns.length > 0 ? (
              activeRuns.map((r) => (
                <ActiveBadge key={r.adapter} run={r} />
              ))
            ) : recentRuns.length > 0 ? (
              <span>
                last: {recentRuns[0]!.adapter} — {recentRuns[0]!.ingested}{" "}
                ingested, {recentRuns[0]!.errors} errors
                {recentRuns[0]!.resultMs !== undefined &&
                  `, ${recentRuns[0]!.resultMs}ms`}
              </span>
            ) : (
              <span>idle</span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">
              {expanded ? "hide" : "show"}
            </span>
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                setHidden(true);
              }}
              aria-label="Dismiss sync dock"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </button>

        {expanded && (
          <div className="flex h-[280px] flex-col">
            <div className="flex flex-wrap gap-2 border-b bg-muted/30 px-3 py-2">
              {recentRuns.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  Nothing syncing yet. Hit Run now on /adapters or wait for a
                  scheduled run.
                </span>
              )}
              {recentRuns.map((r) => (
                <RunChip key={r.adapter + r.startedAt} run={r} />
              ))}
            </div>
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto bg-muted/10 p-2 font-mono text-xs leading-relaxed"
            >
              {lines.length === 0 ? (
                <p className="p-2 text-muted-foreground">
                  Waiting for sync activity…
                </p>
              ) : (
                lines.map((line, i) => <DockLine key={i} line={line} />)
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActiveBadge({ run }: { run: RunState }): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Loader2 className="h-3 w-3 animate-spin text-primary" />
      <span className="font-mono">{run.adapter}</span>
      <span className="tabular-nums">
        {run.ingested} ingested
        {run.errors > 0 && (
          <span className="text-destructive"> / {run.errors} err</span>
        )}
      </span>
    </span>
  );
}

function RunChip({ run }: { run: RunState }): React.JSX.Element {
  const Icon = run.done
    ? run.resultError || run.errors > 0
      ? AlertCircle
      : CheckCircle2
    : Loader2;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-mono",
        run.done && run.resultError && "border-destructive/40 text-destructive",
        run.done && !run.resultError && run.errors === 0 && "border-mint/40 text-mint",
      )}
    >
      <Icon className={cn("h-3 w-3", !run.done && "animate-spin")} />
      {run.adapter}
      <span className="text-muted-foreground">
        · {run.ingested}{" "}
        {run.errors > 0 && <span className="text-destructive">/ {run.errors} err</span>}
        {run.resultMs !== undefined && ` · ${run.resultMs}ms`}
      </span>
    </Badge>
  );
}

function DockLine({ line }: { line: SyncEvent }): React.JSX.Element {
  const t = new Date(line.ts);
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  const ss = String(t.getSeconds()).padStart(2, "0");

  let body: string;
  switch (line.msg) {
    case "api.adapter.sync_begin":
    case "scheduler.run_begin":
      body = `▶ sync started · ${line.adapter ?? "?"}`;
      break;
    case "sync.run.trace":
      body = `  trace ${(line as SyncEvent & { traceId?: string }).traceId ?? ""} · ${line.adapter ?? "?"}`;
      break;
    case "ingest.item_ok":
      body = `  ✓ ${line.sourceId ?? "(unnamed)"}`;
      break;
    case "ingest.item_failed":
      body = `  ✗ ${line.sourceId ?? "(unnamed)"} — ${line.error ?? "failed"}`;
      break;
    case "sync.limit_reached":
      body = `  ⚑ limit reached`;
      break;
    case "api.adapter.sync_done":
    case "scheduler.run_done":
      body = `■ sync done · ${line.adapter ?? "?"} · ${line.ingested ?? 0} ingested, ${line.errors ?? 0} errors${line.durationMs !== undefined ? `, ${line.durationMs}ms` : ""}`;
      break;
    case "api.adapter.sync_failed":
    case "scheduler.run_failed":
      body = `■ sync failed · ${line.adapter ?? "?"} — ${line.error ?? "error"}`;
      break;
    default:
      body = `${line.msg}${line.adapter ? ` · ${line.adapter}` : ""}`;
  }

  const tone =
    line.level === "error" || line.msg.endsWith("failed")
      ? "text-destructive"
      : line.msg === "api.adapter.sync_done" || line.msg === "scheduler.run_done"
        ? "text-mint"
        : line.msg === "api.adapter.sync_begin" ||
            line.msg === "scheduler.run_begin"
          ? "text-primary"
          : "text-foreground";

  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground tabular-nums">
        {hh}:{mm}:{ss}
      </span>
      <span className={cn("whitespace-pre", tone)}>{body}</span>
    </div>
  );
}
