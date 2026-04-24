import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AdapterConfigureForm } from "./configure-form";
import { ScheduleCard } from "./schedule-card";

export const dynamic = "force-dynamic";

async function fetchSpec(id: string): Promise<{ name: string } | null> {
  const base = process.env.CORTEX_API_URL ?? "http://127.0.0.1:4141";
  try {
    const r = await fetch(`${base}/api/wizards/${id}`, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as { name: string };
  } catch {
    return null;
  }
}

export default async function AdapterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  const spec = await fetchSpec(id);
  if (!spec) return notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/adapters">
            <ArrowLeft className="h-3 w-3" />
            Back
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{spec.name}</h1>
        <p className="text-sm text-muted-foreground">
          Wizard form for{" "}
          <code className="font-mono text-xs">{id}</code>. Saving writes
          the updated config to your active workspace&apos;s cortex.yaml.
        </p>
      </div>
      <ScheduleCard id={id} />
      <Card>
        <CardContent className="p-6">
          <AdapterConfigureForm id={id} />
        </CardContent>
      </Card>
    </div>
  );
}
