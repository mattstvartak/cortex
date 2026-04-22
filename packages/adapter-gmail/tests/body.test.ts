import { describe, expect, it } from "vitest";
import { decodeMessageBody, type GmailPayload } from "../src/body.js";

function base64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

describe("decodeMessageBody", () => {
  it("prefers text/plain parts over text/html", () => {
    const payload: GmailPayload = {
      mimeType: "multipart/alternative",
      parts: [
        {
          mimeType: "text/html",
          body: { data: base64url("<p>ignore me</p>") },
        },
        {
          mimeType: "text/plain",
          body: { data: base64url("use this one") },
        },
      ],
    };
    expect(decodeMessageBody(payload)).toBe("use this one");
  });

  it("falls back to text/html with tag stripping", () => {
    const payload: GmailPayload = {
      mimeType: "text/html",
      body: {
        data: base64url(
          "<p>Hi team,</p><p>Please <strong>review</strong>.</p>",
        ),
      },
    };
    const out = decodeMessageBody(payload);
    expect(out).toContain("Hi team,");
    expect(out).toContain("Please review.");
    expect(out).not.toMatch(/<[^>]+>/);
  });

  it("returns empty string when no usable body is present", () => {
    expect(decodeMessageBody(undefined)).toBe("");
    expect(decodeMessageBody({ mimeType: "image/png" })).toBe("");
  });
});
