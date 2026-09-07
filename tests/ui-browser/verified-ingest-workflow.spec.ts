import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";

test("verified workflow is keyboard-operable at 320px and 200% zoom", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Verified workflow" }).click();
  const start = page.getByRole("button", { name: "Start verified ingest" });
  await expect(start).toBeVisible();
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Workflow state: evidence persisted")).toBeVisible();
  await expect(page.getByText("Persisted revision 1")).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.setViewportSize({ width: 640, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

async function expectNoSeriousAccessibilityViolations(page: Page): Promise<void> {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const result = await (globalThis as typeof globalThis & {
      axe: { run(root: Document): Promise<{ violations: Array<{ id: string; impact: string | null }> }> };
    }).axe.run(document);
    return result.violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map(({ id, impact }) => ({ id, impact }));
  });
  expect(violations).toEqual([]);
}
