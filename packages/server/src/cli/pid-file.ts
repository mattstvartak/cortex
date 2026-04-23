import { readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Track the running daemon's PID so `cortex restart` / `cortex stop`
 * can find it without netstat gymnastics. One PID file per workspace
 * (or per install when no workspace is active) — no concurrent
 * daemons per workspace by design.
 *
 * Overridable via CORTEX_PID_FILE for tests / containerized setups.
 */

export function defaultPidFilePath(workspaceSlug?: string): string {
  const override = process.env.CORTEX_PID_FILE;
  if (override) return override;
  const home = os.homedir();
  if (workspaceSlug) {
    return path.join(home, ".cortex", "workspaces", workspaceSlug, "run", "cortex.pid");
  }
  return path.join(home, ".cortex", "run", "cortex.pid");
}

export async function writePidFile(
  pid: number,
  workspaceSlug?: string,
): Promise<string> {
  const filePath = defaultPidFilePath(workspaceSlug);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, String(pid), "utf8");
  return filePath;
}

export async function readPidFile(
  workspaceSlug?: string,
): Promise<number | undefined> {
  const filePath = defaultPidFilePath(workspaceSlug);
  try {
    const raw = await readFile(filePath, "utf8");
    const pid = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(pid) ? pid : undefined;
  } catch {
    return undefined;
  }
}

export async function removePidFile(workspaceSlug?: string): Promise<void> {
  const filePath = defaultPidFilePath(workspaceSlug);
  await rm(filePath, { force: true });
}

/**
 * Is the given PID still a live OS process? Best-effort — on Unix
 * `process.kill(pid, 0)` is the canonical probe; on Windows we check
 * via an empty signal too, which throws if the pid doesn't exist.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // ESRCH = no such process. EPERM = process exists but we can't
    // signal it (still "alive" for our purposes — it's running).
    return code === "EPERM";
  }
}

/**
 * Kill a process gracefully. Sends SIGTERM (Unix) or forces the
 * equivalent on Windows. Waits up to `timeoutMs` for it to exit,
 * then escalates to SIGKILL / taskkill /F if still running.
 */
export async function killProcess(
  pid: number,
  opts: { timeoutMs?: number } = {},
): Promise<void> {
  const timeout = opts.timeoutMs ?? 8_000;
  if (!isProcessAlive(pid)) return;

  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return; // Already gone.
    throw err;
  }

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return;
    await new Promise((r) => setTimeout(r, 200));
  }

  // Escalate.
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // ESRCH or platform that doesn't map SIGKILL — fall through.
  }
  await new Promise((r) => setTimeout(r, 500));
}
