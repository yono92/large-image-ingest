import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("package exports", () => {
  it("publishes stable subpaths for core, transports, and Node gateway", async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies: Record<string, string>;
      exports: Record<string, unknown>;
      files: string[];
      peerDependencies?: Record<string, string>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
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
        types: "./dist/esm/node.d.ts",
        import: "./dist/esm/node.js",
        require: "./dist/cjs/node.js"
      },
      "./react": {
        types: "./dist/esm/react.d.ts",
        import: "./dist/esm/react.js",
        require: "./dist/cjs/react.js"
      },
      "./tiff": {
        types: "./dist/esm/tiff.d.ts",
        import: "./dist/esm/tiff.js",
        require: "./dist/cjs/tiff.js"
      }
    });
    expect(packageJson.files).toEqual(expect.arrayContaining(["dist", "docs", "examples"]));
    expect(packageJson.exports).not.toHaveProperty("./preview");
    expect(packageJson.peerDependencies?.react).toBe(">=18 <20");
    expect(packageJson.peerDependenciesMeta?.react?.optional).toBe(true);
    expect(packageJson.peerDependencies?.geotiff).toBe("^3.0.5");
    expect(packageJson.peerDependenciesMeta?.geotiff?.optional).toBe(true);
    expect(packageJson.exports).not.toHaveProperty("./metadata");
    expect(packageJson.exports).not.toHaveProperty("./derivatives");
  });

  it("keeps derivative helpers inside existing package boundaries without runtime processing dependencies", async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      exports: Record<string, unknown>;
      version: string;
    };

    expect(packageJson.version).toBe("1.3.0");
    expect(packageJson.exports).toHaveProperty(".");
    expect(packageJson.exports).toHaveProperty("./core");
    expect(packageJson.exports).toHaveProperty("./node");
    expect(packageJson.exports).toHaveProperty("./react");
    expect(packageJson.exports).toHaveProperty("./tiff");
    expect(packageJson.dependencies ?? {}).toEqual({});
  });
});
