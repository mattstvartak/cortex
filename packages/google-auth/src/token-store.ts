import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { z } from "zod";

export const googleTokenSchema = z.object({
  /** OAuth client id — from a Google Cloud project. */
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  refresh_token: z.string().min(1),
  /** Scopes granted. Adapters compare this against what they need. */
  scopes: z.array(z.string()).default([]),
  /** Optional — default to the installed-app flow endpoint. */
  token_endpoint: z
    .string()
    .url()
    .default("https://oauth2.googleapis.com/token"),
});

export type GoogleToken = z.infer<typeof googleTokenSchema>;

/**
 * Location of the persisted token file. Overridable via
 * `CORTEX_GOOGLE_TOKEN_PATH` for containerized setups.
 */
export function defaultTokenPath(): string {
  const override = process.env.CORTEX_GOOGLE_TOKEN_PATH;
  if (override) return override;
  return path.join(os.homedir(), ".cortex", "google-token.json");
}

export async function readGoogleToken(
  tokenPath: string = defaultTokenPath(),
): Promise<GoogleToken> {
  let raw: string;
  try {
    raw = await readFile(tokenPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Google token file not found at ${tokenPath}. ` +
          `Run the Cortex google-auth wizard (forthcoming) or drop a valid ` +
          `token file yourself.`,
      );
    }
    throw err;
  }
  const parsed: unknown = JSON.parse(raw);
  return googleTokenSchema.parse(parsed);
}

export async function writeGoogleToken(
  token: GoogleToken,
  tokenPath: string = defaultTokenPath(),
): Promise<void> {
  await mkdir(path.dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, `${JSON.stringify(token, null, 2)}\n`, "utf8");
}
