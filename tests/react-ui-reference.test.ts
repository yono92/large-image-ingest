import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("first-party inspection UI reference", () => {
  it("uses public package surfaces and provider-neutral infrastructure without Uppy", async () => {
    const app = await readFile(join(process.cwd(), "examples/inspection-upload-react/src/App.tsx"), "utf8");
    const main = await readFile(join(process.cwd(), "examples/inspection-upload-react/src/main.tsx"), "utf8");
    expect(app).toContain('from "large-image-ingest/react-ui"');
    expect(app).toContain('from "large-image-ingest/react"');
    expect(app).toContain('from "large-image-ingest/core"');
    expect(main).toContain('"large-image-ingest/react-ui/styles.css"');
    expect(`${app}\n${main}`).not.toMatch(/@uppy|uppy-react|src\/react-ui/);
  });

  it("documents all nine credential-free evaluation outcomes", async () => {
    const readme = await readFile(join(process.cwd(), "examples/inspection-upload-react/README.md"), "utf8");
    for (const outcome of [
      "Select", "validation", "progress", "pause", "reload", "mismatch", "cancel", "completion", "verification"
    ]) {
      expect(readme.toLowerCase()).toContain(outcome.toLowerCase());
    }
    expect(readme).toContain("requires no provider credentials");
  });
});
