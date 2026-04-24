import { McpConsole } from "./mcp-console";

export const dynamic = "force-dynamic";

export default function McpConsolePage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">MCP Console</h1>
        <p className="text-sm text-muted-foreground">
          Run any Cortex MCP tool directly from the browser. Uses the same
          code path Claude Code hits — useful for testing tool changes or
          inspecting output without opening a client.
        </p>
      </div>
      <McpConsole />
    </div>
  );
}
