import {
  defaultPidFilePath,
  isProcessAlive,
  killProcess,
  readPidFile,
  removePidFile,
} from "./pid-file.js";
import {
  openBrowser,
  sessionLogDir,
  spawnDetached,
  waitForHttp,
} from "./detach.js";
import { getActiveWorkspace } from "./workspace/manager.js";

/**
 * `cortex stop` — kill the currently-running daemon by reading the
 * PID file written at startup. Gracefully SIGTERMs first, then
 * SIGKILLs if it's still alive after 8s.
 */
export async function runStop(_args: readonly string[]): Promise<number> {
  const slug = (await getActiveWorkspace().catch(() => undefined))?.slug;
  const pidPath = defaultPidFilePath(slug);
  const pid = await readPidFile(slug);

  if (!pid) {
    process.stdout.write(
      `cortex stop: no PID file at ${pidPath}. Nothing to stop.\n`,
    );
    return 0;
  }
  if (!isProcessAlive(pid)) {
    process.stdout.write(
      `cortex stop: PID ${pid} isn't running (stale PID file). Cleaning up.\n`,
    );
    await removePidFile(slug);
    return 0;
  }

  process.stdout.write(`Stopping cortex (PID ${pid})...\n`);
  try {
    await killProcess(pid);
  } catch (err) {
    process.stderr.write(
      `cortex stop: couldn't kill PID ${pid}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }
  await removePidFile(slug);
  process.stdout.write("Stopped.\n");
  return 0;
}

/**
 * `cortex restart` — stop the running daemon (if any), then start a
 * new one detached so the current terminal stays free. Useful after
 * editing config or pulling a new build.
 *
 * Flags:
 *   --foreground  Start the new daemon in this terminal instead of
 *                 detaching. Helpful when you want to see logs live.
 */
export async function runRestart(args: readonly string[]): Promise<number> {
  const foreground =
    args.includes("--foreground") || args.includes("--fg");

  // 1. Stop anything that's currently running.
  const stopCode = await runStop([]);
  if (stopCode !== 0) return stopCode;

  if (foreground) {
    process.stdout.write("Starting cortex in foreground...\n");
    const { startServer } = await import("../mcp/server.js");
    await startServer();
    return 0;
  }

  // 2. Detached respawn. Same mechanism `cortex init --web` uses.
  process.stdout.write("Starting cortex detached...\n");
  const bin = process.argv[1] ?? "cortex";
  const sessionDir = sessionLogDir();
  const sidecar = await spawnDetached({
    command: process.execPath,
    args: [bin, "start"],
    sessionDir,
    label: "sidecar",
    env: { CORTEX_MCP_TRANSPORT: "http" },
  });
  process.stdout.write(
    `Cortex restarted (PID ${sidecar.pid}).\n` +
      `  logs (stdout): ${sidecar.stdoutLog}\n` +
      `  logs (stderr): ${sidecar.stderrLog}\n`,
  );

  // 3. Wait for the sidecar HTTP to come up and confirm.
  const ready = await waitForHttp("http://127.0.0.1:4141/health", {
    timeoutMs: 15_000,
  });
  if (ready) {
    process.stdout.write("Health check passed — dashboard API is live.\n");
    // Best-effort browser open if a setup page is configured — mirrors
    // init --web's UX. Skipped if --no-browser.
    if (!args.includes("--no-browser") && !args.includes("--silent")) {
      // No-op on servers without a display; openBrowser is best-effort.
      void openBrowser;
    }
  } else {
    process.stdout.write(
      `Sidecar didn't respond on :4141 within 15s. Tail ${sidecar.stderrLog} for progress.\n`,
    );
  }
  return 0;
}
