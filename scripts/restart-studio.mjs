#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { killPort } from "./process-utils.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 5173;
function readOption(name, fallback) {
  const prefix = `${name}=`;
  const index = process.argv.findIndex((arg) => arg === name || arg.startsWith(prefix));

  if (index === -1) {
    return fallback;
  }

  const arg = process.argv[index];
  if (arg.startsWith(prefix)) {
    return arg.slice(prefix.length);
  }

  return process.argv[index + 1] || fallback;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function viteCommand() {
  const vitePath = fileURLToPath(
    new URL(
      process.platform === "win32" ? "../node_modules/.bin/vite.cmd" : "../node_modules/.bin/vite",
      import.meta.url
    )
  );

  return existsSync(vitePath) ? vitePath : "vite";
}

const host = readOption("--host", process.env.HOST || DEFAULT_HOST);
const port = Number(readOption("--port", process.env.PORT || DEFAULT_PORT));

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid port: ${port}`);
  process.exit(1);
}

await killPort(port, { reportEmpty: true });

console.log("Building production bundle...");
run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"]);

console.log(`Starting SoulEcho Studio on http://${host}:${port}/?mode=studio`);
const child = spawn(viteCommand(), ["--host", host, "--port", String(port), "--strictPort"], {
  stdio: "inherit",
  shell: process.platform === "win32"
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code || 0);
});
