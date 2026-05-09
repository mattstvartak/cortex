import { z } from "zod";
import type { McpTool } from "../tool.js";

const inputSchema = z.object({});

interface Output {
  /** True when the underlying memory backend (engram) responded. */
  healthy: boolean;
  /** Session-scoped workspace slug, or null when no session workspace. */
  workspace: string | null;
  /**
   * Raw stats payload from engram's memory_stats. Keys depend on the
   * engram release; common ones include `total_chunks`, `total_size_bytes`,
   * `last_ingest_at`. We pass the whole object through so the renderer
   * can surface whichever fields it knows about without us having to
   * version-pin the shape here.
   */
  stats: Record<string, unknown>;
  /**
   * Engram's last successful contact, ISO. Useful for the renderer to
   * render staleness ("connected · last poll 2s ago").
   */
  lastSuccessAt: string | null;
  /** Error message when healthy=false. Empty string when healthy. */
  message: string;
}

/**
 * Knowledge-base size + freshness probe.
 *
 * Cheap "how big is the KB?" call backed by engram's memory_stats. The
 * Pyre Knowledge card uses this to show "X chunks indexed · last
 * activity Y ago" so the user has live confirmation that ingest is
 * actually landing data, not just returning OK.
 *
 * Phase 4 follow-up to kb_search + kb_dossier — those answer "what's
 * in the KB about X"; this answers "is there anything in the KB at
 * all" and "is the backend reachable."
 */
export const kbStats: McpTool<typeof inputSchema, Output> = {
  name: "kb_stats",
  description:
    "Return the knowledge base's size + freshness for the current " +
    "session workspace. Cheap; safe to poll every few seconds. " +
    "`stats` is the raw memory_stats payload from engram (shape " +
    "varies by engram release; treat as opaque key/value object). " +
    "Use for status displays in client UIs.",
  inputSchema,

  async handler(_input, ctx) {
    const health = await ctx.engram.healthCheck();
    const stats = (health as { details?: Record<string, unknown> }).details ?? {};
    const lastSuccessAt = (health as { lastSuccessAt?: number }).lastSuccessAt;
    return {
      healthy: health.healthy === true,
      workspace: ctx.sessionWorkspace ?? null,
      stats,
      lastSuccessAt: typeof lastSuccessAt === "number"
        ? new Date(lastSuccessAt).toISOString()
        : null,
      message: health.message ?? "",
    };
  },
};
