import { autoLoadDotEnv } from "./dotenv.js";
import { runInit } from "./init.js";
import { runSmoke } from "./smoke.js";
import { startServer } from "../mcp/server.js";

const HELP = `cortex — work-knowledge MCP server and CLI

Usage:
  cortex <command> [options]

Commands:
  init       Interactive setup wizard. Writes .env and config/cortex.yaml.
             Detects and optionally installs Engram/Persona MCP servers.
  start      Boot the Cortex MCP server over stdio (for Claude Code / clients).
  smoke      Run a live LLM probe against every enabled provider.
  help       Show this message.

Environment:
  CORTEX_CONFIG_PATH   Path to cortex.yaml (default: ./config/cortex.yaml)
  ENGRAM_MCP_URL       Override Engram MCP endpoint
  PERSONA_MCP_URL      Override Persona MCP endpoint
  LOG_LEVEL            debug | info (default info)

First run:
  cortex init
`;

export async function runCli(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  // Every subcommand except `help`/`init` needs .env loaded. `init` loads
  // it explicitly after writing.
  if (command && command !== "help" && command !== "--help" && command !== "-h") {
    autoLoadDotEnv();
  }

  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(HELP);
      return 0;

    case "init":
      return runInit({ args: rest });

    case "smoke":
      return runSmoke();

    case "start":
      await startServer();
      return 0;

    default:
      process.stderr.write(`cortex: unknown command '${command}'\n\n`);
      process.stdout.write(HELP);
      return 2;
  }
}
