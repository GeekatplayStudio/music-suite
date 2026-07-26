#!/usr/bin/env node
// Cross-platform bridge so `npm run install|start|stop` from the project root
// reaches the same unified launcher the .bat/.command files use.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ACTIONS = new Set(["install", "start", "stop"]);

const [action, ...forwarded] = process.argv.slice(2);
if (!ACTIONS.has(action)) {
  console.error(`Usage: node scripts/launch.mjs <${[...ACTIONS].join("|")}> [args...]`);
  process.exit(2);
}

function resolveLauncher() {
  if (process.platform === "win32") {
    return {
      command: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(ROOT, `${action}.ps1`), ...forwarded],
    };
  }
  const script = join(ROOT, `${action}.command`);
  if (!existsSync(script)) {
    console.error(`Launcher not found: ${script}`);
    process.exit(1);
  }
  return { command: "/bin/bash", args: [script, ...forwarded] };
}

const { command, args } = resolveLauncher();
// Forward output through our own pipes rather than handing this process's stdio down.
// Windows starts the detached services with handle inheritance enabled, so an inherited
// stdout pipe would stay open for the lifetime of the servers and `npm run start` would
// never return to the prompt even though startup already finished.
const child = spawn(command, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
child.on("error", (error) => {
  console.error(`Failed to run ${action}: ${error.message}`);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : code ?? 0);
});
