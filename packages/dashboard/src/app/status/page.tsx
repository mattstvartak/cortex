import { StatusPanel } from "./status-panel";

export const dynamic = "force-dynamic";

export default function StatusPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Status</h1>
        <p className="text-sm text-muted-foreground">
          Live view of the running Cortex process: uptime, upstream health,
          per-adapter sync stats. Auto-refreshes every 10 seconds.
        </p>
      </div>
      <StatusPanel />
    </div>
  );
}
