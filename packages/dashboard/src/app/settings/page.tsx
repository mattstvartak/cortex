import { SettingsPanel } from "./settings-panel";

export const dynamic = "force-dynamic";

export default function SettingsPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Workspace management, taxonomy (projects + people), raw config
          inspection.
        </p>
      </div>
      <SettingsPanel />
    </div>
  );
}
