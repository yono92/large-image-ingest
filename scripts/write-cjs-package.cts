import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outputDir = join(__dirname, "..", "dist", "cjs");

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, "package.json"), `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`);
