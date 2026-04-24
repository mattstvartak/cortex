import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { findRepoRoot } from "./dotenv.js";

/**
 * Thin `docker compose` wrappers so users don't need to remember the
 * flags. They shell out directly — stdout/stderr pass through so the
 * output looks identical to running `docker compose` by hand.
 *
 * All three commands find the compose file by walking up from cwd
 * until a `docker-compose.yml` is seen; that means you can run
 * `cortex up` from anywhere inside the repo.
 */

function locateComposeFile(): string | undefined {
  const start = findRepoRoot(process.cwd());
  const candidate = path.join(start, "docker-compose.yml");
  if (existsSync(candidate)) return candidate;
  return undefined;
}

async function runComposeCommand(args: readonly string[]): Promise<number> {
  const composeFile = locateComposeFile();
  if (!composeFile) {
    process.stderr.write(
      "cortex: couldn't find docker-compose.yml. Run this from inside a " +
        "Cortex checkout, or cd to a workspace that contains one.\n",
    );
    return 2;
  }
  const cwd = path.dirname(composeFile);
  return new Promise((resolve) => {
    const child = spawn("docker", ["compose", ...args], {
      cwd,
      stdio: "inherit",
      // Windows needs shell:true to resolve docker.exe via PATH; on
      // Unix shell:true would wrap the args in /bin/sh -c for no gain.
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => resolve(code ?? 0));
    child.on("error", (err) => {
      process.stderr.write(
        `cortex: couldn't run docker compose — ${err.message}. ` +
          "Is Docker installed and on your PATH?\n",
      );
      resolve(127);
    });
  });
}

export async function runDockerUp(args: readonly string[]): Promise<number> {
  // Default to detached (-d) so the terminal returns; users can pass
  // --foreground or explicit docker flags to override.
  const passthrough = args.includes("--foreground")
    ? args.filter((a) => a !== "--foreground")
    : ["-d", ...args];
  return runComposeCommand(["up", ...passthrough]);
}

export async function runDockerDown(args: readonly string[]): Promise<number> {
  return runComposeCommand(["down", ...args]);
}

export async function runDockerLogs(args: readonly string[]): Promise<number> {
  // `-f` by default so tailing is the default verb.
  const hasFlag = args.some((a) => a === "-f" || a === "--follow");
  const passthrough = hasFlag ? args : ["-f", ...args];
  return runComposeCommand(["logs", ...passthrough]);
}
