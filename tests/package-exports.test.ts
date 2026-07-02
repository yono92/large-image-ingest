import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("package exports", () => {
  it("publishes stable subpaths for core, transports, and Node gateway", async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
      files: string[];
    };

    expect(packageJson.exports).toMatchObject({
      ".": {
        types: "./dist/esm/index.d.ts",
        import: "./dist/esm/index.js",
        require: "./dist/cjs/index.js"
      },
      "./core": {
        types: "./dist/esm/core.d.ts",
        import: "./dist/esm/core.js",
        require: "./dist/cjs/core.js"
      },
      "./transport-s3": {
        types: "./dist/esm/s3.d.ts",
        import: "./dist/esm/s3.js",
        require: "./dist/cjs/s3.js"
      },
      "./transport-tus": {
        types: "./dist/esm/tus.d.ts",
        import: "./dist/esm/tus.js",
        require: "./dist/cjs/tus.js"
      },
      "./node": {
        types: "./dist/esm/nas.d.ts",
        import: "./dist/esm/nas.js",
        require: "./dist/cjs/nas.js"
      }
    });
    expect(packageJson.files).toEqual(expect.arrayContaining(["dist", "docs", "examples"]));
  });
});
