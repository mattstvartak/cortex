"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

interface ModuleRow {
  name: string;
  containerPath: string;
  hostPath: string;
  status: "ready" | "not-built" | "missing";
}

interface InstallDoneEvent {
  ok: boolean;
  name: string;
  hostPath: string;
  containerPath: string;
  toolNames: string[];
  added?: boolean;
  configPath?: string;
  error?: string;
}

interface InstallLogLine {
  kind: "log" | "step" | "warn" | "error";
  text: string;
  at: number;
}

export function ModulesList(): React.JSX.Element {
  const [rows, setRows] = useState<ModuleRow[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [installOpen, setInstallOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/cortex/modules", { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const body = (await r.json()) as { modules: ModuleRow[] };
      setRows(body.modules);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function remove(name: string): Promise<void> {
    const ok = window.confirm(
      `Unregister "${name}" from cortex.yaml? Files on disk will stay — you can rm -rf them yourself if you want.`,
    );
    if (!ok) return;
    try {
      const r = await fetch(
        `/api/cortex/modules/${encodeURIComponent(name)}`,
        { method: "DELETE" },
      );
      const body = (await r.json().catch(() => ({}))) as {
        error?: string;
        warning?: string;
      };
      if (!r.ok) throw new Error(body.error ?? `${r.status} ${r.statusText}`);
      toast.success(`Removed "${name}"`, {
        description: body.warning ?? "Restart cortex to apply.",
      });
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
            Couldn&apos;t reach the Cortex API
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {rows
            ? `${rows.length} module${rows.length === 1 ? "" : "s"} registered`
            : "Loading…"}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={!rows}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setInstallOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Install module
          </Button>
        </div>
      </div>

      {!rows && (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {rows && rows.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" />
              No private modules registered
            </CardTitle>
            <CardDescription>
              Modules let you ship Claude tools that live outside the
              public Cortex repo. Point at a git URL or a local checkout
              to install one.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {rows && rows.length > 0 && (
        <div className="grid gap-3">
          {rows.map((row) => (
            <ModuleCard key={row.containerPath} row={row} onRemove={remove} />
          ))}
        </div>
      )}

      <InstallDialog
        open={installOpen}
        onOpenChange={setInstallOpen}
        onInstalled={() => {
          setInstallOpen(false);
          void refresh();
        }}
      />
    </div>
  );
}

function ModuleCard({
  row,
  onRemove,
}: {
  row: ModuleRow;
  onRemove: (name: string) => void;
}): React.JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 shrink-0" />
              <span className="truncate">{row.name}</span>
              <StatusBadge status={row.status} />
            </CardTitle>
            <CardDescription className="mt-1 space-y-0.5 font-mono text-[11px]">
              <div className="truncate">container: {row.containerPath}</div>
              <div className="truncate">host: {row.hostPath}</div>
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(row.name)}
            aria-label={`Remove ${row.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}

function StatusBadge({
  status,
}: {
  status: ModuleRow["status"];
}): React.JSX.Element {
  if (status === "ready") {
    return (
      <Badge
        variant="outline"
        className="border-mint/40 text-mint"
      >
        <CheckCircle2 className="mr-1 h-3 w-3" />
        ready
      </Badge>
    );
  }
  if (status === "not-built") {
    return (
      <Badge
        variant="outline"
        className="border-orange/40 text-orange"
      >
        <AlertTriangle className="mr-1 h-3 w-3" />
        not built
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-destructive/40 text-destructive"
    >
      <XCircle className="mr-1 h-3 w-3" />
      missing
    </Badge>
  );
}

function InstallDialog({
  open,
  onOpenChange,
  onInstalled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled: () => void;
}): React.JSX.Element {
  const [source, setSource] = useState("");
  const [name, setName] = useState("");
  const [noBuild, setNoBuild] = useState(false);
  const [pathOnly, setPathOnly] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [lines, setLines] = useState<InstallLogLine[]>([]);
  const [finalResult, setFinalResult] = useState<InstallDoneEvent | undefined>();
  const abortRef = useRef<AbortController | undefined>(undefined);

  // Reset everything when the dialog closes so the next install starts
  // clean — otherwise old progress lines stick around and confuse.
  useEffect(() => {
    if (!open) {
      setSource("");
      setName("");
      setNoBuild(false);
      setPathOnly(false);
      setInstalling(false);
      setLines([]);
      setFinalResult(undefined);
      abortRef.current?.abort();
      abortRef.current = undefined;
    }
  }, [open]);

  async function runInstall(): Promise<void> {
    if (!source.trim()) {
      toast.error("Source is required (git URL or local path)");
      return;
    }
    setInstalling(true);
    setLines([]);
    setFinalResult(undefined);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const r = await fetch("/api/cortex/modules/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: source.trim(),
          ...(name.trim() ? { name: name.trim() } : {}),
          ...(noBuild ? { noBuild: true } : {}),
          ...(pathOnly ? { pathOnly: true } : {}),
        }),
        signal: controller.signal,
      });
      if (!r.ok || !r.body) {
        throw new Error(`${r.status} ${r.statusText}`);
      }
      await consumeSse(r.body, (event, data) => {
        if (event === "log" || event === "step" || event === "warn") {
          const text =
            event === "step"
              ? `[${(data as { name?: string }).name}]`
              : (data as { line?: string }).line ?? "";
          setLines((prev) => [
            ...prev,
            { kind: event, text, at: Date.now() },
          ]);
        } else if (event === "done") {
          const done = data as InstallDoneEvent;
          setFinalResult(done);
          if (done.ok) {
            toast.success(`Installed "${done.name}"`, {
              description: `${done.toolNames.length} tool${done.toolNames.length === 1 ? "" : "s"} registered. Restart cortex to activate.`,
            });
          } else {
            toast.error(`Install failed: ${done.error ?? "unknown"}`);
          }
        } else if (event === "error") {
          const err = (data as { error?: string }).error ?? "unknown";
          setFinalResult({
            ok: false,
            name: name || source,
            hostPath: "",
            containerPath: "",
            toolNames: [],
            error: err,
          });
          toast.error(`Install crashed: ${err}`);
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== "aborted") {
        toast.error(msg);
        setLines((prev) => [
          ...prev,
          { kind: "error", text: msg, at: Date.now() },
        ]);
      }
    } finally {
      setInstalling(false);
      abortRef.current = undefined;
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Install private module</DialogTitle>
          <DialogDescription>
            Provide a git URL or a local absolute path. Cortex clones
            (or copies), runs <code>pnpm install + pnpm build</code>,
            validates the output, and registers the container-visible
            path in the active workspace&apos;s cortex.local.yaml.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="source">Source</Label>
            <Input
              id="source"
              placeholder="git URL or local absolute path"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              disabled={installing}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="name"
              placeholder="Derived from the source if left blank"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={installing}
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={noBuild}
                onCheckedChange={(v) => setNoBuild(v === true)}
                disabled={installing}
              />
              <span>
                Skip <code className="text-xs">pnpm install + build</code>
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={pathOnly}
                onCheckedChange={(v) => setPathOnly(v === true)}
                disabled={installing}
              />
              <span>Register path as-is (don&apos;t copy)</span>
            </label>
          </div>

          {(installing || lines.length > 0) && (
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                {installing ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Installing…
                  </>
                ) : (
                  <>
                    <HelpCircle className="h-3 w-3" />
                    Install log
                  </>
                )}
              </div>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
                {lines
                  .map((l) =>
                    l.kind === "error"
                      ? `ERROR: ${l.text}`
                      : l.kind === "warn"
                        ? `WARN: ${l.text}`
                        : l.text,
                  )
                  .join("\n")}
              </pre>
            </div>
          )}

          {finalResult && (
            <div
              className={`rounded-md border p-3 text-sm ${
                finalResult.ok
                  ? "border-mint/40 bg-mint/5"
                  : "border-destructive/40 bg-destructive/5"
              }`}
            >
              {finalResult.ok ? (
                <>
                  <div className="font-medium">
                    Installed <code>{finalResult.name}</code>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Tools:{" "}
                    {finalResult.toolNames.length
                      ? finalResult.toolNames.join(", ")
                      : "(none)"}
                  </div>
                  <div className="mt-2 text-xs">
                    Restart cortex to activate:{" "}
                    <code className="font-mono">cortex down && cortex up</code>
                  </div>
                </>
              ) : (
                <>
                  <div className="font-medium text-destructive">
                    Install failed
                  </div>
                  <div className="mt-1 text-xs">{finalResult.error}</div>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={installing}
          >
            {finalResult?.ok ? "Close" : "Cancel"}
          </Button>
          {!finalResult && (
            <Button
              onClick={() => void runInstall()}
              disabled={installing || !source.trim()}
            >
              {installing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Install
            </Button>
          )}
          {finalResult?.ok && (
            <Button onClick={onInstalled}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Tiny SSE parser. We could pull in eventsource-parser or similar, but
 * a streaming fetch + a manual buffer is 15 lines and avoids the dep.
 */
async function consumeSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: unknown) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      let event = "message";
      let dataText = "";
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataText += line.slice(5).trim();
      }
      if (!dataText) continue;
      try {
        onEvent(event, JSON.parse(dataText));
      } catch {
        onEvent(event, { raw: dataText });
      }
    }
  }
}
