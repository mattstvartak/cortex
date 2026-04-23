import { describe, expect, it } from "vitest";
import {
  dedupeBySlug,
  type DiscoveredCandidate,
} from "../src/cli/projects-wizard.js";

describe("dedupeBySlug", () => {
  it("merges source hints when the same slug comes from two adapters", () => {
    const out = dedupeBySlug([
      {
        slug: "alpha",
        name: "Alpha",
        sourceAdapter: "google-calendar",
        sourceHints: { google_calendar_id: "alpha@example.com" },
      },
      {
        slug: "alpha",
        name: "Alpha (Confluence)",
        sourceAdapter: "confluence",
        sourceHints: { confluence_space: "ALPHA" },
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.sources).toEqual({
      google_calendar_id: "alpha@example.com",
      confluence_space: "ALPHA",
    });
  });

  it("normalizes sourceHints into sources for the merge path", () => {
    const out = dedupeBySlug([
      {
        slug: "beta",
        name: "Beta",
        sourceHints: { confluence_space: "BETA" },
      },
    ]);
    expect(out[0]!.sources).toEqual({ confluence_space: "BETA" });
  });

  it("leaves sources undefined when neither sources nor sourceHints are set", () => {
    const out = dedupeBySlug([{ slug: "gamma", name: "Gamma" }]);
    expect(out[0]!.sources).toBeUndefined();
  });

  it("keeps distinct slugs distinct", () => {
    const rows: DiscoveredCandidate[] = [
      { slug: "alpha", name: "Alpha" },
      { slug: "beta", name: "Beta" },
      { slug: "gamma", name: "Gamma" },
    ];
    expect(dedupeBySlug(rows).length).toBe(3);
  });
});
