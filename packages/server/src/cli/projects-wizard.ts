import path from "node:path";
import { checkbox, confirm, input } from "@inquirer/prompts";
import type {
  AdapterContext,
  EngramAccess,
  Logger,
  ProjectCandidate,
  SourceAdapter,
} from "@cortex/core";
import type { LLMAccess } from "@cortex/core";
import { loadCortexConfig } from "../config.js";
import { ensureLocalCopy, mergeProjects } from "./config-mutation.js";
import { resolveConfigPath } from "./config-path.js";
import { findRepoRoot, loadDotEnv } from "./dotenv.js";
import { createLogger } from "../logger.js";
import { loadTaxonomy } from "../taxonomy.js";

/**
 * `cortex add projects` — interactive wizard that discovers candidate
 * projects via enabled adapters and writes the chosen entries into
 * `config/projects.local.yaml`.
 *
 * Architecture:
 *   1. Load cortex.yaml to see which adapters are enabled.
 *   2. For each enabled adapter that implements `discoverProjects`,
 *      instantiate it with minimal stub context (no Engram subprocess,
 *      no LLM) and call the method. Adapters that reach beyond
 *      authentication will fail gracefully — the wizard logs the
 *      failure and moves on.
 *   3. Flatten candidates, show a multi-select checklist, let the user
 *      confirm slug/name per picked entry, then merge into projects.
 *   4. Manual entry stays available as a fallback for anything
 *      discovery can't see.
 *
 * Never runs non-interactively — no TTY means no way to ask the user
 * which candidates to keep.
 */
export async function runProjectsWizard(
  _args: readonly string[],
): Promise<number> {
  if (!process.stdin.isTTY) {
    process.stderr.write(
      "cortex add projects: interactive wizard requires a TTY.\n",
    );
    return 2;
  }

  const repoRoot = findRepoRoot(process.cwd());
  loadDotEnv(repoRoot);

  const configPath = resolveConfigPath();
  const cfg = await loadCortexConfig(configPath).catch((err) => {
    process.stderr.write(
      `cortex add projects: couldn't load config at ${configPath}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return undefined;
  });
  if (!cfg) return 1;

  process.stdout.write("\n=== Add projects ===\n");
  process.stdout.write(
    "Auto-discovers projects from enabled adapters. You pick which to add.\n",
  );

  const logger = createLogger({ component: "projects-wizard" });
  const enabledAdapters = Object.entries(cfg.adapters).filter(
    ([, entry]) => entry.enabled,
  );

  let candidates: DiscoveredCandidate[] = [];
  if (enabledAdapters.length === 0) {
    process.stdout.write(
      "\nNo adapters enabled yet — skipping auto-discovery.\n" +
        "Tip: run `cortex add google-calendar` (or another adapter) to enable discovery next time.\n",
    );
  } else {
    process.stdout.write(
      `\nScanning ${enabledAdapters.length} enabled adapter${enabledAdapters.length === 1 ? "" : "s"} for project candidates...\n`,
    );
    candidates = await discoverAcrossAdapters({
      enabledAdapters,
      cfg,
      repoRoot,
      logger,
      configPath,
    });
  }

  const picked = await pickAndRefineCandidates(candidates);
  const manual = await promptManualEntries(picked.map((c) => c.slug));
  const all = [...picked, ...manual];
  if (all.length === 0) {
    process.stdout.write("\nNothing selected. No changes written.\n");
    return 0;
  }

  const projectsPath = await ensureLocalCopy(
    path.join(repoRoot, "config", "projects.yaml"),
  );
  await mergeProjects(
    projectsPath,
    all.map((c) => ({
      slug: c.slug,
      name: c.name,
      ...(c.description ? { description: c.description } : {}),
      ...(c.sources && Object.keys(c.sources).length > 0
        ? { sources: c.sources }
        : {}),
    })),
  );

  process.stdout.write(
    `\nSaved ${all.length} project${all.length === 1 ? "" : "s"} to ${projectsPath}.\n` +
      `  ${all.map((c) => c.slug).join("\n  ")}\n`,
  );
  return 0;
}

export interface DiscoveredCandidate extends ProjectCandidate {
  sources?: Record<string, unknown>;
}

async function discoverAcrossAdapters(args: {
  enabledAdapters: Array<[string, { package: string; config: Record<string, unknown> }]>;
  cfg: Awaited<ReturnType<typeof loadCortexConfig>>;
  repoRoot: string;
  logger: Logger;
  configPath: string;
}): Promise<DiscoveredCandidate[]> {
  const { enabledAdapters, cfg, repoRoot, logger, configPath } = args;

  // Build the full adapter registry once, sharing a stub context. We
  // only need adapters that implement discoverProjects; the rest are
  // initialized and discarded. Init runs to let each adapter wire up
  // its auth / API client — the typical path where the token file
  // gets read and the fetcher is constructed.
  const taxonomy = await loadTaxonomy({
    projectsPath: path.join(repoRoot, "config", "projects.yaml"),
    peoplePath: path.join(repoRoot, "config", "people.yaml"),
  });

  const stubLlm: LLMAccess = {
    raw: null,
    complete: async () => "",
  };
  const stubEngram: EngramAccess = {
    ingest: async () => ({ id: "" }),
    healthCheck: async () => ({ healthy: true, message: "wizard-stub" }),
  };
  const abortController = new AbortController();

  const { buildAdapterRegistry } = await import("../registry/adapters.js");
  const registry = await buildAdapterRegistry({
    cfg,
    env: process.env,
    logger,
    buildContext: (adapterId, entryConfig, secrets): AdapterContext => ({
      logger: logger.child({ adapter: adapterId }),
      taxonomy,
      llm: stubLlm,
      engram: stubEngram,
      config: entryConfig,
      secrets,
      signal: abortController.signal,
    }),
  });

  const candidates: DiscoveredCandidate[] = [];
  for (const [adapterId] of enabledAdapters) {
    const adapter = registry.adapters[adapterId] as SourceAdapter | undefined;
    if (!adapter) continue;
    if (typeof adapter.discoverProjects !== "function") {
      logger.debug("projects_wizard.skip_no_discovery", { adapterId });
      continue;
    }
    try {
      const found = await adapter.discoverProjects();
      for (const c of found) {
        candidates.push({ ...c, sourceAdapter: adapterId });
      }
      process.stdout.write(
        `  ${adapterId}: ${found.length} candidate${found.length === 1 ? "" : "s"}\n`,
      );
    } catch (err) {
      process.stdout.write(
        `  ${adapterId}: discovery failed (${err instanceof Error ? err.message : String(err)})\n`,
      );
    }
  }

  await registry.shutdown().catch(() => undefined);
  void configPath; // silence unused-param warning for future use
  return dedupeBySlug(candidates);
}

/** Exported for tests. Merges candidates sharing a slug into one entry. */
export function dedupeBySlug(
  raw: readonly DiscoveredCandidate[],
): DiscoveredCandidate[] {
  const bySlug = new Map<string, DiscoveredCandidate>();
  for (const c of raw) {
    const existing = bySlug.get(c.slug);
    if (!existing) {
      bySlug.set(c.slug, { ...c });
      continue;
    }
    // Same slug surfaced by two adapters — merge their source hints.
    existing.sources = {
      ...(existing.sources ?? existing.sourceHints ?? {}),
      ...(c.sources ?? c.sourceHints ?? {}),
    };
  }
  // Normalize sourceHints → sources so the downstream merge uses one key.
  return Array.from(bySlug.values()).map((c) => {
    const merged = c.sources ?? c.sourceHints;
    const next: DiscoveredCandidate = { ...c };
    if (merged && Object.keys(merged).length > 0) {
      next.sources = merged;
    } else {
      delete next.sources;
    }
    return next;
  });
}

async function pickAndRefineCandidates(
  candidates: readonly DiscoveredCandidate[],
): Promise<DiscoveredCandidate[]> {
  if (candidates.length === 0) return [];

  const picks = await checkbox({
    message: `Which candidates should I add as projects? (${candidates.length} found)`,
    pageSize: Math.min(20, candidates.length),
    choices: candidates.map((c) => ({
      value: c.slug,
      name: formatCandidateLabel(c),
      ...(c.description ? { description: c.description } : {}),
    })),
  });

  const refined: DiscoveredCandidate[] = [];
  for (const slug of picks) {
    const base = candidates.find((c) => c.slug === slug);
    if (!base) continue;
    const finalSlug = await input({
      message: `Slug for "${base.name}":`,
      default: base.slug,
      validate: (v) =>
        /^[a-z0-9][a-z0-9-]*$/.test(v.trim())
          ? true
          : "kebab-case: a-z, 0-9, hyphens; must start with letter or digit",
    });
    const finalName = await input({
      message: `Display name:`,
      default: base.name,
      validate: (v) => (v.trim().length > 0 ? true : "required"),
    });
    refined.push({
      ...base,
      slug: finalSlug.trim(),
      name: finalName.trim(),
    });
  }
  return refined;
}

async function promptManualEntries(
  existingSlugs: readonly string[],
): Promise<DiscoveredCandidate[]> {
  const out: DiscoveredCandidate[] = [];
  const taken = new Set(existingSlugs);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const more = await confirm({
      message: out.length === 0
        ? "Add a project manually?"
        : "Add another manually?",
      default: false,
    });
    if (!more) break;
    const slug = await input({
      message: "Slug:",
      validate: (v) => {
        const trimmed = v.trim();
        if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmed)) {
          return "kebab-case: a-z, 0-9, hyphens";
        }
        if (taken.has(trimmed)) return `"${trimmed}" already in this batch`;
        return true;
      },
    });
    const name = await input({
      message: "Display name:",
      validate: (v) => (v.trim().length > 0 ? true : "required"),
    });
    const description = await input({
      message: "One-sentence description (optional):",
      default: "",
    });
    const trimmedSlug = slug.trim();
    taken.add(trimmedSlug);
    out.push({
      slug: trimmedSlug,
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
    });
  }
  return out;
}

function formatCandidateLabel(c: DiscoveredCandidate): string {
  const src = c.sourceAdapter ? ` (${c.sourceAdapter})` : "";
  return `${c.name}${src}`;
}
