const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const outputDir = join(__dirname, "..", "dist", "cjs");

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, "package.json"), `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`);
