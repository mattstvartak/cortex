import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  defaultTokenPath,
  readGoogleToken,
} from "@cortex/google-auth";
import {
  resolveLocalFirst,
  type CortexConfig,
} from "../config.js";

/**
 * `cortex doctor` — pre-flight diagnostic. Runs mechanical checks without
 * booting the server so operators can verify a fresh install or post-edit
 * state. Differs from:
 *   - `cortex status` — reads the RUNNING daemon's heartbeat
 *   - `cortex smoke`  — live LLM probe; requires providers already booted
 *
 * Everything here works against config + env + filesystem only. Never
 * throws — each check renders its own line with a verdict so the user
 * sees the full picture, not the first failure.
 */

type Verdict = "ok" | "fail" | "warn" | "skip";

interface CheckResult {
  name: string;
  verdict: Verdict;
  detail?: string;
}

const ADAPTER_PACKAGE_TO_SECRETS: Record<string, readonly string[]> = {
  "@cortex/adapter-bitbucket": ["ATLASSIAN_EMAIL", "ATLASSIAN_API_TOKEN"],
  "@cortex/adapter-confluence": ["ATLASSIAN_EMAIL", "ATLASSIAN_API_TOKEN"],
  "@cortex/adapter-github": ["GITHUB_TOKEN"],
  "@cortex/adapter-gmail": [],
  "@cortex/adapter-google-calendar": [],
  "@cortex/adapter-google-drive": [],
  "@cortex/adapter-jira": ["ATLASSIAN_EMAIL", "ATLASSIAN_API_TOKEN"],
  "@cortex/adapter-linear": ["LINEAR_API_KEY"],
  "@cortex/adapter-loom": ["LOOM_API_KEY"],
  "@cortex/adapter-notion": ["NOTION_API_KEY"],
  "@cortex/adapter-obsidian": [],
  "@cortex/adapter-slack": ["SLACK_BOT_TOKEN"],
};

const PROVIDER_PACKAGE_TO_SECRETS: Record<string, readonly string[]> = {
  "@cortex/provider-ollama": [],
  "@cortex/provider-openrouter": ["OPENROUTER_API_KEY"],
};

const GOOGLE_ID_TO_SCOPE: Record<string, string> = {
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
  "google-calendar": "https://www.googleapis.com/auth/calendar.readonly",
  "google-drive": "https://www.googleapis.com/auth/drive.readonly",
};

export async function runDoctor(_args: readonly string[]): Promise<number> {
  const results: CheckResult[] = [];

  const cfgPath =
    process.env.CORTEX_CONFIG_PATH ??
    path.resolve(process.cwd(), "config/cortex.yaml");

  // 1. Config file readable
  const resolvedCfg = await resolveLocalFirst(cfgPath);
  const cfgRaw = await tryRead(resolvedCfg);
  if (!cfgRaw) {
    results.push({
      name: "config file",
      verdict: "fail",
      detail: `not readable: ${resolvedCfg}`,
    });
    renderAndReturn(results, resolvedCfg);
    return 1;
  }
  results.push({
    name: "config file",
    verdict: "ok",
    detail: path.basename(resolvedCfg),
  });

  // 2. Env expansion — gather references WITHOUT throwing on missing
  const { missing: envMissing, refs: envRefs } = collectEnvRefs(cfgRaw);
  if (envMissing.length === 0) {
    results.push({
      name: "env var references",
      verdict: "ok",
      detail: `${envRefs.size} referenced, all set`,
    });
  } else {
    results.push({
      name: "env var references",
      verdict: "fail",
      detail: `unset: ${envMissing.join(", ")}`,
    });
  }

  // 3. Parse config. If expansion was incomplete, substitute empty strings
  //    so YAML still parses — we already reported the missing vars above.
  let cfg: CortexConfig | undefined;
  try {
    const substituted = cfgRaw.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) =>
      process.env[name] ?? "",
    );
    cfg = parseYaml(substituted) as CortexConfig;
  } catch (err) {
    results.push({
      name: "config parse",
      verdict: "fail",
      detail: err instanceof Error ? err.message : String(err),
    });
    renderAndReturn(results, resolvedCfg);
    return 1;
  }
  results.push({ name: "config parse", verdict: "ok" });

  // 4. Enabled adapters — check secrets individually
  const enabledAdapters = Object.entries(cfg?.adapters ?? {})
    .filter(([_, entry]) => entry && (entry as { enabled?: boolean }).enabled);
  if (enabledAdapters.length === 0) {
    results.push({
      name: "enabled adapters",
      verdict: "warn",
      detail: "none enabled — Cortex won't ingest anything",
    });
  } else {
    for (const [id, raw] of enabledAdapters) {
      const entry = raw as { package?: string };
      const required = entry.package
        ? ADAPTER_PACKAGE_TO_SECRETS[entry.package] ?? []
        : [];
      const missing = required.filter((n) => !process.env[n]);
      results.push(
        missing.length === 0
          ? { name: `adapter: ${id}`, verdict: "ok", detail: entry.package ?? "" }
          : {
              name: `adapter: ${id}`,
              verdict: "fail",
              detail: `missing secrets: ${missing.join(", ")}`,
            },
      );
    }
  }

  // 5. Enabled LLM providers
  const providers =
    (cfg?.llm as { providers?: Record<string, unknown> } | undefined)
      ?.providers ?? {};
  const enabledProviders = Object.entries(providers).filter(
    ([_, entry]) => entry && (entry as { enabled?: boolean }).enabled,
  );
  if (enabledProviders.length === 0) {
    results.push({
      name: "enabled llm providers",
      verdict: "fail",
      detail: "no providers enabled — pipelines can't run",
    });
  } else {
    for (const [id, raw] of enabledProviders) {
      const entry = raw as { package?: string };
      const required = entry.package
        ? PROVIDER_PACKAGE_TO_SECRETS[entry.package] ?? []
        : [];
      const missing = required.filter((n) => !process.env[n]);
      results.push(
        missing.length === 0
          ? { name: `provider: ${id}`, verdict: "ok", detail: entry.package ?? "" }
          : {
              name: `provider: ${id}`,
              verdict: "fail",
              detail: `missing secrets: ${missing.join(", ")}`,
            },
      );
    }
  }

  // 6. Google token — only check if any google-* adapter is enabled
  const googleEnabled = enabledAdapters
    .map(([id]) => id)
    .filter((id) => id in GOOGLE_ID_TO_SCOPE);
  if (googleEnabled.length > 0) {
    const tokenPath = defaultTokenPath();
    try {
      const token = await readGoogleToken(tokenPath);
      const needed = googleEnabled.map((id) => GOOGLE_ID_TO_SCOPE[id]!);
      const missingScopes = needed.filter((s) => !token.scopes.includes(s));
      if (missingScopes.length === 0) {
        results.push({
          name: "google oauth token",
          verdict: "ok",
          detail: `${token.scopes.length} scope(s) at ${path.basename(tokenPath)}`,
        });
      } else {
        results.push({
          name: "google oauth token",
          verdict: "fail",
          detail: `missing scopes: ${missingScopes.join(", ")} — rerun cortex google-login`,
        });
      }
    } catch {
      results.push({
        name: "google oauth token",
        verdict: "fail",
        detail: `not found at ${tokenPath} — run cortex google-login`,
      });
    }
  } else {
    results.push({
      name: "google oauth token",
      verdict: "skip",
      detail: "no Google adapters enabled",
    });
  }

  // 7. Memory backend — if pgvector is the fallback, POSTGRES_URL must resolve
  const memory = (cfg?.memory ?? {}) as {
    fallback?: string;
    pgvector?: { connectionString?: string };
  };
  if (memory.fallback === "pgvector") {
    const dsn = memory.pgvector?.connectionString;
    if (!dsn || dsn.includes("${")) {
      results.push({
        name: "memory fallback (pgvector)",
        verdict: "fail",
        detail: "POSTGRES_URL is unset or still templated",
      });
    } else {
      results.push({
        name: "memory fallback (pgvector)",
        verdict: "ok",
        detail: "DSN resolved (connection not tested — use --connect to probe)",
      });
    }
  } else {
    results.push({
      name: "memory fallback",
      verdict: "skip",
      detail: "no pgvector fallback configured",
    });
  }

  // 8. Projects taxonomy — optional but common point of confusion
  const projectsPath = path.resolve(path.dirname(resolvedCfg), "projects.yaml");
  const resolvedProjects = await resolveLocalFirst(projectsPath);
  const projectsRaw = await tryRead(resolvedProjects);
  if (!projectsRaw) {
    results.push({
      name: "projects taxonomy",
      verdict: "warn",
      detail: "no projects.yaml — ingested items won't have project tags",
    });
  } else {
    try {
      const doc = parseYaml(projectsRaw) as { projects?: unknown[] };
      const count = Array.isArray(doc.projects) ? doc.projects.length : 0;
      results.push({
        name: "projects taxonomy",
        verdict: count > 0 ? "ok" : "warn",
        detail: `${count} project${count === 1 ? "" : "s"} defined`,
      });
    } catch (err) {
      results.push({
        name: "projects taxonomy",
        verdict: "fail",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return renderAndReturn(results, resolvedCfg);
}

async function tryRead(p: string): Promise<string | undefined> {
  try {
    await stat(p);
    return await readFile(p, "utf8");
  } catch {
    return undefined;
  }
}

export function collectEnvRefs(cfgRaw: string): {
  refs: Set<string>;
  missing: string[];
} {
  const refs = new Set<string>();
  const lines = cfgRaw.split(/\r?\n/);
  for (const line of lines) {
    // Skip YAML comments — commented-out blocks shouldn't require env vars.
    if (/^\s*#/.test(line)) continue;
    const matches = line.matchAll(/\$\{([A-Z0-9_]+)\}/g);
    for (const m of matches) refs.add(m[1]!);
  }
  const missing = [...refs].filter(
    (name) => !process.env[name] || process.env[name] === "",
  );
  return { refs, missing };
}

function renderAndReturn(results: CheckResult[], cfgPath: string): number {
  process.stdout.write(`\ncortex doctor\n=============\n`);
  process.stdout.write(`config: ${cfgPath}\n\n`);
  const width = Math.max(...results.map((r) => r.name.length), 20);
  for (const r of results) {
    const tag = tagFor(r.verdict);
    const name = r.name.padEnd(width);
    process.stdout.write(
      `${tag}  ${name}${r.detail ? `  ${r.detail}` : ""}\n`,
    );
  }
  const failed = results.filter((r) => r.verdict === "fail").length;
  const warned = results.filter((r) => r.verdict === "warn").length;
  process.stdout.write(
    `\n${results.length} checks: ${results.length - failed - warned} ok, ${warned} warn, ${failed} fail.\n`,
  );
  return failed > 0 ? 1 : 0;
}

function tagFor(v: Verdict): string {
  switch (v) {
    case "ok":
      return "[ ok ]";
    case "fail":
      return "[FAIL]";
    case "warn":
      return "[warn]";
    case "skip":
      return "[skip]";
  }
}
