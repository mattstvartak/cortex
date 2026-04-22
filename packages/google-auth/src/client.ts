import { GoogleApiError } from "./errors.js";
import type { GoogleToken } from "./token-store.js";

export interface GoogleAuthClientOptions {
  token: GoogleToken;
  fetchImpl?: typeof fetch;
  /** How many seconds before expiry to treat the cached token as stale. */
  refreshSkewSeconds?: number;
}

interface CachedAccessToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

/**
 * Holds a refresh token and mints short-lived access tokens on demand.
 * Every Google adapter takes one of these and calls `authorizedFetch`
 * to hit Google APIs.
 */
export class GoogleAuthClient {
  private cached: CachedAccessToken | null = null;
  private inFlight: Promise<CachedAccessToken> | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly refreshSkewSeconds: number;

  constructor(private readonly opts: GoogleAuthClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.refreshSkewSeconds = opts.refreshSkewSeconds ?? 60;
  }

  /** Scopes this client believes it has. Adapters can introspect. */
  get scopes(): readonly string[] {
    return this.opts.token.scopes;
  }

  hasAllScopes(required: readonly string[]): boolean {
    const got = new Set(this.opts.token.scopes);
    return required.every((s) => got.has(s));
  }

  /**
   * Return a bearer header for Google APIs. Refreshes the token if
   * expired/missing. Concurrent callers share one in-flight refresh.
   */
  async authorization(): Promise<string> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt - this.refreshSkewSeconds * 1000 > now) {
      return `Bearer ${this.cached.accessToken}`;
    }
    if (!this.inFlight) this.inFlight = this.refresh();
    try {
      const fresh = await this.inFlight;
      return `Bearer ${fresh.accessToken}`;
    } finally {
      this.inFlight = null;
    }
  }

  /**
   * `fetch` wrapper that adds auth + maps errors. Returns parsed JSON
   * on 2xx; throws `GoogleApiError` otherwise.
   */
  async authorizedFetch<T>(
    url: string,
    init: RequestInit = {},
  ): Promise<T> {
    const authorization = await this.authorization();
    const res = await this.fetchImpl(url, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        authorization,
        accept: "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new GoogleApiError(
        `Google API ${res.status} ${res.statusText} at ${url}: ${body.slice(0, 300)}`,
        res.status,
        body,
      );
    }
    return (await res.json()) as T;
  }

  private async refresh(): Promise<CachedAccessToken> {
    const body = new URLSearchParams({
      client_id: this.opts.token.client_id,
      client_secret: this.opts.token.client_secret,
      refresh_token: this.opts.token.refresh_token,
      grant_type: "refresh_token",
    });
    const res = await this.fetchImpl(this.opts.token.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GoogleApiError(
        `Google token refresh failed: ${res.status} ${res.statusText}: ${text.slice(0, 300)}`,
        res.status,
        text,
      );
    }
    const json = (await res.json()) as {
      access_token: string;
      expires_in?: number;
    };
    const expiresAt = Date.now() + (json.expires_in ?? 3600) * 1000;
    const cached: CachedAccessToken = {
      accessToken: json.access_token,
      expiresAt,
    };
    this.cached = cached;
    return cached;
  }
}
