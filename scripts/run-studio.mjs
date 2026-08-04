#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { killPort } from "./process-utils.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 5173;
const DEFAULT_CONFIGURATION = "default";
const VALUE_OPTIONS = new Set(["--host", "--port"]);

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

function getPositionalArgument(fallback) {
  const optionValueIndexes = new Set();

  process.argv.forEach((arg, index) => {
    if (VALUE_OPTIONS.has(arg)) {
      optionValueIndexes.add(index + 1);
    }
  });

  const value = process.argv
    .slice(2)
    .find((arg, index) => !arg.startsWith("--") && !optionValueIndexes.has(index + 2));

  return value || fallback;
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
const configuration = slugify(getPositionalArgument(DEFAULT_CONFIGURATION)) || DEFAULT_CONFIGURATION;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid port: ${port}`);
  process.exit(1);
}

await killPort(port);

const studioUrl = `http://${host}:${port}/?mode=studio&config=${encodeURIComponent(configuration)}`;
console.log(`SoulEcho Studio${configuration !== DEFAULT_CONFIGURATION ? ` (profile: ${configuration})` : ""}`);
console.log(`Open ${studioUrl}`);
console.log('Click "Save demo profile", then enter the profile name to write that configuration.');

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
