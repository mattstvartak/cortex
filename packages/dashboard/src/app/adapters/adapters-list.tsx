"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Play, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

interface AdapterRow {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  schedule: string | null;
}

export function AdaptersList(): React.JSX.Element {
  const [rows, setRows] = useState<AdapterRow[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [syncTarget, setSyncTarget] = useState<AdapterRow | undefined>();

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/cortex/config/adapters", {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const body = (await r.json()) as { adapters: AdapterRow[] };
      setRows(body.adapters);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function toggle(id: string, next: boolean): Promise<void> {
    try {
      const r = await fetch(`/api/cortex/config/adapters/${id}/toggle`, {
        method: "POST",
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `${r.status} ${r.statusText}`);
      }
      toast.success(`${id} ${next ? "enabled" : "disabled"}`);
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  if (error) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-sm text-destructive">
            Couldn&apos;t load adapters
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (!rows) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const configured = rows.filter((r) => r.configured);
  const available = rows.filter((r) => !r.configured);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Configured ({configured.length})
        </h2>
        {configured.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No adapters configured yet. Enable one from the list below.
          </p>
        )}
        <div className="grid gap-3">
          {configured.map((r) => (
            <AdapterRowCard
              key={r.id}
              row={r}
              onToggle={toggle}
              onRunNow={(row) => setSyncTarget(row)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Available ({available.length})
        </h2>
        <div className="grid gap-3">
          {available.map((r) => (
            <AdapterRowCard
              key={r.id}
              row={r}
              onToggle={toggle}
              onRunNow={(row) => setSyncTarget(row)}
            />
          ))}
        </div>
      </section>

      <SyncDialog
        target={syncTarget}
        onClose={() => setSyncTarget(undefined)}
      />
    </div>
  );
}

function AdapterRowCard({
  row,
  onToggle,
  onRunNow,
}: {
  row: AdapterRow;
  onToggle: (id: string, next: boolean) => void | Promise<void>;
  onRunNow: (row: AdapterRow) => void;
}): React.JSX.Element {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.name}</span>
            <code className="font-mono text-xs text-muted-foreground">
              {row.id}
            </code>
            {row.enabled && (
              <Badge variant="secondary" className="text-[10px] uppercase">
                enabled
              </Badge>
            )}
            {row.schedule ? (
              <Badge variant="outline" className="font-mono text-[10px]">
                {row.schedule}
              </Badge>
            ) : row.configured ? (
              <Badge
                variant="outline"
                className="font-mono text-[10px] text-muted-foreground"
              >
                manual
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {row.description}
          </p>
        </div>

        {row.configured ? (
          <>
            <Switch
              checked={row.enabled}
              onCheckedChange={(next) => void onToggle(row.id, next)}
              aria-label={`Toggle ${row.name}`}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onRunNow(row)}
              disabled={!row.enabled}
            >
              <Play className="h-3 w-3" />
              Run now
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/adapters/${row.id}`}>
                Configure
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </>
        ) : (
          <Button size="sm" asChild>
            <Link href={`/adapters/${row.id}`}>
              <Plus className="h-3 w-3" />
              Enable
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function SyncDialog({
  target,
  onClose,
}: {
  target: AdapterRow | undefined;
  onClose: () => void;
}): React.JSX.Element {
  const [sinceIso, setSinceIso] = useState("");
  const [limit, setLimit] = useState("");
  const [running, setRunning] = useState(false);

  async function run(): Promise<void> {
    if (!target) return;
    setRunning(true);
    try {
      const body: Record<string, unknown> = {};
      if (sinceIso.trim()) body.sinceIso = sinceIso.trim();
      if (limit.trim()) {
        const n = Number.parseInt(limit.trim(), 10);
        if (!Number.isFinite(n) || n < 0) {
          toast.error("limit must be a non-negative integer");
          setRunning(false);
          return;
        }
        body.limit = n;
      }
      const r = await fetch(`/api/cortex/adapters/${target.id}/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const resBody = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        ingested?: number;
        errors?: number;
        durationMs?: number;
        error?: string;
      };
      if (!r.ok || resBody.ok === false) {
        throw new Error(resBody.error ?? `${r.status} ${r.statusText}`);
      }
      toast.success(
        `${target.id} synced — ${resBody.ingested ?? 0} ingested, ${resBody.errors ?? 0} errors, ${resBody.durationMs ?? 0}ms`,
      );
      onClose();
      setSinceIso("");
      setLimit("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run sync · {target?.name}</DialogTitle>
          <DialogDescription>
            One-off ingestion run. Both fields are optional — leave blank
            for a full sync with the adapter&apos;s own defaults.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sync-since">Since (ISO 8601)</Label>
            <Input
              id="sync-since"
              placeholder="e.g. 2026-04-01T00:00:00Z"
              value={sinceIso}
              onChange={(e) => setSinceIso(e.target.value)}
              disabled={running}
            />
            <p className="text-xs text-muted-foreground">
              Only pull items updated after this timestamp.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sync-limit">Limit</Label>
            <Input
              id="sync-limit"
              placeholder="max items (e.g. 50)"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              disabled={running}
              inputMode="numeric"
            />
            <p className="text-xs text-muted-foreground">
              Cap the number of items to ingest this run. Useful for
              testing before a full sync.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={running}
          >
            Cancel
          </Button>
          <Button onClick={() => void run()} disabled={running}>
            <Play className="h-3 w-3" />
            {running ? "Running…" : "Run sync"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
