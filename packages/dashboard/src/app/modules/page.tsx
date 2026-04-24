import { ModulesList } from "./modules-list";

export const dynamic = "force-dynamic";

export default function ModulesPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Modules</h1>
        <p className="text-sm text-muted-foreground">
          Private modules are separate repos (or local directories) that
          plug their MCP tools into Cortex. Install from a git URL or
          register an existing local checkout. Restart Cortex to pick up
          new / removed modules.
        </p>
      </div>
      <ModulesList />
    </div>
  );
}
