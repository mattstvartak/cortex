import { z } from "zod";
import type { WizardModule } from "@onenomad/cortex-core";
import { outlookConfigSchema, type OutlookConfig } from "./adapter.js";

/**
 * Outlook / Microsoft 365 adapter wizard. v1 asks the user to paste a
 * personal Graph access token (from Graph Explorer or an app
 * registration). A proper device-flow OAuth package is planned — see
 * the adapter README.
 */
export const outlookWizard: WizardModule<OutlookConfig> = {
  id: "outlook",
  name: "Outlook",
  category: "adapter",
  description:
    "Ingest messages from Outlook / Microsoft 365 via Microsoft Graph. " +
    "v1 uses a pasted personal access token — device-flow auth is future work.",
  configSchema: outlookConfigSchema,
  steps: [
    {
      key: "folders",
      prompt:
        "Mail folders to pull from (well-known names like Inbox, SentItems, Archive, or folder ids)",
      type: "list",
      defaultValue: ["Inbox"],
    },
    {
      key: "query",
      prompt:
        "Optional Graph search fragment (KQL, e.g. \"from:boss@example.com\"). Leave blank for all messages.",
      type: "text",
      defaultValue: "",
    },
    {
      key: "maxPerRun",
      prompt: "Max messages per sync run",
      type: "text",
      defaultValue: "100",
      pattern: /^\d+$/,
    },
    {
      key: "includeBodyPreview",
      prompt:
        "Fall back to `bodyPreview` when the full body is empty or unreadable?",
      type: "boolean",
      defaultValue: true,
    },
    {
      key: "defaultProject",
      prompt:
        "Default project slug when classification is uncertain (optional)",
      type: "text",
      defaultValue: "",
    },
  ],
  secrets: [
    {
      envVar: "MICROSOFT_GRAPH_TOKEN",
      prompt:
        "Microsoft Graph access token (from Graph Explorer or an Azure app registration)",
      type: "password",
      required: true,
    },
  ],
  derivedTaxonomy: (state) => {
    const slugs = new Set<string>();
    if (typeof state.defaultProject === "string" && state.defaultProject) {
      slugs.add(state.defaultProject);
    }
    return { projects: [...slugs].map((slug) => ({ slug })) };
  },
};

const coercedConfigSchema = z.preprocess((val) => {
  if (typeof val !== "object" || val === null) return val;
  const obj = { ...(val as Record<string, unknown>) };
  const v = obj.maxPerRun;
  if (typeof v === "string" && v.length > 0) obj.maxPerRun = Number(v);
  if (v === "" || v === undefined) delete obj.maxPerRun;
  return obj;
}, outlookConfigSchema);

(outlookWizard as { configSchema: z.ZodTypeAny }).configSchema = coercedConfigSchema;
