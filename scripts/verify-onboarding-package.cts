import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os = require("node:os");
import path = require("node:path");

const temporary = mkdtempSync(path.join(os.tmpdir(), "lii-onboarding-consumer-"));
try {
  const repository = path.resolve(__dirname, "..");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const packed: { files: { path: string }[]; filename: string } = JSON.parse(execFileSync(npm, ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary],
    { cwd: repository, encoding: "utf8" }))[0];
  if (packed.files.some((file) => /(^|\/)\.local-(adoption|data)(\/|$)/.test(file.path))) {
    throw new Error("Private local records must not be packaged.");
  }
  if (packed.files.some(file => file.path.startsWith(".specify/") || file.path.endsWith(".sh"))) {
    throw new Error("Spec Kit shell tools must not be packaged.");
  }
  const consumer = path.join(temporary, "consumer");
  const installed = path.join(consumer, "node_modules", "large-image-ingest");
  mkdirSync(installed, { recursive: true });
  writeFileSync(path.join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync("tar", ["-xzf", path.join(temporary, packed.filename), "-C", installed, "--strip-components=1"]);
  for (const name of ["minimal-upload.mjs", "verified-workflow.mjs"]) {
    const output = execFileSync(process.execPath, [path.join(installed, "dist", "examples", "onboarding", name),
      "--root", path.join(temporary, `artifacts-${name}`)],
      { cwd: consumer, encoding: "utf8", env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" } });
    const result = JSON.parse(output.split("\n")[0]!);
    if (!result.storedVerified || (name === "verified-workflow.mjs" && (!result.evidenceReloaded || !result.recovered))) {
      throw new Error("Packed onboarding example failed verification.");
    }
    process.stdout.write(`Packed consumer ${name}: ${result.status}, stored original verified\n`);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
