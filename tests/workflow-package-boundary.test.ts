import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("workflow package boundary", () => {
  it("publishes a dedicated workflow subpath", async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    expect(packageJson.exports).toHaveProperty("./workflow");
  });

  it("keeps the workflow entrypoint browser-safe", async () => {
    const source = await readFile(join(process.cwd(), "src/workflow.ts"), "utf8");
    expect(source).not.toMatch(/from ["']node:/);
    expect(source).not.toMatch(/from ["'].\/preservation\.js["']/);
    expect(source).not.toMatch(/from ["']react["']/);
  });

  it("keeps filesystem workflow adapters on the Node subpath", async () => {
    const workflow = await readFile(join(process.cwd(), "src/workflow.ts"), "utf8");
    const node = await readFile(join(process.cwd(), "src/node.ts"), "utf8");
    expect(workflow).not.toContain("node-workflow");
    expect(node).toContain("./node-workflow.js");
  });
});
