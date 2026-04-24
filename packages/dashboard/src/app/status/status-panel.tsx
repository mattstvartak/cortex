"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Hash,
  Play,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface AdapterStats {
  schedule?: string;
  lastRunAt?: string;
  lastRunMs?: number;
  lastRunIngested?: number;
  runs: number;
  errors: number;
  running: boolean;
}

interface StatusPayload {
  running: boolean;
  pid?: number;
  startedAt?: string;
  lastHeartbeatAt?: string;
  uptimeMs?: number;
  mcp?: { connected: boolean; transport: string };
  upstream?: { engram: boolean; persona: boolean };
  adapters?: Record<string, AdapterStats>;
}

export function StatusPanel(): React.JSX.Element {
  const [status, setStatus] = useState<StatusPayload | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [fetchedAt, setFetchedAt] = useState<number | undefined>();

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const r = await fetch("/api/cortex/status", { cache: "no-store" });
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        if (cancelled) return;
        setStatus((await r.json()) as StatusPayload);
        setFetchedAt(Date.now());
        setError(undefined);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    void load();
    const id = setInterval(() => void load(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (error) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-sm text-destructive">
            Status API unreachable
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (!status) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!status.running) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cortex isn&apos;t running</CardTitle>
          <CardDescription>
            No heartbeat registered. Start the stack with{" "}
            <code className="font-mono">docker compose up -d</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const adapters = status.adapters ?? {};
  const adapterIds = Object.keys(adapters).sort();
  const totalRuns = adapterIds.reduce(
    (acc, id) => acc + (adapters[id]!.runs ?? 0),
    0,
  );
  const totalErrors = adapterIds.reduce(
    (acc, id) => acc + (adapters[id]!.errors ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Uptime"
          value={formatUptime(status.uptimeMs ?? 0)}
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label="PID"
          value={String(status.pid ?? "?")}
          icon={<Hash className="h-4 w-4" />}
        />
        <StatCard
          label="MCP transport"
          value={status.mcp?.transport ?? "?"}
          icon={<Play className="h-4 w-4" />}
          tone={status.mcp?.connected ? "ok" : "warn"}
        />
        <StatCard
          label="Adapter runs"
          value={`${totalRuns} (${totalErrors} err)`}
          icon={<Activity className="h-4 w-4" />}
          tone={totalErrors === 0 ? "ok" : "warn"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upstream MCPs</CardTitle>
          <CardDescription>
            Engram and Persona run as stdio children inside the cortex
            container. Health last checked{" "}
            {fetchedAt ? formatRelative(fetchedAt) : "just now"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <UpstreamRow
            name="engram"
            healthy={status.upstream?.engram === true}
          />
          <UpstreamRow
            name="persona"
            healthy={status.upstream?.persona === true}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adapters</CardTitle>
          <CardDescription>
            Scheduled runs, last ingest, totals since boot.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {adapterIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No adapters registered.
            </p>
          ) : (
            <div className="grid gap-2">
              {adapterIds.map((id) => (
                <AdapterRow
                  key={id}
                  id={id}
                  stats={adapters[id]!}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {status.startedAt && (
        <p className="text-xs text-muted-foreground">
          Started {new Date(status.startedAt).toLocaleString()} · last
          heartbeat{" "}
          {status.lastHeartbeatAt
            ? new Date(status.lastHeartbeatAt).toLocaleTimeString()
            : "—"}
        </p>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "ok" | "warn";
}): React.JSX.Element {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-xs uppercase tracking-wider">{label}</span>
        </div>
        <p
          className={cn(
            "mt-1 text-lg font-semibold",
            tone === "warn" && "text-amber-600 dark:text-amber-400",
            tone === "ok" && "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function UpstreamRow({
  name,
  healthy,
}: {
  name: string;
  healthy: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <span className="font-mono text-sm">{name}</span>
      {healthy ? (
        <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          healthy
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          unreachable
        </span>
      )}
    </div>
  );
}

function AdapterRow({
  id,
  stats,
}: {
  id: string;
  stats: AdapterStats;
}): React.JSX.Element {
  const hasErrors = (stats.errors ?? 0) > 0;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
      <span className="font-mono text-sm font-medium">{id}</span>
      {stats.running && (
        <Badge variant="secondary" className="text-[10px] uppercase">
          running
        </Badge>
      )}
      {stats.schedule && (
        <Badge variant="outline" className="font-mono text-[10px]">
          {stats.schedule}
        </Badge>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span>
          runs: <span className="font-medium text-foreground">{stats.runs}</span>
        </span>
        <span className={cn(hasErrors && "text-destructive")}>
          errors:{" "}
          <span className="font-medium">{stats.errors}</span>
        </span>
        {stats.lastRunIngested !== undefined && (
          <span>
            last ingest:{" "}
            <span className="font-medium text-foreground">
              {stats.lastRunIngested}
            </span>
          </span>
        )}
        {stats.lastRunAt && (
          <span title={stats.lastRunAt}>
            {formatRelative(new Date(stats.lastRunAt).getTime())}
          </span>
        )}
      </div>
    </div>
  );
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ${seconds % 60}s`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function formatRelative(ts: number): string {
  const diffSec = Math.round((Date.now() - ts) / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
