#!/usr/bin/env node
import { runCli } from "./cli/index.js";

runCli(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("[cortex] fatal", err);
    process.exit(1);
  },
);
