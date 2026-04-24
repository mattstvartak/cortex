"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";

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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface Workspace {
  slug: string;
  path: string;
  active: boolean;
}

export function SettingsPanel(): React.JSX.Element {
  return (
    <Tabs defaultValue="workspaces">
      <TabsList>
        <TabsTrigger value="workspaces">Workspaces</TabsTrigger>
        <TabsTrigger value="projects">Projects</TabsTrigger>
        <TabsTrigger value="people">People</TabsTrigger>
        <TabsTrigger value="raw">Raw config</TabsTrigger>
      </TabsList>
      <TabsContent value="workspaces" className="mt-4">
        <WorkspacesTab />
      </TabsContent>
      <TabsContent value="projects" className="mt-4">
        <WorkspaceFileEditor name="projects" />
      </TabsContent>
      <TabsContent value="people" className="mt-4">
        <WorkspaceFileEditor name="people" />
      </TabsContent>
      <TabsContent value="raw" className="mt-4">
        <RawConfigTab />
      </TabsContent>
    </Tabs>
  );
}

function WorkspacesTab(): React.JSX.Element {
  const [workspaces, setWorkspaces] = useState<Workspace[] | undefined>();
  const [newSlug, setNewSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/cortex/workspaces", { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const body = (await r.json()) as { workspaces: Workspace[] };
      setWorkspaces(body.workspaces);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function switchTo(slug: string): Promise<void> {
    setBusy(true);
    try {
      const r = await fetch("/api/cortex/workspaces/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `${r.status} ${r.statusText}`);
      }
      toast.success(`Switched to ${slug} — restart Cortex to pick up the new config`);
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function create(): Promise<void> {
    if (!newSlug.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/cortex/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: newSlug.trim() }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `${r.status} ${r.statusText}`);
      }
      toast.success(`Created workspace '${newSlug.trim()}'`);
      setNewSlug("");
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(slug: string): Promise<void> {
    if (
      !window.confirm(
        `Delete workspace '${slug}'? Its config/.env/engram data under that folder will be removed.`,
      )
    )
      return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/cortex/workspaces/${encodeURIComponent(slug)}?confirm=true`,
        { method: "DELETE" },
      );
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `${r.status} ${r.statusText}`);
      }
      toast.success(`Deleted ${slug}`);
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardDescription className="text-destructive">
              {error}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create a workspace</CardTitle>
          <CardDescription>
            A workspace bundles its own config and .env, letting you keep
            personal + work contexts separate.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="new-ws">Slug</Label>
            <Input
              id="new-ws"
              placeholder="e.g. personal, work, side-project"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              disabled={busy}
            />
          </div>
          <Button onClick={() => void create()} disabled={busy || !newSlug.trim()}>
            Create
          </Button>
        </CardContent>
      </Card>

      {!workspaces ? (
        <div className="grid gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <div className="grid gap-2">
          {workspaces.map((w) => (
            <Card key={w.slug}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{w.slug}</span>
                    {w.active && (
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        active
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground font-mono break-all">
                    {w.path}
                  </p>
                </div>
                {!w.active && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void switchTo(w.slug)}
                    disabled={busy}
                  >
                    Switch
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void remove(w.slug)}
                  disabled={busy}
                  className="text-destructive hover:bg-destructive/10"
                >
                  Delete
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkspaceFileEditor({
  name,
}: {
  name: "projects" | "people";
}): React.JSX.Element {
  const [content, setContent] = useState<string | undefined>();
  const [initial, setInitial] = useState<string | undefined>();
  const [filePath, setFilePath] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/cortex/workspace-files/${name}`, {
          cache: "no-store",
        });
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        const body = (await r.json()) as { path: string; content: string };
        if (cancelled) return;
        setContent(body.content);
        setInitial(body.content);
        setFilePath(body.path);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  async function save(): Promise<void> {
    if (content === undefined) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/cortex/workspace-files/${name}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `${r.status} ${r.statusText}`);
      }
      toast.success(`${name}.yaml saved`);
      setInitial(content);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const dirty = content !== undefined && initial !== undefined && content !== initial;

  if (error) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardDescription className="text-destructive">
            Couldn&apos;t load {name}.yaml: {error}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (content === undefined) {
    return <Skeleton className="h-72 w-full" />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base font-mono">{name}.yaml</CardTitle>
            {filePath && (
              <CardDescription className="font-mono text-xs break-all">
                {filePath}
              </CardDescription>
            )}
          </div>
          <Button
            onClick={() => void save()}
            disabled={saving || !dirty}
            size="sm"
          >
            <Save className="h-3 w-3" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[400px] font-mono text-xs"
          spellCheck={false}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          YAML is validated on save. An invalid document won&apos;t overwrite
          the existing file — the error shows up as a toast instead.
        </p>
      </CardContent>
    </Card>
  );
}

function RawConfigTab(): React.JSX.Element {
  const [raw, setRaw] = useState<string | undefined>();
  const [filePath, setFilePath] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/cortex/config", { cache: "no-store" });
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        const body = (await r.json()) as { path: string; raw: string };
        if (cancelled) return;
        setRaw(body.raw);
        setFilePath(body.path);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardDescription className="text-destructive">{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-mono">cortex.yaml</CardTitle>
        <CardDescription>
          Read-only view. Edit via the Adapters / Providers pages so changes
          round-trip through their wizard validation.
          {filePath && (
            <span className="ml-1 font-mono">({filePath})</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] rounded-md border bg-muted">
          <pre className="p-4 font-mono text-xs leading-relaxed">
            {raw ?? "Loading…"}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
