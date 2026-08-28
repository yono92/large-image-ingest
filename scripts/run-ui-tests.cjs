const { spawnSync } = require("node:child_process");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const fixture = spawnSync(npmCommand, ["run", "example:inspection-ui:fixture"], {
  cwd: process.cwd(),
  stdio: "inherit"
});
if (fixture.status !== 0) {
  process.exitCode = fixture.status ?? 1;
  return;
}

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["playwright", "test", "--config", "playwright.config.ts"],
  { cwd: process.cwd(), stdio: "inherit" }
);

if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
