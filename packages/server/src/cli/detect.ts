import { spawn } from "node:child_process";

export interface DepStatus {
  /** Bin name (what we look for on PATH). */
  bin: string;
  /** npm package that provides it. */
  pkg: string;
  installed: boolean;
  /** Full path found via `where`/`which`, if any. */
  path?: string;
  /** Version from `<bin> --version`, if available. */
  version?: string;
}

/**
 * Pre-flight dependency probe. Cortex 0.3 went standalone — the Engram
 * and Persona MCP subprocesses are no longer spawned — so there is
 * currently nothing to probe. Kept as an extension point: any future
 * runtime that does require an external companion (e.g. a Synapse
 * bridge) plugs its probe in here.
 */
export async function detectDeps(): Promise<DepStatus[]> {
  return [];
}

async function probe(bin: string, pkg: string): Promise<DepStatus> {
  const path = await findOnPath(bin);
  if (!path) return { bin, pkg, installed: false };

  const version = await tryVersion(bin).catch(() => undefined);
  return { bin, pkg, installed: true, path, ...(version ? { version } : {}) };
}

/** Cross-platform "which". Returns the first match or undefined. */
async function findOnPath(bin: string): Promise<string | undefined> {
  const cmd = process.platform === "win32" ? "where" : "which";
  return runCapture(cmd, [bin])
    .then((out) => {
      const first = out.stdout.split(/\r?\n/).find((s) => s.trim().length > 0);
      return first?.trim();
    })
    .catch(() => undefined);
}

async function tryVersion(bin: string): Promise<string | undefined> {
  try {
    const out = await runCapture(bin, ["--version"], { timeoutMs: 5_000 });
    const line = out.stdout.trim() || out.stderr.trim();
    return line.split(/\r?\n/)[0];
  } catch {
    return undefined;
  }
}

/**
 * Install one or more npm packages globally. Streams output to stderr so
 * the user sees progress. Resolves with the exit code.
 */
export async function installGlobally(
  packages: string[],
): Promise<number> {
  if (packages.length === 0) return 0;
  // eslint-disable-next-line no-console
  process.stderr.write(
    `\nInstalling globally: ${packages.join(", ")}\n` +
      `(running: npm install -g ${packages.join(" ")})\n\n`,
  );

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["install", "-g", ...packages],
      { stdio: "inherit" },
    );
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", reject);
  });
}

/** Detect whether the `ollama` CLI is installed locally. */
export async function detectOllama(): Promise<{
  installed: boolean;
  version?: string;
  path?: string;
}> {
  const path = await findOnPath("ollama");
  if (!path) return { installed: false };
  const version = await tryVersion("ollama").catch(() => undefined);
  return { installed: true, path, ...(version ? { version } : {}) };
}

/**
 * Install Ollama using whatever the OS provides. Streams output. Resolves
 * with the exit code. On success, Ollama's installers start the service
 * automatically on Windows and macOS; Linux script starts/enables systemd.
 */
export async function installOllama(): Promise<number> {
  const platform = process.platform;
  process.stderr.write("\nInstalling Ollama locally...\n\n");

  if (platform === "win32") {
    // winget is present on Windows 11 out of the box.
    return spawnInherit("winget.exe", [
      "install",
      "--id",
      "Ollama.Ollama",
      "-e",
      "--accept-source-agreements",
      "--accept-package-agreements",
    ]);
  }

  if (platform === "darwin") {
    // Prefer Homebrew if available, otherwise the official installer.
    const hasBrew = await findOnPath("brew");
    if (hasBrew) {
      return spawnInherit("brew", ["install", "ollama"]);
    }
    process.stderr.write(
      "Homebrew not detected. Download the macOS app from " +
        "https://ollama.com/download — this wizard can't install the .app " +
        "bundle directly. Re-run after installing.\n",
    );
    return 1;
  }

  // Linux: use the official installer script.
  return runScript(
    "sh",
    ["-c", "curl -fsSL https://ollama.com/install.sh | sh"],
  );
}

/**
 * Check whether a model is already pulled on the given Ollama host.
 * Returns `undefined` if the host isn't reachable.
 */
export async function ollamaHasModel(
  host: string,
  model: string,
): Promise<boolean | undefined> {
  try {
    const res = await fetch(`${host.replace(/\/$/, "")}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    const names = (data.models ?? []).map((m) => m.name);
    return names.includes(model);
  } catch {
    return undefined;
  }
}

/** Run `ollama pull <model>`, streaming progress to the user's terminal. */
export async function ollamaPullModel(model: string): Promise<number> {
  process.stderr.write(`\nPulling model '${model}' (this can take a while)...\n\n`);
  return spawnInherit("ollama", ["pull", model]);
}

/**
 * Wait until Ollama responds at the given host, polling every interval.
 * Returns true if it came up within the timeout, false otherwise.
 */
export async function waitForOllama(
  host: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const deadline = Date.now() + (opts.timeoutMs ?? 30_000);
  const interval = opts.intervalMs ?? 1_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${host.replace(/\/$/, "")}/api/tags`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (res.ok) return true;
    } catch {
      // keep waiting
    }
    await sleep(interval);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function spawnInherit(cmd: string, args: readonly string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", reject);
  });
}

function runScript(shell: string, args: readonly string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(shell, args, { stdio: "inherit", shell: false });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", reject);
  });
}

interface CaptureResult {
  stdout: string;
  stderr: string;
}

function runCapture(
  cmd: string,
  args: readonly string[],
  opts: { timeoutMs?: number } = {},
): Promise<CaptureResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { shell: false });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let settled = false;

    const done = (result: CaptureResult | Error): void => {
      if (settled) return;
      settled = true;
      if (result instanceof Error) reject(result);
      else resolve(result);
    };

    child.stdout?.on("data", (d: Buffer) => out.push(d));
    child.stderr?.on("data", (d: Buffer) => err.push(d));
    child.on("error", (e) => done(e));
    child.on("exit", (code) => {
      const res: CaptureResult = {
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      };
      if (code === 0) done(res);
      else done(new Error(`${cmd} exited with code ${code}\n${res.stderr}`));
    });

    if (opts.timeoutMs) {
      setTimeout(() => {
        child.kill();
        done(new Error(`${cmd} timed out after ${opts.timeoutMs}ms`));
      }, opts.timeoutMs);
    }
  });
}
