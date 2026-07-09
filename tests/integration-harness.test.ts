import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

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
    fetch?: typeof fetch;
  }): Promise<number>;
};

describe("integration harness", () => {
  it("skips every target when no opt-in environment is configured", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runIntegrationHarness({
      env: {},
      stdout: { write: (chunk) => { stdout.push(chunk); } },
      stderr: { write: (chunk) => { stderr.push(chunk); } },
      fetch: async () => {
        throw new Error("fetch should not be called for skipped targets.");
      }
    });

    expect(code).toBe(0);
    expect(stdout.join("")).toContain("SKIP tus");
    expect(stdout.join("")).toContain("SKIP s3-compatible");
    expect(stdout.join("")).toContain("SKIP nas");
    expect(stderr).toEqual([]);
  });

  it("requires complete per-target configuration before enabling a target", () => {
    const targets = getIntegrationTargets({
      LII_INTEGRATION_NAS_STAGING_ROOT: "/tmp/staging"
    });

    expect(targets.find((target) => target.kind === "nas")).toMatchObject({
      enabled: false,
      missing: ["LII_INTEGRATION_NAS_TARGET_ROOT"]
    });
  });

  it("does not print configured sensitive endpoint values in failure output", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runIntegrationHarness({
      env: {
        LII_INTEGRATION_TUS_ENDPOINT: "https://secret.example/files"
      },
      stdout: { write: (chunk) => { stdout.push(chunk); } },
      stderr: { write: (chunk) => { stderr.push(chunk); } },
      fetch: async () => ({
        ok: false
      }) as Response
    });

    expect(code).toBe(1);
    expect(stderr.join("")).toContain("FAIL tus");
    expect(stderr.join("")).not.toContain("https://secret.example");
    expect(stdout.join("")).not.toContain("https://secret.example");
  });
});
