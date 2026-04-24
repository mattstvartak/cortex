"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { WizardForm } from "@/widgets/wizard-form";

/**
 * Reconfigure flow for an adapter. Fetches its current persisted
 * config first, then hands the values to WizardForm as the `defaults`
 * prop so every input renders pre-filled.
 */
export function AdapterConfigureForm({
  id,
}: {
  id: string;
}): React.JSX.Element {
  const router = useRouter();
  const [defaults, setDefaults] = useState<Record<string, unknown> | undefined>();
  const [configuredSecrets, setConfiguredSecrets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

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
          config: Record<string, unknown>;
          configured: boolean;
          secretsConfigured?: string[];
        };
        if (cancelled) return;
        // Empty object is fine — wizard falls back to step defaults.
        setDefaults(body.configured ? body.config : {});
        setConfiguredSecrets(body.secretsConfigured ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load current config: {error}
      </p>
    );
  }

  return (
    <WizardForm
      wizardId={id}
      defaults={defaults ?? {}}
      configuredSecrets={configuredSecrets}
      onSuccess={() => {
        toast.success("Config saved");
        // Small delay so the toast shows before we leave.
        setTimeout(() => router.push("/adapters"), 800);
      }}
    />
  );
}
