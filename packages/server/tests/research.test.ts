import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { loadTaxonomy } from "../src/taxonomy.js";
import { research } from "../src/mcp/tools/research.js";
import type { ToolContext } from "../src/mcp/tool.js";
import type { EngramClient, EngramMemory } from "../src/clients/engram.js";

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

function fakeEngram(memories: EngramMemory[] = []): EngramClient {
  return {
    ingest: vi.fn(async () => ({ id: `fake-${Date.now()}-${Math.random()}` })),
    search: vi.fn(async () => memories),
    healthCheck: vi.fn(async () => ({ healthy: true, message: "" })),
    shutdown: vi.fn(async () => undefined),
  };
}

async function makeCtx(
  opts: {
    memories?: EngramMemory[];
    llmResponses?: string[];
  } = {},
): Promise<ToolContext> {
  const taxonomy = await loadTaxonomy({
    projectsPath: path.join(fixturesDir, "projects.yaml"),
    peoplePath: path.join(fixturesDir, "people.yaml"),
  });
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child() {
      return logger;
    },
  };
  const responses = opts.llmResponses ?? [];
  let i = 0;
  return {
    taxonomy,
    logger,
    engram: fakeEngram(opts.memories ?? []),
    persona: {
      cognitiveLoad: vi.fn(async () => "medium"),
      signal: vi.fn(async () => undefined),
      healthCheck: vi.fn(async () => ({ healthy: true, message: "" })),
      shutdown: vi.fn(async () => undefined),
    },
    llmRouter: {
      complete: vi.fn(async () => ({
        content: responses[i++] ?? "",
        model: "test",
        provider: "test",
        latencyMs: 1,
      })),
    } as never,
  };
}

describe("research tool", () => {
  it("retrieves context, runs both LLM passes, and persists memories by default", async () => {
    const ctx = await makeCtx({
      memories: [
        {
          id: "m1",
          content: "Rate limiting explained: token buckets, leaky buckets...",
          metadata: {
            type: "doc",
            title: "Rate Limiting 101",
            source_id: "confluence:page:1",
            source_url: "https://x.example/doc/1",
          },
        },
      ],
      llmResponses: [
        // Pass 1: structural JSON
        JSON.stringify({
          summary: "Two dominant strategies for rate limiting.",
          findings: [
            {
              statement: "Token bucket allows bursts up to a cap.",
              confidence: 0.9,
              citations: [{ sourceId: "confluence:page:1", title: "Rate Limiting 101" }],
            },
            {
              statement: "Leaky bucket enforces a smooth output rate.",
              confidence: 0.9,
            },
          ],
        }),
        // Pass 2: brief
        "# Rate limiting\n\n## TL;DR\n- Two strategies: token / leaky bucket.\n",
      ],
    });

    const parsed = research.inputSchema.parse({
      topic: "Rate limiting strategies",
    });
    const res = (await research.handler(parsed, ctx)) as {
      topic: string;
      retrieved: number;
      brief?: string;
      findings: Array<{ statement: string }>;
      persisted: Array<{ kind: string }>;
    };

    expect(res.retrieved).toBe(1);
    expect(res.brief).toContain("Rate limiting");
    expect(res.findings.length).toBe(2);
    // 1 brief + 2 finding memories ingested.
    expect(res.persisted).toHaveLength(3);
    const kinds = res.persisted.map((p) => p.kind).sort();
    expect(kinds).toEqual(["brief", "finding", "finding"]);
  });

  it("dryRun skips Engram ingest", async () => {
    const ctx = await makeCtx({
      memories: [],
      llmResponses: [
        JSON.stringify({ summary: "s", findings: [] }),
        "# brief\n",
      ],
    });

    const parsed = research.inputSchema.parse({
      topic: "anything",
      dryRun: true,
    });
    const res = (await research.handler(parsed, ctx)) as {
      persisted: unknown[];
    };
    expect(res.persisted).toHaveLength(0);
    expect(ctx.engram.ingest).not.toHaveBeenCalled();
  });

  it("returns a hint when the LLM router isn't configured", async () => {
    const ctx = await makeCtx();
    delete (ctx as Partial<ToolContext>).llmRouter;

    const parsed = research.inputSchema.parse({ topic: "x" });
    const res = (await research.handler(parsed, ctx)) as { hint?: string };
    expect(res.hint).toContain("LLM router");
  });

  it("flags unknown projects", async () => {
    const ctx = await makeCtx({ llmResponses: ["", ""] });
    const parsed = research.inputSchema.parse({
      topic: "x",
      project: "ghost",
    });
    const res = (await research.handler(parsed, ctx)) as { hint?: string };
    expect(res.hint).toContain("ghost");
  });
});
