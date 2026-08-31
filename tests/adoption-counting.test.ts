import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { countNonCommentSourceLines } = require("../benchmarks/adoption/protocol.cjs") as {
  countNonCommentSourceLines(source: string): number;
};

describe("adoption evidence counting", () => {
  it("counts physical lines containing language tokens", () => {
    const source = [
      "// comment",
      "const value = 1; // trailing comment",
      "",
      "/* block",
      "comment */",
      "const url = 'https://example.invalid/a//b';",
      "type Result = { ok: boolean };"
    ].join("\n");
    expect(countNonCommentSourceLines(source)).toBe(3);
  });

  it("does not mistake comment markers inside strings for comments", () => {
    expect(countNonCommentSourceLines("const a = '/* kept */';\nconst b = `first\n// kept in template\nlast`;\n"))
      .toBe(4);
  });

  it("keeps application, test, and shared harness boundaries separate", () => {
    const report = JSON.parse(readFileSync(new URL("../benchmarks/results/2026-08-adoption-evidence.json", import.meta.url), "utf8"));
    for (const candidate of report.candidates) {
      expect(candidate.artifacts.application).toHaveLength(candidate.implementation.applicationFileCount);
      expect(candidate.artifacts.candidateTests).toHaveLength(candidate.implementation.testFileCount);
      expect(candidate.artifacts.application).not.toEqual(expect.arrayContaining(candidate.artifacts.sharedHarness));
    }
  });
});
