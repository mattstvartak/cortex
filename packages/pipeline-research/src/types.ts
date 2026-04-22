export interface ResearchContextItem {
  /** Where this snippet came from — Engram id, Confluence page, etc. */
  sourceId: string;
  /** Human-readable title. */
  title?: string;
  /** URL back to the canonical source if we have one. */
  url?: string;
  /** Body text (markdown). */
  content: string;
  /** ISO 8601 date of the source content. */
  date?: string;
  /** Memory type it came from (meeting, doc, decision, …). */
  sourceType?: string;
}

/**
 * The topic + retrieved context that drives a research run.
 * Adapters / tools construct this; the pipeline doesn't fetch.
 */
export interface ResearchInput {
  /** The user's research question or topic. */
  topic: string;
  /** Context snippets already pulled from Engram / elsewhere. */
  retrievedContext: ResearchContextItem[];
  /** Optional project slug(s) to tag emitted memories with. */
  projects?: string[];
  /** Canonical person slug for who asked — used as `people`. */
  requesterSlug?: string;
}

export interface ResearchPipelineOptions {
  /** Max findings to emit. */
  maxFindings?: number;
  /** Max context characters per retrieved item in the prompt. */
  maxItemChars?: number;
}

export interface ResearchFinding {
  statement: string;
  confidence?: number;
  citations?: Array<{ sourceId: string; title?: string }>;
}

export interface ResearchExtracted {
  summary: string;
  findings: ResearchFinding[];
}
