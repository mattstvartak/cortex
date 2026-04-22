import type { z } from "zod";
import type { AdapterCapabilities } from "./capabilities.js";
import type { AdapterContext } from "./context.js";
import type {
  ClassifiedItem,
  HealthStatus,
  NormalizedItem,
  RawSourceItem,
} from "./types.js";

/**
 * Classification can pull in more than just the item itself. This is the
 * slot for shared signals (attendee matches, path rules, etc.) that the
 * classifier may consult beyond the item body.
 */
export interface ClassificationContext {
  /** Hint from a rule-based first pass, if any. */
  ruleHint?: { projects: string[]; confidence: number };
  /** Free-form signals collected by the adapter (meeting attendees, etc.). */
  signals?: Record<string, unknown>;
}

/**
 * Every source adapter implements this contract. Registered at startup;
 * scheduled by the server; invoked by the registry.
 *
 * Adapters are idempotent by `NormalizedItem.sourceId`. Re-running on the
 * same source content updates existing memories rather than duplicating.
 */
export interface SourceAdapter {
  /** Stable id, matches `SourceType`. Used as the metadata `source` field. */
  readonly id: string;
  /** Human-readable name for logs and UIs. */
  readonly name: string;
  /** Semver string, used for compatibility checks. */
  readonly version: string;

  /** Zod schema for this adapter's config block in cortex.yaml. */
  readonly configSchema: z.ZodTypeAny;
  /** Env var names this adapter needs. Registry verifies at startup. */
  readonly requiredSecrets: readonly string[];
  /** What the adapter can do. Affects scheduling and routing decisions. */
  readonly capabilities: AdapterCapabilities;
  /** Pipeline package ids this adapter's output should flow through. */
  readonly pipelines: readonly string[];

  /** Called once after construction. Any setup happens here. */
  init(ctx: AdapterContext): Promise<void>;
  /** Lightweight liveness probe. Should not touch external APIs heavily. */
  healthCheck(): Promise<HealthStatus>;
  /** Clean up resources. Called on server shutdown. */
  shutdown(): Promise<void>;

  /**
   * Yield new/changed items since `since`. Adapter owns cursor/pagination.
   * If `since` is omitted, yield everything (bounded by the adapter's
   * natural cap — e.g., Loom's "recent" window).
   */
  fetch(since?: Date): AsyncIterable<RawSourceItem>;

  /** Normalize a raw source item to the canonical shape. Pure. */
  transform(raw: RawSourceItem): Promise<NormalizedItem>;

  /** Tag with project slugs. See ClassificationContext for shared signals. */
  classify(
    item: NormalizedItem,
    ctx: ClassificationContext,
  ): Promise<ClassifiedItem>;
}

/**
 * Adapter packages export a factory rather than an instance so the registry
 * can instantiate lazily after config validation.
 */
export type AdapterFactory = () => SourceAdapter;
