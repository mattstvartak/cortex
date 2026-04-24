import { AdaptersList } from "./adapters-list";

export const dynamic = "force-dynamic";

export default function AdaptersPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Adapters</h1>
        <p className="text-sm text-muted-foreground">
          Configure source adapters. Enable a new one, re-run its wizard to
          update settings, or turn one off without losing its config.
        </p>
      </div>
      <AdaptersList />
    </div>
  );
}
