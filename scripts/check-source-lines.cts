import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// Reports source files above the line target as GitHub warning annotations; never fails.
const LINE_TARGET = 500;
const packageRoot = join(__dirname, "..");

function listSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSources(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

const oversized = listSources(join(packageRoot, "src"))
  .map((path) => ({ path: relative(packageRoot, path), lines: readFileSync(path, "utf8").split("\n").length - 1 }))
  .filter((file) => file.lines > LINE_TARGET)
  .sort((left, right) => right.lines - left.lines);

for (const file of oversized) {
  process.stdout.write(`::warning file=${file.path}::${file.path} has ${file.lines} lines (target ${LINE_TARGET}).\n`);
}
process.stdout.write(`${oversized.length} source file(s) above ${LINE_TARGET} lines.\n`);
