const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const versionSource = readFileSync(join(root, "src", "version.ts"), "utf8");
const match = versionSource.match(
  /LARGE_IMAGE_INGEST_VERSION\s*=\s*"([^"]+)"/
);

assert.ok(match, "src/version.ts must export a literal LARGE_IMAGE_INGEST_VERSION.");
assert.equal(
  match[1],
  packageJson.version,
  "LARGE_IMAGE_INGEST_VERSION must match package.json version."
);
