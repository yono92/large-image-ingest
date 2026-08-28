#!/usr/bin/env node

const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

const packageRoot = path.resolve(__dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const build = spawnSync(npmCommand, ["run", "build"], {
  cwd: packageRoot,
  stdio: "inherit"
});

if (build.status !== 0) {
  process.exitCode = build.status ?? 1;
} else {
  startExample();
}

function startExample() {
  const server = spawn(process.execPath, [path.join(packageRoot, "examples/reference-local/local-server.mjs")], {
    cwd: packageRoot,
    env: {
      ...process.env,
      LII_REFERENCE_PORT: process.env.LII_UPPY_EXAMPLE_PORT ?? "4174",
      LII_REFERENCE_CHUNK_DELAY_MS: process.env.LII_UPPY_EXAMPLE_CHUNK_DELAY_MS ?? "600"
    },
    stdio: "inherit"
  });
  const vite = spawn(
    process.execPath,
    [
      path.join(packageRoot, "node_modules/vite/bin/vite.js"),
      "--config",
      path.join(packageRoot, "examples/uppy-react/vite.config.ts")
    ],
    { cwd: packageRoot, stdio: "inherit" }
  );

  let stopping = false;
  const stop = (exitCode = 0) => {
    if (stopping) {
      return;
    }
    stopping = true;
    server.kill("SIGTERM");
    vite.kill("SIGTERM");
    process.exitCode = exitCode;
  };

  server.once("exit", (code, signal) => {
    if (!stopping) {
      process.stderr.write(`Local reference target exited (${signal ?? code ?? "unknown"}).\n`);
      stop(code ?? 1);
    }
  });
  vite.once("exit", (code, signal) => {
    if (!stopping) {
      process.stderr.write(`Vite exited (${signal ?? code ?? "unknown"}).\n`);
      stop(code ?? 1);
    }
  });
  process.once("SIGINT", () => stop(0));
  process.once("SIGTERM", () => stop(0));
}
