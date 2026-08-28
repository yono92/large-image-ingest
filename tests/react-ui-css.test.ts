import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("first-party React UI stylesheet", () => {
  it("uses only prefixed public classes and custom properties", async () => {
    const css = await readFile(join(process.cwd(), "styles/react-ui.css"), "utf8");
    const customProperties = [...css.matchAll(/--([a-z0-9-]+)\s*:/g)].map((match) => match[1]);
    const classes = [...css.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((match) => match[1]);
    expect(customProperties.length).toBeGreaterThan(10);
    expect(customProperties.every((property) => property.startsWith("lii-"))).toBe(true);
    expect(classes.length).toBeGreaterThan(10);
    expect(classes.every((className) => className.startsWith("lii-"))).toBe(true);
  });

  it("stays scoped and covers narrow layout and reduced motion", async () => {
    const css = await readFile(join(process.cwd(), "styles/react-ui.css"), "utf8");
    expect(css).not.toMatch(/(^|[},]\s*)(html|body|:root)(\s|,|\{)/m);
    expect(css).toContain("@media (max-width: 40rem)");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation-duration: 0ms !important");
    expect(css).toContain("font-variant-numeric: tabular-nums");
  });
});
