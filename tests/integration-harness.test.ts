import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { runTransportConformance } from "../src/conformance.js";
import { PACKAGE_VERSION } from "../src/package-version.js";

const require = createRequire(import.meta.url);
const {
  getIntegrationTargets,
  runIntegrationHarness
} = require("../scripts/run-integration-tests.cjs") as {
  getIntegrationTargets(env?: Record<string, string | undefined>): {
    kind: string;
    enabled: boolean;
    requiredEnvironment: string[];
    missing: string[];
  }[];
  runIntegrationHarness(options?: {
    env?: Record<string, string | undefined>;
    stdout?: { write(chunk: string): void };
    stderr?: { write(chunk: string): void };
    runQualification?: (
      options: { repeat: number; realTarget: boolean },
      env: Record<string, string | undefined>
    ) => Promise<{ status: string }>;
  }): Promise<number>;
};
const { runRealTarget } = require("../scripts/run-conformance.cjs") as {
  runRealTarget(
    options: { repeat: number; realTarget: boolean },
    env: Record<string, string | undefined>,
    dependencies?: { sdk: { PACKAGE_VERSION: string; runTransportConformance: typeof runTransportConformance } }
  ): Promise<{
    status: string;
    targetClass: string;
    repeatCount: number;
    runs: { reports: { overallStatus: string; cleanup: { status: string; abandonedResourceCount: number } }[] }[];
  }>;
};

const fixtureEnvironment = (name: string) => ({
  LII_CONFORMANCE_OPT_IN: "1",
  LII_CONFORMANCE_DRIVER_MODULE: `tests/fixtures/conformance-drivers/${name}.mjs`
});

const sourceSdk = { PACKAGE_VERSION, runTransportConformance };

describe("integration harness", () => {
  it("skips without exact opt-in and a driver, without invoking qualification", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    let calls = 0;

    const code = await runIntegrationHarness({
      env: { LII_CONFORMANCE_OPT_IN: "true" },
      stdout: { write: (chunk) => { stdout.push(chunk); } },
      stderr: { write: (chunk) => { stderr.push(chunk); } },
      runQualification: async () => {
        calls += 1;
        return { status: "conformant" };
      }
    });

    expect(code).toBe(0);
    expect(calls).toBe(0);
    expect(stdout.join("")).toContain("SKIP transport-conformance");
    expect(stderr).toEqual([]);
  });

  it("does not treat legacy reachability configuration as behavioral evidence", () => {
    const [target] = getIntegrationTargets({
      LII_INTEGRATION_TUS_ENDPOINT: "https://example.invalid/files",
      LII_INTEGRATION_S3_BROKER_URL: "https://example.invalid/broker",
      LII_INTEGRATION_NAS_STAGING_ROOT: "/private/staging",
      LII_INTEGRATION_NAS_TARGET_ROOT: "/private/target"
    });

    expect(target).toMatchObject({
      kind: "transport-conformance",
      enabled: false,
      missing: ["LII_CONFORMANCE_OPT_IN", "LII_CONFORMANCE_DRIVER_MODULE"]
    });
  });

  it("runs an explicitly configured complete driver and reports catalog authority", async () => {
    const suite = await runRealTarget(
      { repeat: 1, realTarget: true },
      fixtureEnvironment("complete"),
      { sdk: sourceSdk }
    );

    expect(suite).toMatchObject({
      targetClass: "real-deployment",
      repeatCount: 1,
      status: "conformant"
    });
    expect(suite.runs[0]?.reports[0]?.overallStatus).toBe("conformant");
    expect(suite.runs[0]?.reports[0]?.cleanup).toEqual({
      status: "completed",
      abandonedResourceCount: 0
    });
  });

  it.each([
    ["skipped", "incomplete"],
    ["failed", "non_conformant"],
    ["cleanup-failed", "non_conformant"]
  ])("never promotes the %s fixture to conformant", async (fixture, expectedStatus) => {
    const suite = await runRealTarget(
      { repeat: 1, realTarget: true },
      fixtureEnvironment(fixture),
      { sdk: sourceSdk }
    );

    expect(suite.status).toBe(expectedStatus);
  });

  it("retains cleanup failure and abandoned-resource counts in the report", async () => {
    const suite = await runRealTarget(
      { repeat: 1, realTarget: true },
      fixtureEnvironment("cleanup-failed"),
      { sdk: sourceSdk }
    );

    expect(suite.runs[0]?.reports[0]?.cleanup).toEqual({
      status: "failed",
      abandonedResourceCount: 1
    });
  });

  it("fails safely without printing driver errors or sensitive values", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const secret = "https://secret.invalid/presigned?credential=value";

    const code = await runIntegrationHarness({
      env: fixtureEnvironment("skipped"),
      stdout: { write: (chunk) => { stdout.push(chunk); } },
      stderr: { write: (chunk) => { stderr.push(chunk); } },
      runQualification: async () => {
        throw new Error(secret);
      }
    });

    expect(code).toBe(1);
    expect(stderr.join("")).toContain("conformance.execution_failed");
    expect(`${stdout.join("")} ${stderr.join("")}`).not.toContain(secret);
    expect(`${stdout.join("")} ${stderr.join("")}`).not.toContain("secret.invalid");
  });

  it("returns failure for a configured incomplete report", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runIntegrationHarness({
      env: fixtureEnvironment("skipped"),
      stdout: { write: (chunk) => { stdout.push(chunk); } },
      stderr: { write: (chunk) => { stderr.push(chunk); } },
      runQualification: async () => ({ status: "incomplete" })
    });

    expect(code).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("")).toContain("FAIL transport-conformance: conformance.incomplete");
  });
});
