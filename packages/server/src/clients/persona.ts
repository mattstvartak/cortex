import type { HealthStatus } from "@cortex/core";

/**
 * Typed wrapper over Persona's MCP tools. Handles style adaptation and
 * cognitive-load queries. No business logic.
 *
 * Phase 1 stub.
 */
export interface PersonaClientOptions {
  url: string;
}

export interface PersonaAccess {
  currentCognitiveLoad(): Promise<"low" | "medium" | "high">;
  signal(event: { kind: string; context?: string }): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
}

export function createPersonaClient(_opts: PersonaClientOptions): PersonaAccess {
  return {
    async currentCognitiveLoad(): Promise<"low" | "medium" | "high"> {
      return "medium";
    },
    async signal(): Promise<void> {
      // no-op
    },
    async healthCheck(): Promise<HealthStatus> {
      return {
        healthy: false,
        message: "persona client stub - not yet wired",
      };
    },
  };
}
