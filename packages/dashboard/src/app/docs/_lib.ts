import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Locate the cortex repo's `docs/` directory at request time. Tries the
 * locations Next.js uses across deployments:
 *
 *   1. `<repo-root>/docs/` — local dev when running `pnpm dev` from the
 *      dashboard package; cwd is the package, so docs are two levels up.
 *   2. `/app/docs/` — Docker standalone runtime; outputFileTracingIncludes
 *      copies the docs into `/app/docs/` next to `packages/dashboard/`.
 *
 * Returns the first directory that exists.
 */
export async function findDocsDir(): Promise<string | undefined> {
  const candidates = [
    path.resolve(process.cwd(), "../../docs"),
    path.resolve(process.cwd(), "docs"),
  ];
  for (const dir of candidates) {
    try {
      const stat = await fs.stat(dir);
      if (stat.isDirectory()) return dir;
    } catch {
      // continue
    }
  }
  return undefined;
}

export interface DocEntry {
  slug: string;
  title: string;
  description?: string;
}

/**
 * Curated list of doc files surfaced in the dashboard. Order matters —
 * this is the sidebar order. Audience: end users + enterprise customers
 * (the ops/admin operating a Cortex install). Internal docs (ROADMAP,
 * DECISIONS, ADRs, competitive analysis) live in the repo but are not
 * indexed here.
 *
 * Files not in this list still render at `/docs/<slug>` when the
 * filesystem has them, but they won't appear in the sidebar.
 */
export const DOC_INDEX: DocEntry[] = [
  {
    slug: "SETUP",
    title: "Setup",
    description: "First-run setup of a Cortex install.",
  },
  {
    slug: "ARCHITECTURE",
    title: "How Cortex works",
    description: "Data plane, pipelines, adapter contract.",
  },
  {
    slug: "DEPLOY",
    title: "Deploy",
    description: "Putting Cortex on an always-on host.",
  },
  {
    slug: "HOSTING",
    title: "Hosting",
    description: "Recommended host topologies and sizing.",
  },
  {
    slug: "enrichment-protocol",
    title: "Enrichment protocol",
    description:
      "How a connected MCP client (Claude, Pyre) can act as Cortex's enrichment provider.",
  },
  {
    slug: "PRIVACY",
    title: "Privacy",
    description: "PII hygiene rules and the identifier scanner.",
  },
];

export async function readDoc(slug: string): Promise<string | undefined> {
  const dir = await findDocsDir();
  if (!dir) return undefined;
  // Restrict to alphanumeric / dash / dot to prevent traversal.
  if (!/^[A-Za-z0-9._-]+$/.test(slug)) return undefined;
  try {
    const buf = await fs.readFile(path.join(dir, `${slug}.md`), "utf8");
    return buf;
  } catch {
    return undefined;
  }
}

export interface WorkspaceDocSummary {
  slug: string;
  title: string;
  description?: string;
  updatedAt: string;
  sizeBytes: number;
}

export interface WorkspaceDocsList {
  workspace: string | null;
  path: string | null;
  exists: boolean;
  docs: WorkspaceDocSummary[];
}

export interface WorkspaceDocRead {
  workspace: string;
  slug: string;
  title: string;
  body: string;
  updatedAt: string;
  path: string;
}
