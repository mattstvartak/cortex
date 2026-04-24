"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";

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
import { Skeleton } from "@/components/ui/skeleton";

const PRESETS: Array<{ label: string; cron: string }> = [
  { label: "Every 15 min", cron: "*/15 * * * *" },
  { label: "Hourly", cron: "0 * * * *" },
  { label: "Every 4 hours", cron: "0 */4 * * *" },
  { label: "Daily (2am)", cron: "0 2 * * *" },
  { label: "Manual only", cron: "" },
];

/**
 * Schedule editor for a single adapter. Persists via
 * POST /api/config/adapters/:id/schedule — the scheduler re-reads
 * config at boot, so a restart is needed for changes to take effect
 * (flagged in the toast).
 */
export function ScheduleCard({ id }: { id: string }): React.JSX.Element {
  const [schedule, setSchedule] = useState<string | undefined>();
  const [initial, setInitial] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/cortex/config/adapters/${id}`, {
          cache: "no-store",
        });
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        const body = (await r.json()) as {
          schedule: string | null;
          configured: boolean;
        };
        if (cancelled) return;
        const s = body.schedule ?? "";
        setSchedule(s);
        setInitial(s);
        setConfigured(body.configured);
      } catch (e) {
        if (!cancelled) {
          toast.error(
            `Couldn't load schedule: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function save(): Promise<void> {
    if (schedule === undefined) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/cortex/config/adapters/${id}/schedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schedule: schedule.trim() || null }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `${r.status} ${r.statusText}`);
      }
      toast.success(
        schedule.trim()
          ? `Schedule saved — restart cortex to apply`
          : "Schedule cleared — this adapter is now manual-only",
      );
      setInitial(schedule);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const dirty = schedule !== undefined && initial !== undefined && schedule !== initial;

  if (!configured && !loading) {
    return <></>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Schedule</CardTitle>
        <CardDescription>
          Cron expression controlling automatic ingestion. Leave empty to
          run only via the &quot;Run now&quot; button.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-cron">Cron expression</Label>
              <Input
                id="schedule-cron"
                placeholder="e.g. 0 * * * *"
                value={schedule ?? ""}
                onChange={(e) => setSchedule(e.target.value)}
                disabled={saving}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                5-field cron: minute hour day-of-month month day-of-week.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  variant="outline"
                  size="sm"
                  onClick={() => setSchedule(p.cron)}
                  disabled={saving}
                >
                  {p.label}
                </Button>
              ))}
              <Button
                className="ml-auto"
                onClick={() => void save()}
                disabled={saving || !dirty}
              >
                <Save className="h-3 w-3" />
                {saving ? "Saving…" : "Save schedule"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
