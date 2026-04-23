import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { openSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Spawn a cross-platform detached child that survives the parent's
 * exit. stdout/stderr are redirected to log files under
 * `~/.cortex/logs/<session>/` so the user can tail them later. The
 * child is unref'd immediately so Node's event loop doesn't keep the
 * parent alive on its account.
 *
 * Return value carries the child's PID and its log paths so the
 * caller can print them to the user.
 */
export interface DetachedSpawn {
  pid: number;
  stdoutLog: string;
  stderrLog: string;
}

export interface DetachedOptions {
  command: string;
  args: readonly string[];
  /** Working directory. Default: parent's cwd. */
  cwd?: string;
  /** Extra env merged on top of process.env. */
  env?: Record<string, string>;
  /** Logical session directory (shared between co-spawned children). */
  sessionDir: string;
  /** Friendly name for log filenames — e.g. "sidecar", "dashboard". */
  label: string;
  /**
   * Force shell resolution. Needed when `command` is a .cmd/.bat shim
   * on Windows (npm, pnpm, npx). For absolute paths like
   * `process.execPath`, leave this false — Node on Windows with
   * `shell:true` concatenates args without quoting, which corrupts
   * any path containing a space (e.g. "Program Files").
   * Default: false.
   */
  shell?: boolean;
}

/**
 * Where per-session logs land. One dir per `cortex init` invocation
 * keeps the sidecar + dashboard logs side by side for easy pairing.
 */
export function sessionLogDir(): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  return path.join(os.homedir(), ".cortex", "logs", `setup-${stamp}`);
}

export async function spawnDetached(
  opts: DetachedOptions,
): Promise<DetachedSpawn> {
  await mkdir(opts.sessionDir, { recursive: true });
  const stdoutLog = path.join(opts.sessionDir, `${opts.label}.stdout.log`);
  const stderrLog = path.join(opts.sessionDir, `${opts.label}.stderr.log`);

  if (process.platform === "win32") {
    return spawnDetachedWindows({ ...opts, stdoutLog, stderrLog });
  }
  return spawnDetachedUnix({ ...opts, stdoutLog, stderrLog });
}

interface InternalOpts extends DetachedOptions {
  stdoutLog: string;
  stderrLog: string;
}

/**
 * Unix path: `detached: true` + unref + raw fd stdio is the textbook
 * pattern. Held-open fds work because fork() duplicates them into
 * the child cleanly.
 */
function spawnDetachedUnix(opts: InternalOpts): DetachedSpawn {
  const outFd = openSync(opts.stdoutLog, "a");
  const errFd = openSync(opts.stderrLog, "a");

  const child: ChildProcess = spawn(opts.command, [...opts.args], {
    cwd: opts.cwd ?? process.cwd(),
    env: { ...process.env, ...(opts.env ?? {}) },
    detached: true,
    stdio: ["ignore", outFd, errFd],
    shell: opts.shell ?? false,
  });
  child.unref();

  if (!child.pid) {
    throw new Error(
      `spawnDetached: ${opts.command} failed to start (no pid).`,
    );
  }
  return { pid: child.pid, stdoutLog: opts.stdoutLog, stderrLog: opts.stderrLog };
}

/**
 * Windows path: use PowerShell's `Start-Process` with `-WindowStyle
 * Hidden`. Node's own `detached: true` doesn't reliably break the
 * parent-child relationship on Windows — the child gets dragged
 * down by the console/job-object cascade when the parent exits.
 * `Start-Process` is the OS-native detach primitive; the child
 * genuinely stands on its own afterwards.
 *
 * Returns the child's pid via `-PassThru`. Output + errors go to
 * the log files via `-RedirectStandardOutput` / `-RedirectStandardError`.
 */
function spawnDetachedWindows(opts: InternalOpts): DetachedSpawn {
  const argList = opts.args
    .map((a) => escapePowerShellSingleQuoted(a))
    .map((a) => `'${a}'`)
    .join(",");
  const env = opts.env ?? {};
  // Pre-set env vars in the PowerShell block so Start-Process sees them.
  const envAssigns = Object.entries(env)
    .map(
      ([k, v]) =>
        `$env:${k} = '${escapePowerShellSingleQuoted(v)}'`,
    )
    .join("; ");
  const filePath = escapePowerShellSingleQuoted(opts.command);
  const cwd = opts.cwd ?? process.cwd();
  const cwdEsc = escapePowerShellSingleQuoted(cwd);
  const stdoutEsc = escapePowerShellSingleQuoted(opts.stdoutLog);
  const stderrEsc = escapePowerShellSingleQuoted(opts.stderrLog);
  const argListPart = argList.length > 0 ? `-ArgumentList ${argList}` : "";

  const psCommand =
    (envAssigns ? `${envAssigns}; ` : "") +
    `$p = Start-Process -FilePath '${filePath}' ${argListPart} ` +
    `-WindowStyle Hidden -WorkingDirectory '${cwdEsc}' ` +
    `-RedirectStandardOutput '${stdoutEsc}' -RedirectStandardError '${stderrEsc}' ` +
    `-PassThru; $p.Id`;

  const res = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", psCommand],
    { encoding: "utf8" },
  );
  if (res.error) {
    throw new Error(
      `spawnDetached (Windows): ${res.error.message}. ` +
        `Check ${opts.stderrLog} for details.`,
    );
  }
  if (res.status !== 0) {
    throw new Error(
      `spawnDetached (Windows) PowerShell exit ${res.status}: ${res.stderr.trim() || "(no stderr)"}. ` +
        `Check ${opts.stderrLog} for child process errors.`,
    );
  }
  const pid = Number.parseInt(res.stdout.trim(), 10);
  if (!pid || Number.isNaN(pid)) {
    throw new Error(
      `spawnDetached (Windows): Start-Process didn't return a pid. ` +
        `stdout: ${res.stdout.slice(0, 200)}`,
    );
  }
  return {
    pid,
    stdoutLog: opts.stdoutLog,
    stderrLog: opts.stderrLog,
  };
}

/**
 * PowerShell single-quoted strings treat everything literally except
 * the single-quote itself, which is escaped by doubling.
 */
function escapePowerShellSingleQuoted(v: string): string {
  return v.replace(/'/g, "''");
}

/**
 * Poll an HTTP URL until it responds 2xx or the timeout elapses.
 * Used after spawning the dashboard sidecar so we don't open the
 * browser before the server is ready to serve the setup page.
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
