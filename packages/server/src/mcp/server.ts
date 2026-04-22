import path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadCortexConfig } from "../config.js";
import { createLogger } from "../logger.js";
import { buildLLMRouter } from "../registry/providers.js";
import { buildAdapterRegistry } from "../registry/adapters.js";
import { createScheduler } from "../scheduler.js";
import { createEngramClient } from "../clients/engram.js";
import { createPersonaClient } from "../clients/persona.js";

/**
 * Boots the Cortex MCP server. Phase 1: advertises zero tools but verifies
 * the full wiring — config loads, providers init, Engram/Persona clients
 * construct, MCP stdio transport connects.
 */
export async function startServer(): Promise<void> {
  const logger = createLogger({ component: "cortex-server" });
  const configPath =
    process.env.CORTEX_CONFIG_PATH ??
    path.resolve(process.cwd(), "config/cortex.yaml");

  logger.info("startup.begin", { configPath });
  const cfg = await loadCortexConfig(configPath);

  const { router, providers } = await buildLLMRouter({
    cfg,
    env: process.env,
    logger,
  });
  logger.info("llm.router.ready", {
    providerCount: Object.keys(providers).length,
    taskCount: Object.keys(cfg.llm.tasks).length,
  });

  const engram = createEngramClient({
    url: process.env.ENGRAM_MCP_URL ?? "http://localhost:3101",
  });
  const persona = createPersonaClient({
    url: process.env.PERSONA_MCP_URL ?? "http://localhost:3102",
  });

  const scheduler = createScheduler(logger);

  // Adapter registry — empty in Phase 1.
  await buildAdapterRegistry({
    cfg,
    logger,
    buildContext: () => {
      throw new Error("AdapterContext builder not implemented yet");
    },
  });

  // Void-reference the stubs so the server proves them constructible.
  void engram;
  void persona;
  void router;
  void scheduler;

  const mcp = new Server(
    { name: "cortex", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));
  mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
    return {
      content: [
        {
          type: "text",
          text: `Tool '${req.params.name}' not found. Cortex advertises no tools yet.`,
        },
      ],
      isError: true,
    };
  });

  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  logger.info("mcp.connected", { transport: "stdio" });

  const shutdown = async (): Promise<void> => {
    logger.info("shutdown.begin");
    await scheduler.stop();
    for (const provider of Object.values(providers)) {
      try {
        await provider.shutdown();
      } catch (err) {
        logger.warn("provider.shutdown.error", {
          id: provider.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    logger.info("shutdown.done");
  };

  process.once("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });
}
