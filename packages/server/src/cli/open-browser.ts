import { spawn } from "node:child_process";

/**
 * Poll an HTTP endpoint until it returns 2xx or the deadline passes.
 * Returns true once the endpoint answers OK, false on timeout.
 */
export async function waitForHttp(
  url: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const timeout = opts.timeoutMs ?? 20_000;
  const interval = opts.intervalMs ?? 250;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(interval) });
      if (res.ok) return true;
    } catch {
      // Not reachable yet — sleep and retry.
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

/**
 * Open a URL in the user's default browser. Fire-and-forget — if the
 * OS helper fails, the caller can still print the URL so the user
 * can click or copy.
 */
export async function openBrowser(url: string): Promise<boolean> {
  const [cmd, args] = browserCommand(url);
  if (!cmd) return false;
  try {
    const child = spawn(cmd, args, {
      stdio: "ignore",
      detached: true,
      shell: process.platform === "win32",
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function browserCommand(url: string): [string | undefined, string[]] {
  switch (process.platform) {
    case "win32":
      // `start` is a cmd builtin. Empty quoted string is the "title"
      // positional that `start` eats before the URL.
      return ["cmd", ["/c", "start", '""', url]];
    case "darwin":
      return ["open", [url]];
    default:
      return ["xdg-open", [url]];
  }
}
