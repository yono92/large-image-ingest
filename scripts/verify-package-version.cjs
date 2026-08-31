#!/usr/bin/env node

const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const packageRoot = join(__dirname, "..");
const packageMetadata = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const source = readFileSync(join(packageRoot, "src", "package-version.ts"), "utf8");
const versionMatch = source.match(/PACKAGE_VERSION\s*=\s*"([^"]+)"/);
const nameMatch = source.match(/PACKAGE_NAME\s*=\s*"([^"]+)"/);

if (nameMatch?.[1] !== packageMetadata.name || versionMatch?.[1] !== packageMetadata.version) {
  process.stderr.write("Package metadata and embedded manifest producer metadata are out of sync.\n");
  process.exitCode = 1;
}
