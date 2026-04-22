import { readFile, writeFile, rename, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { DerivedTaxonomy, WizardResult } from "@cortex/core";

/**
 * Atomic multi-file config mutation for Cortex.
 *
 * Every enable/configure/disable operation on a module boils down to
 * edits in three files:
 *
 *   config/cortex.local.yaml      — adapters/providers/memory/etc.
 *   .env                          — secrets
 *   config/projects.local.yaml    — taxonomy (may expand to people/engagements)
 *
 * Each file gets the tmp-then-rename atomic write pattern so a crash
 * mid-write never leaves a corrupted half-file behind. The service is
 * shared by the CLI runner and (later) the dashboard's server actions,
 * so config mutations take the same path regardless of entry point.
 */

export interface ConfigMutationOptions {
  /** Repo root. Used to resolve relative paths for config files + .env. */
  repoRoot: string;
}

/**
 * Enable a module (adapter, provider, etc.) with the collected wizard
 * result. Creates cortex.local.yaml from the template if it doesn't
 * already exist so the operator never starts from a blank file.
 */
export async function applyWizardResult(
  opts: ConfigMutationOptions,
  result: WizardResult,
): Promise<{ filesWritten: string[] }> {
  const touched: string[] = [];

  // 1. cortex.local.yaml — adapter block.
  const configPath = await ensureLocalCopy(
    path.join(opts.repoRoot, "config", "cortex.yaml"),
  );
  await mutateYaml(configPath, (doc) => {
    const cfg = (doc ?? {}) as Record<string, unknown>;
    const adapters = ((cfg.adapters as Record<string, unknown>) ??
      {}) as Record<string, unknown>;
    adapters[result.moduleId] = buildAdapterEntry(result);
    cfg.adapters = adapters;
    return cfg;
  });
  touched.push(configPath);

  // 2. .env — merge secrets.
  if (Object.keys(result.secrets).length > 0) {
    const envPath = path.join(opts.repoRoot, ".env");
    await mergeEnv(envPath, result.secrets);
    touched.push(envPath);
  }

  // 3. Derived taxonomy.
  if (result.derivedTaxonomy) {
    if (result.derivedTaxonomy.projects?.length) {
      const projectsPath = await ensureLocalCopy(
        path.join(opts.repoRoot, "config", "projects.yaml"),
      );
      await mergeProjects(projectsPath, result.derivedTaxonomy.projects);
      touched.push(projectsPath);
    }
    // Room for people + engagements as those wizards arrive.
  }

  return { filesWritten: touched };
}

/**
 * Flip a module off. Leaves its config in place so re-enabling doesn't
 * lose settings. Only touches cortex.local.yaml.
 */
export async function disableModule(
  opts: ConfigMutationOptions,
  moduleId: string,
): Promise<void> {
  const configPath = await ensureLocalCopy(
    path.join(opts.repoRoot, "config", "cortex.yaml"),
  );
  await mutateYaml(configPath, (doc) => {
    const cfg = (doc ?? {}) as Record<string, unknown>;
    const adapters = ((cfg.adapters as Record<string, unknown>) ??
      {}) as Record<string, unknown>;
    const current = (adapters[moduleId] as Record<string, unknown>) ?? {};
    adapters[moduleId] = { ...current, enabled: false };
    cfg.adapters = adapters;
    return cfg;
  });
}

/**
 * Read a module's current config from cortex.local.yaml (or the template
 * if the local doesn't exist). Used by `cortex configure` to pre-fill
 * wizard defaults with the current values.
 */
export async function readModuleConfig(
  opts: ConfigMutationOptions,
  moduleId: string,
): Promise<Record<string, unknown> | undefined> {
  const localPath = path.join(opts.repoRoot, "config", "cortex.local.yaml");
  const basePath = path.join(opts.repoRoot, "config", "cortex.yaml");
  const source = await tryReadYaml(localPath) ?? await tryReadYaml(basePath);
  if (!source) return undefined;
  const adapters = source.adapters as Record<string, unknown> | undefined;
  if (!adapters) return undefined;
  const entry = adapters[moduleId] as { config?: Record<string, unknown> } | undefined;
  return entry?.config;
}

// --- internals ---

function buildAdapterEntry(result: WizardResult): Record<string, unknown> {
  return {
    package: `@cortex/adapter-${result.moduleId}`,
    enabled: true,
    // Schedule is left to whatever the template has; `cortex configure
    // --schedule` is a future subcommand. For now, no schedule = ad-hoc
    // sync only.
    config: result.config as Record<string, unknown>,
  };
}

/**
 * If `<dir>/<name>.local.yaml` doesn't exist, copy the committed
 * `<dir>/<name>.yaml` template to it so the first write has somewhere
 * to land. Returns the local path either way.
 */
async function ensureLocalCopy(templatePath: string): Promise<string> {
  const ext = path.extname(templatePath);
  const base = templatePath.slice(0, -ext.length);
  const localPath = `${base}.local${ext}`;
  try {
    await readFile(localPath, "utf8");
    return localPath;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  // Create from template. If the template is also missing, write an
  // empty YAML doc.
  try {
    await copyFile(templatePath, localPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    await mkdir(path.dirname(localPath), { recursive: true });
    await atomicWrite(localPath, "");
  }
  return localPath;
}

/**
 * Read a YAML file, pass the parsed doc through `mutator`, write back
 * atomically. Preserves YAML structure loosely — we round-trip via
 * `yaml` package's default stringify, which keeps basic shape but does
 * not preserve comments. For the local file that's acceptable — the
 * committed template carries the comments, the local is just data.
 */
async function mutateYaml(
  filePath: string,
  mutator: (doc: unknown) => unknown,
): Promise<void> {
  const raw = await readFile(filePath, "utf8").catch((err) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  });
  const doc = raw.trim().length > 0 ? parseYaml(raw) : {};
  const next = mutator(doc) ?? {};
  const out = stringifyYaml(next, { indent: 2, lineWidth: 0 });
  await atomicWrite(filePath, out);
}

async function tryReadYaml(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = parseYaml(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

/**
 * Append/update key=value entries in .env. Preserves existing lines and
 * their order; unknown keys are appended with a section header the first
 * time a group is added (for readability).
 */
async function mergeEnv(
  filePath: string,
  entries: Record<string, string>,
): Promise<void> {
  let existing = await readFile(filePath, "utf8").catch((err) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  });
  if (existing && !existing.endsWith("\n")) existing += "\n";

  const lines = existing.split("\n");
  const keyToLineIndex = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/^([A-Z0-9_]+)\s*=/);
    if (m) keyToLineIndex.set(m[1]!, i);
  }

  const appended: string[] = [];
  for (const [key, value] of Object.entries(entries)) {
    const newLine = `${key}=${quoteIfNeeded(value)}`;
    const existingIdx = keyToLineIndex.get(key);
    if (existingIdx !== undefined) {
      lines[existingIdx] = newLine;
    } else {
      appended.push(newLine);
    }
  }

  const combined =
    [...lines, ...(appended.length > 0 ? ["", ...appended] : [])]
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
  await atomicWrite(filePath, combined.endsWith("\n") ? combined : `${combined}\n`);
}

function quoteIfNeeded(value: string): string {
  // Only quote when necessary — contains whitespace or #.
  if (/[\s#]/.test(value)) {
    const escaped = value.replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return value;
}

/**
 * Add missing project slugs to projects.local.yaml. Existing slugs are
 * left alone — the wizard doesn't overwrite user-curated entries.
 */
async function mergeProjects(
  filePath: string,
  projects: DerivedTaxonomy["projects"] & {},
): Promise<void> {
  await mutateYaml(filePath, (doc) => {
    const cfg = (doc ?? {}) as { projects?: unknown[] };
    const existing = Array.isArray(cfg.projects) ? cfg.projects : [];
    const bySlug = new Map<string, Record<string, unknown>>();
    for (const entry of existing) {
      if (entry && typeof entry === "object" && "slug" in entry) {
        bySlug.set((entry as { slug: string }).slug, entry as Record<string, unknown>);
      }
    }
    for (const proj of projects) {
      if (bySlug.has(proj.slug)) continue;
      bySlug.set(proj.slug, {
        slug: proj.slug,
        name: proj.name ?? proj.slug,
        ...(proj.description ? { description: proj.description } : {}),
        active: true,
      });
    }
    return { ...cfg, projects: [...bySlug.values()] };
  });
}

async function atomicWrite(filePath: string, contents: string): Promise<void> {
  const tmp = `${filePath}.tmp-${Date.now()}-${process.pid}`;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(tmp, contents, "utf8");
  await rename(tmp, filePath);
}
