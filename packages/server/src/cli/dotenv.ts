import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

/**
 * Walk upward from startDir looking for a pnpm-workspace.yaml; return the
 * nearest directory that has one. Falls back to startDir.
 */
export function findRepoRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}

/**
 * Minimal KEY=VALUE parser. Dedicated dotenv would be overkill for a
 * one-time read.
 *
 * Overwrites empty/undefined parent values but preserves non-empty ones,
 * so a user's shell export still wins over the on-disk .env.
 */
export function loadDotEnv(p: string): void {
  try {
    const text = readFileSync(p, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // non-fatal
  }
}

/** Find the nearest .env starting from cwd and load it into process.env. */
export function autoLoadDotEnv(): void {
  const root = findRepoRoot(process.cwd());
  const envPath = path.join(root, ".env");
  if (existsSync(envPath)) loadDotEnv(envPath);
}
