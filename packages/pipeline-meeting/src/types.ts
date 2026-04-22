/**
 * JSON shape that pass 1 must emit and pass 2 preserves. Matches
 * prompts/pass1-structural.md.
 */
export interface MeetingStructured {
  summary: string;
  participants: Array<{ name: string; role?: string | null }>;
  topics: string[];
  decisions: Array<{
    statement: string;
    owner: string | null;
    rationale: string | null;
  }>;
  action_items: Array<{
    description: string;
    owner: string | null;
    due_hint: string | null;
    /** Added by pass 2. */
    due_date?: string | null;
  }>;
  key_quotes: Array<{ speaker: string; text: string }>;
  /** Added by pass 2 when a decision contradicts prior state. */
  conflicts?: Array<{ new_decision: string; contradicts: string }>;
}

export interface MeetingPipelineOptions {
  /** Max characters per transcript chunk. Keeps memories individually useful. */
  chunkSize?: number;
  /** Include the full brief as one memory. Default true. */
  includeBrief?: boolean;
  /** Include individual decisions as their own memories. Default true. */
  includeDecisionMemories?: boolean;
  /** Include individual action items as their own memories. Default true. */
  includeActionItemMemories?: boolean;
  /** Include transcript chunks as their own memories. Default true. */
  includeTranscriptChunks?: boolean;
  /** Max decisions/actions to emit as separate memories. Guards against runaway outputs. */
  maxSubMemories?: number;
  /**
   * Prior decisions to pass into pass 2 (JSON stringified). Pipelines
   * that plug in retrieval can populate this; default is `[]`.
   */
  priorDecisions?: string;
  /** People taxonomy JSON handed to pass 2. Default `[]`. */
  peopleContext?: string;
}
