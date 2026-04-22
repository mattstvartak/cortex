export interface GmailPayload {
  mimeType?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { size?: number; data?: string };
  parts?: GmailPayload[];
}

/**
 * Walk a Gmail message payload tree and return the best plain-text
 * body. Prefers `text/plain`, falls back to stripping HTML from
 * `text/html`. Returns empty string if nothing usable is found.
 */
export function decodeMessageBody(payload: GmailPayload | undefined): string {
  if (!payload) return "";

  const plain = findPart(payload, "text/plain");
  if (plain) return decode(plain);

  const html = findPart(payload, "text/html");
  if (html) return stripHtml(decode(html));

  // No matching parts — some messages stash the body on the root.
  if (payload.body?.data) return decode(payload);

  return "";
}

function findPart(
  payload: GmailPayload,
  mimeType: string,
): GmailPayload | null {
  if (payload.mimeType === mimeType && payload.body?.data) return payload;
  for (const part of payload.parts ?? []) {
    const hit = findPart(part, mimeType);
    if (hit) return hit;
  }
  return null;
}

function decode(payload: GmailPayload): string {
  const data = payload.body?.data;
  if (!data) return "";
  return Buffer.from(data, "base64url").toString("utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
