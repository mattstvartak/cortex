import path from "node:path";
import type { AdapterContext } from "@cortex/core";
import { loadCortexConfig } from "../config.js";
import { createLogger } from "../logger.js";
import { buildAdapterRegistry } from "../registry/adapters.js";
import { createEngramClient } from "../clients/engram.js";
import { runSync } from "../sync.js";

export interface SyncCliOptions {
  adapterId: string;
  sinceIso?: string;
  limit?: number;
  dryRun?: boolean;
}

/**
 * Parse raw argv after `sync` subcommand into options. Supported:
 *   cortex sync <adapter-id> [--since=ISO] [--limit=N] [--dry-run]
 */
export function parseSyncArgs(argv: readonly string[]): SyncCliOptions | { error: string } {
  if (argv.length === 0) {
    return { error: "cortex sync: adapter id required (e.g. `cortex sync confluence`)" };
  }
  const [adapterId, ...rest] = argv;
  if (!adapterId) return { error: "adapter id required" };

  const opts: SyncCliOptions = { adapterId };
  for (const flag of rest) {
    if (flag === "--dry-run") opts.dryRun = true;
    else if (flag.startsWith("--since=")) opts.sinceIso = flag.slice("--since=".length);
    else if (flag.startsWith("--limit=")) {
      const n = Number.parseInt(flag.slice("--limit=".length), 10);
      if (!Number.isFinite(n) || n < 0) return { error: `invalid --limit value` };
      opts.limit = n;
    } else {
      return { error: `unknown flag: ${flag}` };
    }
  }
  return opts;
}

export async function runSyncCli(argv: readonly string[]): Promise<number> {
  const parsed = parseSyncArgs(argv);
  if ("error" in parsed) {
    process.stderr.write(`${parsed.error}\n`);
    return 2;
  }

  const logger = createLogger({ component: "sync" });
  const configPath =
    process.env.CORTEX_CONFIG_PATH ??
    path.resolve(process.cwd(), "config/cortex.yaml");

  const cfg = await loadCortexConfig(configPath);
  const entry = cfg.adapters[parsed.adapterId];
  if (!entry) {
    process.stderr.write(
      `cortex sync: no adapter '${parsed.adapterId}' in ${configPath}\n`,
    );
    return 2;
  }
  if (!entry.enabled) {
    process.stderr.write(
      `cortex sync: adapter '${parsed.adapterId}' is disabled in cortex.yaml\n`,
    );
    return 2;
  }

  // Build just the requested adapter via a one-entry temp config.
  const trimmedCfg: typeof cfg = {
    ...cfg,
    adapters: { [parsed.adapterId]: entry },
  };

  const engram = await createEngramClient({ logger });

  const registry = await buildAdapterRegistry({
    cfg: trimmedCfg,
    env: process.env,
    logger,
    buildContext: (adapterId, entryConfig, secrets) => ({
      logger: logger.child({ adapter: adapterId }),
      config: entryConfig,
      secrets,
      signal: new AbortController().signal,
      // Pipelines use `engram` directly via `runSync`, but the adapter
      // context also gets one for any direct adapter-side queries.
      engram: {
        ingest: (input) => engram.ingest(input),
        healthCheck: () => engram.healthCheck(),
      },
      // Minimal taxonomy + LLM stubs; real classification uses adapter's
      // own rules for now. We'll richen this when classifiers need the
      // taxonomy.
      taxonomy: emptyTaxonomyReader(),
      llm: { raw: null, complete: async () => { throw new Error("not wired"); } },
    }),
  });

  const adapter = registry.adapters[parsed.adapterId];
  if (!adapter) {
    await engram.shutdown();
    process.stderr.write(
      `cortex sync: adapter '${parsed.adapterId}' failed to initialize. Check logs above.\n`,
    );
    return 1;
  }

  try {
    const result = await runSync({
      adapter,
      engram,
      logger,
      opts: {
        ...(parsed.sinceIso ? { sinceIso: parsed.sinceIso } : {}),
        ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
        ...(parsed.dryRun ? { dryRun: true } : {}),
      },
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.errors > 0 ? 1 : 0;
  } finally {
    await registry.shutdown();
    await engram.shutdown();
  }
}

/**
 * Minimal no-op TaxonomyReader so AdapterContext compiles when we don't
 * load projects.yaml in sync mode. Proper taxonomy loading will land
 * when an adapter's classifier needs it.
 */
function emptyTaxonomyReader(): AdapterContext["taxonomy"] {
  return {
    listProjects: () => [],
    findProjectBySlug: () => undefined,
    findProject: () => undefined,
    listPeople: () => [],
    findPersonBySlug: () => undefined,
    findPersonByEmail: () => undefined,
    findPerson: () => undefined,
  };
}
