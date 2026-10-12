import assert = require("node:assert/strict");
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os = require("node:os");
import path = require("node:path");

const managers = ["npm", "pnpm", "yarn", "bun"] as const;
type Manager = typeof managers[number];
const temporary = mkdtempSync(path.join(os.tmpdir(), "lii-onboarding-consumer-"));
let stage = "arguments";
try {
  const args = process.argv.slice(2);
  let manager: Manager = "npm";
  let packagePath: string | undefined;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!value || value.startsWith("--") || !option || seen.has(option)) throw new Error("Invalid arguments.");
    seen.add(option);
    if (option === "--manager" && managers.includes(value as Manager)) manager = value as Manager;
    else if (option === "--package") packagePath = path.resolve(value);
    else throw new Error("Invalid arguments.");
  }
  const repository = path.resolve(__dirname, "..");
  const consumer = path.join(temporary, "consumer");
  mkdirSync(consumer);
  const env = { ...process.env, NODE_PATH: "", NODE_OPTIONS: "",
    npm_config_cache: path.join(temporary, "npm-cache"),
    npm_config_update_notifier: "false", COREPACK_ENABLE_PROJECT_SPEC: "0" };
  const run = (tool: string, commandArgs: string[], label: string, cwd = consumer) => {
    stage = label;
    const command = process.platform === "win32" && ["npm", "pnpm", "yarn"].includes(tool) ? `${tool}.cmd` : tool;
    const result = spawnSync(command, commandArgs, { cwd, env, encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error("Consumer stage failed.");
    return result.stdout;
  };
  const managerVersion = run(manager, ["--version"], "manager availability").trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(managerVersion)) throw new Error("Invalid manager version.");
  if (!packagePath) {
    const packed: { filename: string }[] = JSON.parse(run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary], "pack", repository));
    packagePath = path.join(temporary, packed[0]!.filename);
  }
  // Inspect the actual shared tarball, including when CI supplies --package.
  const files = run("tar", ["-tzf", packagePath], "package contents").trim().split("\n").map(file => file.replace(/^package\//, ""));
  assert(!files.some(file => /(^|\/)\.local-(adoption|data)(\/|$)/.test(file) || file.startsWith(".specify/") || file.endsWith(".sh")));
  const readme = run("tar", ["-xOf", packagePath, "package/README.md"], "packaged README");
  for (const bin of ["large-image-ingest-minimal", "large-image-ingest-verified"]) assert(readme.includes(bin));
  writeFileSync(path.join(consumer, "package.json"), JSON.stringify({ name: "isolated-ingest-consumer", private: true, type: "module" }));
  writeFileSync(path.join(consumer, ".npmrc"), "auto-install-peers=false\nregistry=http://127.0.0.1:9/\n");
  if (manager === "yarn") {
    writeFileSync(path.join(consumer, ".yarnrc.yml"), ["nodeLinker: pnp", "pnpEnableEsmLoader: true", "enableScripts: false",
      "enableNetwork: false", "enableImmutableInstalls: false", "enableGlobalCache: false"].join("\n") + "\n");
  }
  const installArgs: Record<Manager, string[]> = {
    npm: ["install", packagePath, "--ignore-scripts", "--offline", "--no-audit", "--no-fund"],
    pnpm: ["add", packagePath, "--ignore-scripts", "--offline", "--store-dir", path.join(temporary, "pnpm-store")],
    yarn: ["add", `large-image-ingest@file:${packagePath}`, "--mode=skip-build"],
    bun: ["add", packagePath, "--ignore-scripts"]
  };
  run(manager, installArgs[manager], "install");
  if (manager === "yarn") {
    assert(readdirSync(consumer).includes(".pnp.cjs"));
    assert(!readdirSync(consumer).includes("node_modules"));
  }
  const smoke = path.join(consumer, "smoke.mjs");
  writeFileSync(smoke, `import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
for (const name of ["large-image-ingest", "large-image-ingest/core", "large-image-ingest/node", "large-image-ingest/workflow"]) {
  const esm = await import(name); const cjs = require(name);
  const key = name.endsWith("/node") ? "verifyNodeFileManifest" : name.endsWith("/workflow") ? "createVerifiedIngestWorkflow" : "createIngestSession";
  assert.equal(typeof esm[key], "function"); assert.equal(typeof cjs[key], "function");
}
for (const peer of ["react", "geotiff"]) assert.throws(() => require.resolve(peer));
console.log("ESM/CommonJS imports and absent optional peers verified");
`);
  if (manager === "yarn") run(manager, ["node", smoke], "module imports");
  else run(process.execPath, [smoke], "module imports");
  const execArgs: Record<Manager, string[]> = {
    npm: ["exec", "--no", "--"], pnpm: ["exec"], yarn: ["run"], bun: ["run"]
  };
  const example = (bin: string, exampleArgs: string[], label: string) => {
    const output = run(manager, [...execArgs[manager], bin, ...exampleArgs], label);
    const line = output.split("\n").find(value => value.startsWith("{"));
    assert(line);
    const result = JSON.parse(line) as { status: string; storedVerified: boolean; recovered?: boolean; evidenceReloaded?: boolean };
    assert.equal(result.storedVerified, true);
    assert.equal(result.status, bin.endsWith("verified") ? "evidence_persisted" : "completed");
    if (bin.endsWith("verified")) {
      assert.equal(result.recovered, true); assert.equal(result.evidenceReloaded, true);
    }
  };
  example("large-image-ingest-minimal", ["--root", path.join(temporary, "minimal")], "minimal example");
  example("large-image-ingest-verified", ["--root", path.join(temporary, "workflow")], "workflow example");
  const source = path.join(temporary, "inspection image.tiff");
  const original = Buffer.alloc(600 * 1024, 123);
  writeFileSync(source, original);
  const outputRoot = path.join(temporary, "real file artifacts");
  example("large-image-ingest-minimal", ["--file", source, "--root", outputRoot], "real source example");
  stage = "source preservation";
  assert.deepEqual(readFileSync(source), original);
  const targets = readdirSync(path.join(outputRoot, "targets"));
  assert.equal(targets.length, 1);
  assert.deepEqual(readFileSync(path.join(outputRoot, "targets", targets[0]!)), original);
  process.stdout.write(`PASS ${manager} ${managerVersion}: ESM/CommonJS, absent optional peers, minimal/workflow/real-file examples verified\n`);
} catch {
  process.stderr.write(`Package consumer failed at ${stage}. Check manager availability, package build and the documented qualification environment.\n`);
  process.exitCode = 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
