import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";
import { resolve } from "node:path";

const fixture = resolve("examples/reference-local/.fixtures/synthetic-inspection.tiff");

test("default panel is keyboard-operable, responsive, and verifies the stored original", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.getByText("synthetic-inspection.tiff")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start ingest" })).toBeVisible();

  await expectNoSeriousAccessibilityViolations(page);

  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  const transitionDuration = await page.locator(".lii-button").first().evaluate((element) => (
    getComputedStyle(element).transitionDuration
  ));
  expect(transitionDuration).toBe("0s");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.getByRole("button", { name: "Start ingest" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("The application verified the stored original.")).toBeVisible();
  await page.screenshot({ path: "test-results/react-ui/default-320.png", fullPage: true });

  await page.setViewportSize({ width: 640, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("alternate token composition and safe validation failure remain visible", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Composed theme" }).click();
  await expect(page.getByText("Original evidence transfer")).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  await page.screenshot({ path: "test-results/react-ui/composed-theme.png", fullPage: true });

  await page.locator('input[type="file"]').setInputFiles({
    name: "unsupported.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an inspection image")
  });
  await page.getByRole("button", { name: "Start ingest" }).click();
  await expect(page.getByRole("heading", { name: "Upload needs attention" })).toBeFocused();
  await expect(page.getByText("validation.failed")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Cannot start upload because validation failed");
});

test("paused transfer survives reload and resumes only after exact source reselection", async ({ page }) => {
  await page.route("**/api/uploads/*/chunks/*", async (route) => {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_500));
    await route.continue();
  });
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(fixture);
  const pauseButton = page.getByRole("button", { name: "Pause" });
  await page.getByRole("button", { name: "Start ingest" }).focus();
  await Promise.all([
    pauseButton.waitFor({ state: "visible" }),
    page.keyboard.press("Enter")
  ]);
  await pauseButton.click();
  await expect(page.getByText("Upload paused", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText(/Browser storage retains recovery evidence/)).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.getByText("Compatible source", { exact: true })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  await page.getByRole("button", { name: "Resume" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("The application verified the stored original.")).toBeVisible();
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
