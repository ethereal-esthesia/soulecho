#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { killPort } from "./process-utils.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4173;
const DEFAULT_CONFIGURATION = "default";
const DEMO_PROFILE_PATH = "public/demo-profile.json";
const DEMO_CONFIG_DIR = "public/demo-configs";
const DIST_DEMO_PROFILE_PATH = "dist/demo-profile.json";
const DIST_DEMO_HTML_PATH = "dist/demo.html";
const DIST_INDEX_HTML_PATH = "dist/index.html";
const VALUE_OPTIONS = new Set(["--host", "--port", "--base"]);

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

function hasFlag(name) {
  return process.argv.includes(name);
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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: options.env || process.env
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

function getDemoProfilePath(configuration) {
  if (configuration === DEFAULT_CONFIGURATION) {
    return existsSync(path.join(DEMO_CONFIG_DIR, `${DEFAULT_CONFIGURATION}.json`))
      ? path.join(DEMO_CONFIG_DIR, `${DEFAULT_CONFIGURATION}.json`)
      : DEMO_PROFILE_PATH;
  }

  return path.join(DEMO_CONFIG_DIR, `${configuration}.json`);
}

function validateDemoProfile(profilePath) {
  if (!existsSync(profilePath)) {
    console.error(`Missing ${profilePath}. Run: npm run configure -- ${configuration}`);
    process.exit(1);
  }

  let profile;
  try {
    profile = JSON.parse(readFileSync(profilePath, "utf8"));
  } catch (error) {
    console.error(
      `${profilePath} is not valid JSON: ${error instanceof Error ? error.message : error}`
    );
    process.exit(1);
  }

  if (!profile?.modelPresetAsset?.path) {
    console.error(`${profilePath} is missing modelPresetAsset.path.`);
    process.exit(1);
  }

  return profile;
}

function syncSelectedProfileToDist(profilePath) {
  if (!existsSync("dist")) {
    console.error("Missing dist/. Build the demo first or omit --no-build.");
    process.exit(1);
  }

  mkdirSync(path.dirname(DIST_DEMO_PROFILE_PATH), { recursive: true });
  writeFileSync(DIST_DEMO_PROFILE_PATH, readFileSync(profilePath));
}

function syncDemoPageToRoot() {
  if (!existsSync(DIST_DEMO_HTML_PATH)) {
    console.error(`Missing ${DIST_DEMO_HTML_PATH}. Build the demo first or omit --no-build.`);
    process.exit(1);
  }

  writeFileSync(DIST_INDEX_HTML_PATH, readFileSync(DIST_DEMO_HTML_PATH));
}

const host = readOption("--host", process.env.HOST || DEFAULT_HOST);
const port = Number(readOption("--port", process.env.PORT || DEFAULT_PORT));
const basePath = readOption("--base", process.env.SOULECHO_BASE_PATH || "/");
const buildOnly = hasFlag("--build-only");
const skipBuild = hasFlag("--no-build");
const configuration = slugify(getPositionalArgument(DEFAULT_CONFIGURATION)) || DEFAULT_CONFIGURATION;
const profilePath = getDemoProfilePath(configuration);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid port: ${port}`);
  process.exit(1);
}

const profile = validateDemoProfile(profilePath);
console.log(`Demo configuration: ${configuration}`);
console.log(`Demo profile: ${profile.modelPresetLabel || profile.modelPresetAsset.label}`);

if (!skipBuild) {
  console.log("Building public demo bundle...");
  run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
    env: {
      ...process.env,
      SOULECHO_BASE_PATH: basePath
    }
  });
}

syncSelectedProfileToDist(profilePath);
syncDemoPageToRoot();

if (buildOnly) {
  console.log(`Demo build ready: dist/index.html and dist/demo.html (${configuration})`);
  process.exit(0);
}

await killPort(port);

const demoUrl = `http://${host}:${port}/`;
console.log(`Starting demo preview at ${demoUrl}`);
const child = spawn(viteCommand(), ["preview", "--host", host, "--port", String(port), "--strictPort"], {
  env: {
    ...process.env,
    SOULECHO_BASE_PATH: basePath
  },
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
