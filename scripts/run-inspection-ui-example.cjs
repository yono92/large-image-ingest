#!/usr/bin/env node

const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

const packageRoot = path.resolve(__dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const build = spawnSync(npmCommand, ["run", "build"], { cwd: packageRoot, stdio: "inherit" });
if (build.status !== 0) {
  process.exitCode = build.status ?? 1;
} else {
  const server = spawn(process.execPath, [path.join(packageRoot, "examples/reference-local/local-server.mjs")], {
    cwd: packageRoot,
    env: { ...process.env, LII_REFERENCE_PORT: "4177", LII_REFERENCE_CHUNK_DELAY_MS: "600" },
    stdio: "inherit"
  });
  const vite = spawn(process.execPath, [
    path.join(packageRoot, "node_modules/vite/bin/vite.js"),
    "--config",
    path.join(packageRoot, "examples/inspection-upload-react/vite.config.ts")
  ], { cwd: packageRoot, stdio: "inherit" });
  let stopping = false;
  const stop = (code = 0) => {
    if (stopping) return;
    stopping = true;
    server.kill("SIGTERM");
    vite.kill("SIGTERM");
    process.exitCode = code;
  };
  server.once("exit", (code) => { if (!stopping) stop(code ?? 1); });
  vite.once("exit", (code) => { if (!stopping) stop(code ?? 1); });
  process.once("SIGINT", () => stop());
  process.once("SIGTERM", () => stop());
}
