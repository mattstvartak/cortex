"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

interface ProviderRow {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  configured: boolean;
}

export function ProvidersList(): React.JSX.Element {
  const [rows, setRows] = useState<ProviderRow[] | undefined>();
  const [error, setError] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/cortex/config/providers", {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const body = (await r.json()) as { providers: ProviderRow[] };
      setRows(body.providers);
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
      const r = await fetch(`/api/cortex/config/providers/${id}/toggle`, {
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
            Couldn&apos;t load providers
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
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {rows.map((r) => (
        <Card key={r.id}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.name}</span>
                <code className="font-mono text-xs text-muted-foreground">
                  {r.id}
                </code>
                {r.enabled && (
                  <Badge variant="secondary" className="text-[10px] uppercase">
                    enabled
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {r.description}
              </p>
            </div>
            {r.configured ? (
              <>
                <Switch
                  checked={r.enabled}
                  onCheckedChange={(next) => void toggle(r.id, next)}
                  aria-label={`Toggle ${r.name}`}
                />
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/providers/${r.id}`}>
                    Configure
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </Button>
              </>
            ) : (
              <Button size="sm" asChild>
                <Link href={`/providers/${r.id}`}>
                  <Plus className="h-3 w-3" />
                  Enable
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
