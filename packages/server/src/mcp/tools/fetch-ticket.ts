import { z } from "zod";
import type { McpTool } from "../tool.js";

const inputSchema = z.object({
  /**
   * Ticket URL or key. Accepted shapes:
   *   https://you.atlassian.net/browse/PROJ-123      (Jira)
   *   https://linear.app/org/issue/PROJ-123          (Linear)
   *   PROJ-123                                       (Jira only — requires ATLASSIAN_WORKSPACE)
   */
  ref: z.string().min(1),
});

interface Output {
  provider: "jira" | "linear";
  url: string;
  key: string;
  title: string;
  state: string;
  priority?: string;
  assignee?: string;
  reporter?: string;
  labels: string[];
  body: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetch a ticket summary from Jira or Linear. Detects the provider
 * from the URL shape; bare keys (PROJ-123) assume Jira and require
 * ATLASSIAN_WORKSPACE in env to build the base URL.
 */
export const fetchTicket: McpTool<typeof inputSchema, Output> = {
  name: "fetch_ticket",
  description:
    "Fetch a Jira or Linear ticket's title, state, priority, " +
    "assignee, and description from a URL (or bare Jira key like " +
    "'PROJ-123'). Use when the user shares a ticket link or " +
    "references a ticket in a meeting transcript — pairs with " +
    "`ingest_content` to persist ticket context alongside the " +
    "conversation that mentioned it.",
  inputSchema,

  async handler(input) {
    const ref = input.ref.trim();
    // Bare key → Jira
    if (/^[A-Z][A-Z0-9]+-\d+$/.test(ref)) {
      const workspace = process.env.ATLASSIAN_WORKSPACE;
      if (!workspace) {
        throw new Error(
          "fetch_ticket: bare Jira key provided but ATLASSIAN_WORKSPACE isn't set. Pass the full URL or set the env var.",
        );
      }
      const host = workspace.endsWith(".atlassian.net")
        ? workspace
        : `${workspace}.atlassian.net`;
      return fetchJiraIssue(`https://${host}`, ref);
    }

    let u: URL;
    try {
      u = new URL(ref);
    } catch {
      throw new Error(
        `fetch_ticket: couldn't parse '${ref}' as a URL or ticket key`,
      );
    }

    if (u.hostname.endsWith("atlassian.net")) {
      const m = u.pathname.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/);
      if (!m) throw new Error(`fetch_ticket: no /browse/<KEY> in ${u.href}`);
      return fetchJiraIssue(`${u.protocol}//${u.hostname}`, m[1]!);
    }
    if (u.hostname === "linear.app") {
      // linear.app/<org>/issue/<KEY>/<slug?>
      const m = u.pathname.match(/\/issue\/([A-Z][A-Z0-9]+-\d+)/);
      if (!m) throw new Error(`fetch_ticket: no /issue/<KEY> in ${u.href}`);
      return fetchLinearIssue(m[1]!, u.href);
    }
    throw new Error(`fetch_ticket: unknown host ${u.hostname}`);
  },
};

// --- Jira --------------------------------------------------------------

async function fetchJiraIssue(
  baseUrl: string,
  key: string,
): Promise<Output> {
  const email = process.env.ATLASSIAN_EMAIL;
  const token = process.env.ATLASSIAN_API_TOKEN;
  if (!email || !token) {
    throw new Error(
      "fetch_ticket (jira): ATLASSIAN_EMAIL + ATLASSIAN_API_TOKEN required",
    );
  }
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const res = await fetch(
    `${baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}`,
    {
      headers: {
        authorization: `Basic ${auth}`,
        accept: "application/json",
      },
    },
  );
  if (!res.ok) {
    throw new Error(
      `Jira API ${res.status} ${res.statusText} for ${key}: ${await res.text().catch(() => "")}`,
    );
  }
  const body = (await res.json()) as JiraIssuePayload;
  const f = body.fields;
  return {
    provider: "jira",
    url: `${baseUrl}/browse/${key}`,
    key,
    title: f.summary ?? "(no title)",
    state: f.status?.name ?? "unknown",
    ...(f.priority?.name ? { priority: f.priority.name } : {}),
    ...(f.assignee?.displayName ? { assignee: f.assignee.displayName } : {}),
    ...(f.reporter?.displayName ? { reporter: f.reporter.displayName } : {}),
    labels: f.labels ?? [],
    body: adfToText(f.description) ?? "",
    createdAt: f.created ?? "",
    updatedAt: f.updated ?? "",
  };
}

interface JiraIssuePayload {
  fields: {
    summary?: string;
    description?: unknown;
    status?: { name: string };
    priority?: { name: string };
    assignee?: { displayName: string };
    reporter?: { displayName: string };
    labels?: string[];
    created?: string;
    updated?: string;
  };
}

/**
 * Jira descriptions are Atlassian Document Format (ADF) — nested JSON.
 * Extract a plain-text approximation so we don't drag the full tree
 * through to the response. Good enough for a ticket summary.
 */
function adfToText(node: unknown): string | undefined {
  if (!node) return undefined;
  if (typeof node === "string") return node;
  if (typeof node !== "object") return undefined;
  const obj = node as { type?: string; text?: string; content?: unknown[] };
  if (obj.type === "text" && typeof obj.text === "string") return obj.text;
  if (Array.isArray(obj.content)) {
    return obj.content
      .map((c) => adfToText(c))
      .filter((s): s is string => !!s)
      .join(obj.type === "paragraph" ? "" : "\n");
  }
  return undefined;
}

// --- Linear ------------------------------------------------------------

async function fetchLinearIssue(key: string, url: string): Promise<Output> {
  const token = process.env.LINEAR_API_KEY;
  if (!token) {
    throw new Error("fetch_ticket (linear): LINEAR_API_KEY required");
  }
  const query = `
    query Issue($id: String!) {
      issue(id: $id) {
        identifier
        title
        description
        priorityLabel
        createdAt
        updatedAt
        url
        state { name }
        assignee { name }
        creator { name }
        labels { nodes { name } }
      }
    }
  `;
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      authorization: token,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables: { id: key } }),
  });
  if (!res.ok) {
    throw new Error(
      `Linear API ${res.status} ${res.statusText}: ${await res.text().catch(() => "")}`,
    );
  }
  const body = (await res.json()) as {
    data?: { issue?: LinearIssuePayload };
    errors?: Array<{ message: string }>;
  };
  if (body.errors && body.errors.length > 0) {
    throw new Error(
      `Linear GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`,
    );
  }
  const issue = body.data?.issue;
  if (!issue) {
    throw new Error(`fetch_ticket (linear): issue ${key} not found`);
  }
  return {
    provider: "linear",
    url: issue.url ?? url,
    key: issue.identifier,
    title: issue.title,
    state: issue.state?.name ?? "unknown",
    ...(issue.priorityLabel ? { priority: issue.priorityLabel } : {}),
    ...(issue.assignee?.name ? { assignee: issue.assignee.name } : {}),
    ...(issue.creator?.name ? { reporter: issue.creator.name } : {}),
    labels: (issue.labels?.nodes ?? []).map((l) => l.name),
    body: issue.description ?? "",
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  };
}

interface LinearIssuePayload {
  identifier: string;
  title: string;
  description?: string;
  priorityLabel?: string;
  createdAt: string;
  updatedAt: string;
  url?: string;
  state?: { name: string };
  assignee?: { name: string };
  creator?: { name: string };
  labels?: { nodes: Array<{ name: string }> };
}
