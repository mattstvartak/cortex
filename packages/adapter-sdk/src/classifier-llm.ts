import type {
  ClassificationContext,
  ClassifiedItem,
  NormalizedItem,
  TaxonomyReader,
} from "@cortex/core";

/**
 * Default LLM-backed project classifier. Used by adapters whose content
 * doesn't map deterministically to projects (Loom titles, doc bodies).
 *
 * Stubbed for now. Real implementation will:
 *   1. Build a system prompt from the taxonomy (project slugs + aliases)
 *   2. Call ctx.llm.complete({ task: "classify", prompt: ... })
 *   3. Parse the JSON response (project slugs + confidence)
 *   4. Merge with any ruleHint from ClassificationContext
 */
export interface LLMClassifierDeps {
  taxonomy: TaxonomyReader;
  llm: {
    complete(args: {
      task: string;
      prompt: string;
      system?: string;
    }): Promise<string>;
  };
}

export class LLMClassifier {
  constructor(private readonly _deps: LLMClassifierDeps) {}

  async classify(
    item: NormalizedItem,
    cctx: ClassificationContext,
  ): Promise<ClassifiedItem> {
    // TODO: real prompt + JSON parsing. For now, return ruleHint if present,
    // else unclassified with 0 confidence (to surface in review queue).
    const fallback: Pick<ClassifiedItem, "projects" | "confidence" | "classificationMethod"> = cctx.ruleHint
      ? {
          projects: cctx.ruleHint.projects,
          confidence: cctx.ruleHint.confidence,
          classificationMethod: "rule",
        }
      : { projects: [], confidence: 0, classificationMethod: "content-llm" };
    return { ...item, ...fallback };
  }
}
