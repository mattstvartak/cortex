"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { WizardForm } from "@/widgets/wizard-form";

export function ProviderConfigureForm({
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
        const r = await fetch(`/api/cortex/config/providers/${id}`, {
          cache: "no-store",
        });
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        const body = (await r.json()) as {
          config: Record<string, unknown>;
          configured: boolean;
          secretsConfigured?: string[];
        };
        if (cancelled) return;
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
        setTimeout(() => router.push("/providers"), 800);
      }}
    />
  );
}
