import type {
  AdapterContext,
  AdapterFactory,
  Logger,
  SourceAdapter,
} from "@cortex/core";
import type { CortexConfig } from "../config.js";

/**
 * Static registry of adapter factories. As each adapter package lands in
 * later phases, import and add it here.
 *
 * Intentionally empty in Phase 1.
 */
const adapterFactories: Record<string, AdapterFactory> = {
  // "@cortex/adapter-loom": createLoomAdapter,        // Phase 4
  // "@cortex/adapter-confluence": createConfluenceAdapter,  // Phase 5
  // "@cortex/adapter-calendar": createCalendarAdapter, // Phase 6
  // "@cortex/adapter-obsidian": createObsidianAdapter, // Phase 9
  // "@cortex/adapter-bitbucket": createBitbucketAdapter, // Phase 10
};

/**
 * Load enabled adapters from config. TODO (Phase 4): implement secret
 * verification, config schema parse, init(ctx), and scheduler registration.
 */
export async function buildAdapterRegistry(args: {
  cfg: CortexConfig;
  logger: Logger;
  buildContext: (adapterId: string) => AdapterContext;
}): Promise<{ adapters: Record<string, SourceAdapter> }> {
  const { cfg, logger } = args;
  const adapters: Record<string, SourceAdapter> = {};

  for (const [id, entry] of Object.entries(cfg.adapters)) {
    if (!entry.enabled) {
      logger.info("adapter.skipped", { id, reason: "disabled" });
      continue;
    }
    const factory = adapterFactories[entry.package];
    if (!factory) {
      logger.warn("adapter.unknown_package", { id, package: entry.package });
      continue;
    }
    // TODO: validate entry.config against factory's configSchema,
    // verify requiredSecrets, build context, call init.
    logger.warn("adapter.registration_stubbed", { id });
  }

  return { adapters };
}
