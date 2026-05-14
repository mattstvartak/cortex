"use client";

import { useEffect, useRef, useState } from "react";

interface Workspace {
  slug: string;
  path: string;
  active: boolean;
}

interface WorkspacesResponse {
  active: string | null;
  workspaces: Workspace[];
}

/**
 * Header-pinned dropdown for switching workspaces. First client
 * component in the dashboard — everything else is a React Server
 * Component. Hits the sidecar via the same /api/cortex/* Next
 * rewrite the widgets use for client-side fetches.
 */
export function WorkspaceSwitcher({
  initialSlug,
}: {
  initialSlug?: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[] | undefined>();
  const [active, setActive] = useState<string | undefined>(initialSlug);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [warning, setWarning] = useState<string | undefined>();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void fetchWorkspaces();
  }, [open]);

  // Close the menu on outside click so it doesn't linger.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent): void {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function fetchWorkspaces(): Promise<void> {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch("/api/cortex/workspaces", { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const body = (await res.json()) as WorkspacesResponse;
      setWorkspaces(body.workspaces);
      setActive(body.active ?? undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function switchTo(slug: string): Promise<void> {
    setLoading(true);
    setError(undefined);
    setWarning(undefined);
    try {
      const res = await fetch("/api/cortex/workspaces/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `${res.status} ${res.statusText}`);
      }
      const body = (await res.json()) as {
        slug: string;
        warning?: string;
      };
      setActive(body.slug);
      if (body.warning) setWarning(body.warning);
      await fetchWorkspaces();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded bg-gold/100/15 px-2 py-0.5 text-xs font-medium text-gold transition hover:bg-gold/100/25"
      >
        {active ?? "no workspace"}
        <span className="ml-1 text-[10px] opacity-60">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-72 rounded-md border border-border bg-card shadow-lg">
          <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Workspaces
          </div>
          {loading && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
          )}
          {error && (
            <p className="px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          {warning && (
            <p className="border-b border-orange/40 bg-orange/10 px-3 py-2 text-xs text-orange">
              {warning}
            </p>
          )}
          {workspaces && workspaces.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              None yet. Run{" "}
              <code className="font-mono">cortex workspace add &lt;slug&gt;</code>{" "}
              in a terminal.
            </p>
          )}
          {workspaces && workspaces.length > 0 && (
            <ul className="py-1">
              {workspaces.map((ws) => (
                <li key={ws.slug}>
                  <button
                    type="button"
                    disabled={ws.active || loading}
                    onClick={() => void switchTo(ws.slug)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-muted/30 disabled:cursor-default disabled:bg-transparent"
                  >
                    <span
                      className={
                        ws.active
                          ? "font-medium text-gold"
                          : ""
                      }
                    >
                      {ws.slug}
                    </span>
                    {ws.active && (
                      <span className="text-[10px] uppercase text-gold">
                        active
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            Switching flips the state pointer, but{" "}
            <code className="font-mono">cortex start</code> must restart to
            load the new workspace.
          </div>
        </div>
      )}
    </div>
  );
}
