import type { z } from "zod";
import type {
  AdapterCapabilities,
  AdapterContext,
  ClassificationContext,
  ClassifiedItem,
  HealthStatus,
  NormalizedItem,
  RawSourceItem,
  SourceAdapter,
} from "@cortex/core";

/**
 * Optional base class. Adapters MAY extend this for lifecycle scaffolding,
 * or implement `SourceAdapter` directly.
 */
export abstract class BaseAdapter implements SourceAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly configSchema: z.ZodTypeAny;
  abstract readonly requiredSecrets: readonly string[];
  abstract readonly capabilities: AdapterCapabilities;
  abstract readonly pipelines: readonly string[];

  protected ctx!: AdapterContext;
  protected lastSuccessAt: number | undefined;

  async init(ctx: AdapterContext): Promise<void> {
    this.ctx = ctx;
    await this.onInit();
  }

  /** Hook for subclass-specific init. */
  protected async onInit(): Promise<void> {
    // no-op by default
  }

  async shutdown(): Promise<void> {
    await this.onShutdown();
  }

  protected async onShutdown(): Promise<void> {
    // no-op by default
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const details = await this.probeHealth();
      return {
        healthy: true,
        message: "",
        ...(this.lastSuccessAt !== undefined
          ? { lastSuccessAt: this.lastSuccessAt }
          : {}),
        ...(details ? { details } : {}),
      };
    } catch (err) {
      return {
        healthy: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  protected async probeHealth(): Promise<Record<string, unknown> | undefined> {
    // Default: assume healthy. Override for real API probes.
    return undefined;
  }

  abstract fetch(since?: Date): AsyncIterable<RawSourceItem>;
  abstract transform(raw: RawSourceItem): Promise<NormalizedItem>;
  abstract classify(
    item: NormalizedItem,
    cctx: ClassificationContext,
  ): Promise<ClassifiedItem>;

  protected markSuccess(): void {
    this.lastSuccessAt = Date.now();
  }
}
