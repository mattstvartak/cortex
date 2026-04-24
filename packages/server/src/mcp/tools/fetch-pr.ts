import { z } from "zod";
import { tryReadGithubToken } from "@onenomad/cortex-github-auth";
import type { McpTool } from "../tool.js";

const inputSchema = z.object({
  /**
   * GitHub or Bitbucket PR URL. Accepted shapes:
   *   https://github.com/OWNER/REPO/pull/N
   *   https://github.example.com/OWNER/REPO/pull/N (GitHub Enterprise)
   *   https://bitbucket.org/WORKSPACE/REPO/pull-requests/N
   */
  url: z.string().url(),
  /** Include up to this many recent comments. Default 10. */
  commentLimit: z.number().int().nonnegative().max(100).default(10),
});

interface Output {
  provider: "github" | "bitbucket";
  url: string;
  title: string;
  state: string;
  author: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  mergedAt?: string | null | undefined;
  reviewers: string[];
  labels: string[];
  changedFiles?: number | undefined;
  additions?: number | undefined;
  deletions?: number | undefined;
  commits?: number | undefined;
  comments: Array<{
    author: string;
    body: string;
    createdAt: string;
  }>;
}

/**
 * Fetch a pull-request summary from GitHub or Bitbucket.
 * Auth comes from env (GITHUB_TOKEN for GitHub, ATLASSIAN_EMAIL +
 * ATLASSIAN_API_TOKEN for Bitbucket) or the GitHub device-flow token
 * written by `cortex github-login` — same credentials used by the
 * respective adapters.
 */
export const fetchPr: McpTool<typeof inputSchema, Output> = {
  name: "fetch_pr",
  description:
    "Fetch a pull request's title, description, state, author, " +
    "reviewers, change stats, and recent comments from a GitHub or " +
    "Bitbucket URL. Use when the user asks 'should I approve this " +
    "PR?' or shares a PR link — pair with `search_related` on the " +
    "repo's project for past decisions before recommending.",
  inputSchema,

  async handler(input, ctx) {
    const parsed = parsePrUrl(input.url);
    if (!parsed) {
      throw new Error(
        `fetch_pr: URL doesn't look like a GitHub or Bitbucket PR: ${input.url}`,
      );
    }
    if (parsed.provider === "github") {
      return fetchGithubPr(parsed, input.commentLimit);
    }
    return fetchBitbucketPr(parsed, input.commentLimit);
  },
};

// --- URL parsing -------------------------------------------------------

type ParsedPrUrl =
  | { provider: "github"; apiBase: string; owner: string; repo: string; number: number; url: string }
  | { provider: "bitbucket"; workspace: string; repo: string; id: number; url: string };

function parsePrUrl(raw: string): ParsedPrUrl | undefined {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return undefined;
  }
  const host = u.hostname.toLowerCase();

  // Bitbucket cloud: bitbucket.org/<workspace>/<repo>/pull-requests/<id>
  if (host === "bitbucket.org") {
    const m = u.pathname.match(
      /^\/([^/]+)\/([^/]+)\/pull-requests\/(\d+)/,
    );
    if (!m) return undefined;
    return {
      provider: "bitbucket",
      workspace: m[1]!,
      repo: m[2]!,
      id: Number.parseInt(m[3]!, 10),
      url: raw,
    };
  }

  // GitHub / GitHub Enterprise: <host>/<owner>/<repo>/pull/<number>
  const ghMatch = u.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!ghMatch) return undefined;
  const apiBase =
    host === "github.com"
      ? "https://api.github.com"
      : `${u.protocol}//${host}/api/v3`;
  return {
    provider: "github",
    apiBase,
    owner: ghMatch[1]!,
    repo: ghMatch[2]!,
    number: Number.parseInt(ghMatch[3]!, 10),
    url: raw,
  };
}

// --- GitHub ------------------------------------------------------------

async function fetchGithubPr(
  parsed: Extract<ParsedPrUrl, { provider: "github" }>,
  commentLimit: number,
): Promise<Output> {
  const token =
    process.env.GITHUB_TOKEN ||
    (await tryReadGithubToken().catch(() => undefined));
  if (!token) {
    throw new Error(
      "fetch_pr (github): no token. Run `cortex github-login` or set GITHUB_TOKEN.",
    );
  }
  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "cortex-mcp",
  };
  const base = `${parsed.apiBase}/repos/${parsed.owner}/${parsed.repo}/pulls/${parsed.number}`;

  const [pr, reviewers, issueComments, reviewComments] = await Promise.all([
    ghJson<GithubPrPayload>(base, headers),
    ghJson<GithubReviewerPayload[]>(`${base}/reviews`, headers).catch(
      () => [] as GithubReviewerPayload[],
    ),
    ghJson<GithubCommentPayload[]>(
      `${parsed.apiBase}/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}/comments?per_page=${commentLimit}`,
      headers,
    ).catch(() => [] as GithubCommentPayload[]),
    commentLimit > 0
      ? ghJson<GithubCommentPayload[]>(
          `${base}/comments?per_page=${commentLimit}`,
          headers,
        ).catch(() => [] as GithubCommentPayload[])
      : Promise.resolve([]),
  ]);

  const reviewerLogins = new Set<string>();
  for (const r of reviewers) {
    if (r.user?.login) reviewerLogins.add(r.user.login);
  }
  for (const r of pr.requested_reviewers ?? []) {
    if (r.login) reviewerLogins.add(r.login);
  }

  const comments = [...issueComments, ...reviewComments]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, commentLimit)
    .map((c) => ({
      author: c.user?.login ?? "unknown",
      body: c.body,
      createdAt: c.created_at,
    }));

  return {
    provider: "github",
    url: parsed.url,
    title: pr.title,
    state: pr.merged ? "merged" : pr.state,
    author: pr.user?.login ?? "unknown",
    body: pr.body ?? "",
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    mergedAt: pr.merged_at ?? null,
    reviewers: [...reviewerLogins],
    labels: (pr.labels ?? []).map((l) => l.name),
    changedFiles: pr.changed_files,
    additions: pr.additions,
    deletions: pr.deletions,
    commits: pr.commits,
    comments,
  };
}

async function ghJson<T>(
  url: string,
  headers: Record<string, string>,
): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(
      `GitHub API ${res.status} ${res.statusText} for ${url}: ${await res.text().catch(() => "")}`,
    );
  }
  return (await res.json()) as T;
}

interface GithubPrPayload {
  title: string;
  state: string;
  merged: boolean;
  merged_at: string | null;
  user?: { login: string };
  body?: string;
  created_at: string;
  updated_at: string;
  requested_reviewers?: Array<{ login: string }>;
  labels?: Array<{ name: string }>;
  changed_files?: number;
  additions?: number;
  deletions?: number;
  commits?: number;
}
interface GithubReviewerPayload {
  user?: { login: string };
}
interface GithubCommentPayload {
  user?: { login: string };
  body: string;
  created_at: string;
}

// --- Bitbucket ---------------------------------------------------------

async function fetchBitbucketPr(
  parsed: Extract<ParsedPrUrl, { provider: "bitbucket" }>,
  commentLimit: number,
): Promise<Output> {
  const email = process.env.ATLASSIAN_EMAIL;
  const token = process.env.ATLASSIAN_API_TOKEN;
  if (!email || !token) {
    throw new Error(
      "fetch_pr (bitbucket): ATLASSIAN_EMAIL + ATLASSIAN_API_TOKEN required in .env",
    );
  }
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const headers = { authorization: `Basic ${auth}`, accept: "application/json" };
  const base = `https://api.bitbucket.org/2.0/repositories/${parsed.workspace}/${parsed.repo}/pullrequests/${parsed.id}`;

  const [pr, rawComments] = await Promise.all([
    bbJson<BitbucketPrPayload>(base, headers),
    bbJson<{ values?: BitbucketCommentPayload[] }>(
      `${base}/comments?pagelen=${commentLimit}`,
      headers,
    ).catch(() => ({}) as { values?: BitbucketCommentPayload[] }),
  ]);

  const comments = (rawComments.values ?? [])
    .filter((c) => !c.deleted && c.content?.raw)
    .slice(0, commentLimit)
    .map((c) => ({
      author: c.user?.display_name ?? c.user?.nickname ?? "unknown",
      body: c.content?.raw ?? "",
      createdAt: c.created_on,
    }));

  return {
    provider: "bitbucket",
    url: parsed.url,
    title: pr.title,
    state: pr.state.toLowerCase(),
    author: pr.author?.display_name ?? pr.author?.nickname ?? "unknown",
    body: pr.description ?? pr.summary?.raw ?? "",
    createdAt: pr.created_on,
    updatedAt: pr.updated_on,
    mergedAt: pr.state === "MERGED" ? pr.updated_on : null,
    reviewers: (pr.reviewers ?? []).map(
      (r) => r.display_name ?? r.nickname ?? "unknown",
    ),
    labels: [],
    comments,
  };
}

async function bbJson<T>(
  url: string,
  headers: Record<string, string>,
): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(
      `Bitbucket API ${res.status} ${res.statusText} for ${url}: ${await res.text().catch(() => "")}`,
    );
  }
  return (await res.json()) as T;
}

interface BitbucketUser {
  display_name?: string;
  nickname?: string;
}
interface BitbucketPrPayload {
  title: string;
  state: string;
  author?: BitbucketUser;
  description?: string;
  summary?: { raw: string };
  created_on: string;
  updated_on: string;
  reviewers?: BitbucketUser[];
}
interface BitbucketCommentPayload {
  user?: BitbucketUser;
  content?: { raw: string };
  created_on: string;
  deleted?: boolean;
}
