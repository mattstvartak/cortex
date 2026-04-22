import type { EngramAccess, HealthStatus } from "@cortex/core";

/**
 * Typed wrapper over Engram's MCP tools. Purely a thin adapter: no business
 * logic, no domain concepts. Work-specific behavior belongs in Cortex tools,
 * not here.
 *
 * Phase 1 stub. Real implementation uses `@modelcontextprotocol/sdk` client.
 */
export interface EngramClientOptions {
  url: string;
}

export function createEngramClient(_opts: EngramClientOptions): EngramAccess {
  // TODO: wire to @modelcontextprotocol/sdk client. Map Engram's
  // memory_ingest / memory_search tools to typed methods here.
  return {
    async ingest(): Promise<{ id: string }> {
      throw new Error("engram client not implemented yet");
    },
    async healthCheck(): Promise<HealthStatus> {
      return {
        healthy: false,
        message: "engram client stub - not yet wired",
      };
    },
  };
}
