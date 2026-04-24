import { z } from "zod";
import type {
  AdapterCapabilities,
  AdapterFactory,
  ClassificationContext,
  ClassifiedItem,
  NormalizedItem,
  ProjectCandidate,
  RawSourceItem,
} from "@onenomad/cortex-core";
import { BaseAdapter } from "@onenomad/cortex-adapter-sdk";
import { htmlToText } from "./body.js";

export const outlookConfigSchema = z.object({
  /**
   * Mail folders to pull from, in well-known-folder-name or id form.
   * "Inbox" is the default well-known name; "SentItems", "Archive",
   * etc. are also valid.
   */
  folders: z.array(z.string().min(1)).default(["Inbox"]),
  /**
   * Optional Graph `$search` fragment. Left blank, the adapter pulls
   * everything in the configured folders (scoped by `since` cursor).
   * Passed verbatim to `$search=` when set, so Graph KQL applies.
   */
  query: z.string().default(""),
  /** Per-run cap. Stops paging once this many messages have yielded. */
  maxPerRun: z.number().int().positive().default(100),
  /**
   * If true, `bodyPreview` is used when the body is empty/unavailable.
   * Useful for folders the caller's token can list but not read in full.
   */
  includeBodyPreview: z.boolean().default(true),
  /** Fallback project slug when the LLM classifier doesn't pick one. */
  defaultProject: z.string().default(""),
});

export type OutlookConfig = z.infer<typeof outlookConfigSchema>;

const CAPABILITIES: AdapterCapabilities = {
  supportsIncrementalSync: true,
  supportsWebhooks: false,
  supportsAttachments: false,
  supportsComments: false,
  supportsRealTime: false,
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const PAGE_SIZE = 50;
const SELECT_FIELDS = [
  "id",
  "subject",
  "from",
  "toRecipients",
  "ccRecipients",
  "body",
  "bodyPreview",
  "receivedDateTime",
  "sentDateTime",
  "conversationId",
  "webLink",
  "isRead",
  "hasAttachments",
].join(",");

interface GraphEmailAddress {
  name?: string;
  address?: string;
}

interface GraphRecipient {
  emailAddress?: GraphEmailAddress;
}

interface GraphMessage {
  id: string;
  subject?: string | null;
  from?: GraphRecipient | null;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  body?: { contentType?: "html" | "text"; content?: string };
  bodyPreview?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  conversationId?: string;
  webLink?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
}

interface GraphListResponse {
  value?: GraphMessage[];
  "@odata.nextLink"?: string;
}

interface RawOutlookItem {
  message: GraphMessage;
  folder: string;
}

export class OutlookAdapter extends BaseAdapter {
  readonly id = "outlook";
  readonly name = "Outlook";
  readonly version = "0.1.0";
  readonly configSchema = outlookConfigSchema;
  readonly requiredSecrets = ["MICROSOFT_GRAPH_TOKEN"] as const;
  readonly capabilities = CAPABILITIES;
  readonly pipelines = ["@onenomad/cortex-pipeline-conversation"] as const;

  private cfg!: OutlookConfig;
  private token!: string;

  protected override async onInit(): Promise<void> {
    this.cfg = this.configSchema.parse(this.ctx.config);
    const token = this.ctx.secrets.MICROSOFT_GRAPH_TOKEN ?? "";
    if (!token) {
      throw new Error(
        "outlook adapter: MICROSOFT_GRAPH_TOKEN must be set (paste a " +
          "Graph token from an Azure app registration or Graph Explorer)",
      );
    }
    this.token = token;
  }

  protected override async probeHealth(): Promise<Record<string, unknown>> {
    await this.graphFetch<{ displayName?: string }>("/me");
    return { folders: this.cfg.folders, query: this.cfg.query };
  }

  async *fetch(since?: Date): AsyncIterable<RawSourceItem> {
    const cap = this.cfg.maxPerRun;
    let emitted = 0;

    for (const folder of this.cfg.folders) {
      if (emitted >= cap) break;

      const initial = this.buildListUrl(folder, since);
      let next: string | undefined = initial;

      while (next) {
        if (emitted >= cap) break;
        const page: GraphListResponse = await this.graphFetch<GraphListResponse>(next);
        for (const message of page.value ?? []) {
          if (emitted >= cap) break;
          emitted += 1;
          yield {
            sourceId: `outlook:${message.id}`,
            raw: { message, folder } satisfies RawOutlookItem,
          };
        }
        next = page["@odata.nextLink"];
      }
    }

    this.markSuccess();
  }

  async transform(raw: RawSourceItem): Promise<NormalizedItem> {
    const item = raw.raw as RawOutlookItem;
    const { message, folder } = item;

    const body = message.body;
    let content = "";
    if (body?.content) {
      content =
        body.contentType === "html"
          ? htmlToText(body.content)
          : body.content.trim();
    }
    if (!content && this.cfg.includeBodyPreview && message.bodyPreview) {
      content = message.bodyPreview.trim();
    }

    const fromAddress = message.from?.emailAddress?.address;
    const authors = fromAddress ? [fromAddress] : [];

    const received =
      message.receivedDateTime ?? message.sentDateTime ?? new Date().toISOString();
    const sent = message.sentDateTime ?? received;
    const createdAt = new Date(sent);
    const updatedAt = new Date(received);

    const rawMetadata: Record<string, unknown> = {
      folder,
      conversationId: message.conversationId ?? null,
      isRead: message.isRead ?? false,
      hasAttachments: message.hasAttachments ?? false,
      toRecipients: recipientAddresses(message.toRecipients),
      ccRecipients: recipientAddresses(message.ccRecipients),
    };

    return {
      sourceId: raw.sourceId,
      sourceType: "email",
      sourceUrl: message.webLink ?? "",
      title: message.subject ?? "(no subject)",
      content,
      contentType: "conversation",
      createdAt,
      updatedAt,
      authors,
      rawMetadata,
    };
  }

  async classify(
    item: NormalizedItem,
    cctx: ClassificationContext,
  ): Promise<ClassifiedItem> {
    return {
      ...item,
      ...(await this.fallbackClassify(item, cctx, this.cfg.defaultProject)),
    };
  }

  /**
   * Discovery placeholder. v1 doesn't map Outlook folders or shared
   * mailboxes onto Cortex projects automatically; users declare the
   * mapping manually. Return an empty array so the projects wizard
   * simply skips this adapter in the candidate list.
   */
  async discoverProjects(): Promise<ProjectCandidate[]> {
    return [];
  }

  private buildListUrl(folder: string, since?: Date): string {
    const params = new URLSearchParams();
    params.set("$select", SELECT_FIELDS);
    params.set("$orderby", "receivedDateTime desc");
    params.set("$top", String(PAGE_SIZE));

    const filters: string[] = [];
    if (since) {
      filters.push(`receivedDateTime ge ${since.toISOString()}`);
    }
    if (filters.length > 0) params.set("$filter", filters.join(" and "));
    if (this.cfg.query.trim().length > 0) {
      // Graph requires $search to be quoted and disallows some
      // combinations with $orderby; keep it simple and let the
      // caller's query carry the KQL.
      params.set("$search", `"${this.cfg.query.replace(/"/g, '\\"')}"`);
    }

    const base = folderBasePath(folder);
    return `${GRAPH_BASE}${base}?${params.toString()}`;
  }

  private async graphFetch<T>(urlOrPath: string): Promise<T> {
    const url = urlOrPath.startsWith("http")
      ? urlOrPath
      : `${GRAPH_BASE}${urlOrPath}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        // Required by Graph whenever $search is present.
        ConsistencyLevel: "eventual",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `outlook: graph request failed ${res.status} ${res.statusText}: ${body.slice(0, 500)}`,
      );
    }
    return (await res.json()) as T;
  }
}

function folderBasePath(folder: string): string {
  const trimmed = folder.trim();
  if (!trimmed) return "/me/messages";
  // Well-known Graph folder names (Inbox, SentItems, Drafts, …) are
  // addressable by name; arbitrary folder ids are passed through too.
  return `/me/mailFolders/${encodeURIComponent(trimmed)}/messages`;
}

function recipientAddresses(recipients?: GraphRecipient[]): string[] {
  if (!recipients) return [];
  const out: string[] = [];
  for (const r of recipients) {
    const addr = r?.emailAddress?.address;
    if (addr) out.push(addr);
  }
  return out;
}

export const createAdapter: AdapterFactory = () => new OutlookAdapter();
