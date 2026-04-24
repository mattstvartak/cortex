import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProviderConfigureForm } from "./configure-form";

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

export default async function ProviderDetailPage({
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
          <Link href="/providers">
            <ArrowLeft className="h-3 w-3" />
            Back
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{spec.name}</h1>
        <p className="text-sm text-muted-foreground">
          Provider config for <code className="font-mono text-xs">{id}</code>.
          Saving writes the updated entry to your workspace&apos;s cortex.yaml.
        </p>
      </div>
      <Card>
        <CardContent className="p-6">
          <ProviderConfigureForm id={id} />
        </CardContent>
      </Card>
    </div>
  );
}
