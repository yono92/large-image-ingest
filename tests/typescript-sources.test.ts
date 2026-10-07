import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("TypeScript source ownership", () => {
  it("keeps handwritten JavaScript and shell files out of the repository", () => {
    const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      encoding: "utf8"
    }).split("\0");
    const forbiddenSources = files.filter(file => /\.(?:js|cjs|mjs|sh)$/.test(file) && existsSync(file));
    expect(forbiddenSources).toEqual([]);
  });
});
