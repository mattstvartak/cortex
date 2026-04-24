"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Clock, Play, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ToolSpec {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProp>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

interface JsonSchemaProp {
  type?: string | string[];
  description?: string;
  enum?: string[];
  default?: unknown;
  items?: JsonSchemaProp;
  properties?: Record<string, JsonSchemaProp>;
}

interface InvocationResult {
  ok: boolean;
  elapsedMs?: number;
  result?: unknown;
  error?: string;
  traceId?: string;
}

interface HistoryEntry {
  id: string;
  tool: string;
  at: number;
  result: InvocationResult;
  input: Record<string, unknown>;
}

export function McpConsole(): React.JSX.Element {
  const [tools, setTools] = useState<ToolSpec[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [selectedName, setSelectedName] = useState<string | undefined>();
  const [filter, setFilter] = useState("");
  const [input, setInput] = useState("{}");
  const [invoking, setInvoking] = useState(false);
  const [result, setResult] = useState<InvocationResult | undefined>();
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/cortex/mcp/tools", { cache: "no-store" });
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        const body = (await r.json()) as { tools: ToolSpec[] };
        setTools(body.tools);
        if (body.tools[0]) setSelectedName(body.tools[0].name);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const selected = useMemo(
    () => tools?.find((t) => t.name === selectedName),
    [tools, selectedName],
  );

  // Reset input when switching tools. Seed with defaults from schema.
  useEffect(() => {
    if (!selected) return;
    const seed = seedFromSchema(selected.inputSchema);
    setInput(JSON.stringify(seed, null, 2));
    setResult(undefined);
  }, [selectedName, selected]);

  async function invoke(): Promise<void> {
    if (!selected) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(input) as Record<string, unknown>;
    } catch (e) {
      toast.error(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    setInvoking(true);
    const startedAt = Date.now();
    try {
      const r = await fetch(
        `/api/cortex/mcp/tools/${encodeURIComponent(selected.name)}/invoke`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: parsed }),
        },
      );
      const body = (await r.json().catch(() => ({}))) as {
        result?: unknown;
        error?: string;
        elapsedMs?: number;
        traceId?: string;
      };
      const res: InvocationResult = r.ok
        ? {
            ok: true,
            ...(body.result !== undefined ? { result: body.result } : {}),
            ...(body.elapsedMs !== undefined ? { elapsedMs: body.elapsedMs } : {}),
            ...(body.traceId ? { traceId: body.traceId } : {}),
          }
        : {
            ok: false,
            error: body.error ?? `${r.status} ${r.statusText}`,
            elapsedMs: body.elapsedMs ?? Date.now() - startedAt,
            ...(body.traceId ? { traceId: body.traceId } : {}),
          };
      setResult(res);
      setHistory((prev) =>
        [
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            tool: selected.name,
            at: Date.now(),
            result: res,
            input: parsed,
          },
          ...prev,
        ].slice(0, 20),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setInvoking(false);
    }
  }

  if (error) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-sm text-destructive">
            Couldn&apos;t load tool catalog
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (!tools) {
    return (
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const filtered = tools.filter((t) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
    );
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="self-start">
        <CardHeader className="p-4">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter tools"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-9 pl-8"
            />
          </div>
        </CardHeader>
        <CardContent className="p-2 pt-0">
          <ScrollArea className="h-[520px]">
            <div className="flex flex-col gap-0.5">
              {filtered.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => setSelectedName(t.name)}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    t.name === selectedName
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <div className="font-mono text-xs">{t.name}</div>
                  <div className="line-clamp-2 text-[11px] opacity-70">
                    {t.description}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {selected && (
          <Card>
            <CardHeader>
              <CardTitle className="font-mono text-base">
                {selected.name}
              </CardTitle>
              <CardDescription>{selected.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SchemaHint schema={selected.inputSchema} />
              <div className="space-y-1.5">
                <Label htmlFor="mcp-input">Input (JSON)</Label>
                <Textarea
                  id="mcp-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="min-h-[200px] font-mono text-xs"
                  spellCheck={false}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => void invoke()} disabled={invoking}>
                  <Play className="h-3 w-3" />
                  {invoking ? "Running…" : "Run"}
                </Button>
                {result?.elapsedMs !== undefined && (
                  <Badge variant="outline" className="font-mono">
                    <Clock className="h-3 w-3" />
                    {result.elapsedMs}ms
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {result && (
          <Card
            className={cn(
              result.ok
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-destructive/40 bg-destructive/5",
            )}
          >
            <CardHeader>
              <div className="flex items-center gap-2">
                {result.ok ? (
                  <Badge variant="secondary" className="text-[10px] uppercase">
                    ok
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-[10px] uppercase">
                    <AlertCircle className="h-3 w-3" />
                    error
                  </Badge>
                )}
                {result.traceId && (
                  <code className="text-xs text-muted-foreground">
                    trace {result.traceId.slice(0, 8)}
                  </code>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[400px] rounded-md border bg-background">
                <pre className="p-3 font-mono text-xs">
                  {result.ok
                    ? JSON.stringify(result.result, null, 2)
                    : result.error}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {history.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Recent invocations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-1.5 text-xs">
                {history.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      setSelectedName(h.tool);
                      setInput(JSON.stringify(h.input, null, 2));
                      setResult(h.result);
                    }}
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-accent"
                  >
                    <Badge
                      variant={h.result.ok ? "secondary" : "destructive"}
                      className="text-[9px] uppercase"
                    >
                      {h.result.ok ? "ok" : "err"}
                    </Badge>
                    <span className="font-mono">{h.tool}</span>
                    <span className="text-muted-foreground">
                      {h.result.elapsedMs}ms
                    </span>
                    <span className="ml-auto text-muted-foreground">
                      {new Date(h.at).toLocaleTimeString()}
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

/**
 * Quick list of properties from the JSON schema so the user knows what
 * shape the input takes without having to learn Zod.
 */
function SchemaHint({ schema }: { schema: JsonSchema }): React.JSX.Element {
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const keys = Object.keys(props);
  if (keys.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No input parameters. Run with <code className="font-mono">{"{}"}</code>.
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">Parameters</p>
      <div className="grid gap-1 text-xs">
        {keys.map((k) => {
          const p = props[k]!;
          const type = Array.isArray(p.type) ? p.type.join(" | ") : p.type;
          return (
            <div key={k} className="flex items-baseline gap-2">
              <code className="font-mono font-medium">{k}</code>
              <span className="text-muted-foreground">
                {type ?? "?"}
                {required.has(k) && <span className="ml-1 text-destructive">*</span>}
              </span>
              {p.description && (
                <span className="text-muted-foreground">— {p.description}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function seedFromSchema(schema: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const props = schema.properties ?? {};
  for (const [k, p] of Object.entries(props)) {
    if (p.default !== undefined) {
      out[k] = p.default;
    }
  }
  return out;
}
