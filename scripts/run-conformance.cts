import { createRequire } from "node:module";
const runtimeRequire = createRequire(__filename);
import type { ConformanceSdk } from "./conformance/representative-common.cjs";
import type { TransportConformanceReportV1, TransportConformanceTarget } from "../src/conformance.js";
interface Suite { status: string; repeatCount: number; runs: { iteration: number; reports: TransportConformanceReportV1[] }[] }
interface RunnerOptions { repeat: number; output?: string; realTarget: boolean }
interface DriverModule { createTarget?: (context: { libraryVersion: string }) => TransportConformanceTarget | Promise<TransportConformanceTarget>; target?: TransportConformanceTarget; default?: TransportConformanceTarget }
import { createRepresentativeS3Target } from "./conformance/representative-s3.cjs";
import { createRepresentativeTusTarget } from "./conformance/representative-tus.cjs";
import { createRepresentativeNasTarget } from "./conformance/representative-nas.cjs";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(__dirname, "..");

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const suite = options.realTarget
    ? await runRealTarget(options, process.env)
    : await runRepresentativeSuite(options);

  if (options.output) {
    const outputPath = resolveOutput(options.output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(suite, null, 2)}\n`, "utf8");
  }

  printSummary(suite, options.output);
  if (
    suite.status === "non_conformant" ||
    (suite.status === "incomplete" && suite.runs.length > 0)
  ) {
    process.exitCode = 1;
  }
}

async function runRepresentativeSuite(options: RunnerOptions) {
  const sdk = loadBuiltSdk();
  const createTargets = () => [
    createRepresentativeS3Target(sdk),
    createRepresentativeTusTarget(sdk),
    createRepresentativeNasTarget(sdk)
  ];
  const runs = [];
  let expectedSignature;

  for (let iteration = 1; iteration <= options.repeat; iteration += 1) {
    const reports = [];
    for (const target of createTargets()) {
      reports.push(await sdk.runTransportConformance(target, {
        reportId: `${target.profile.profileId}-run-${iteration}`
      }));
    }
    const signature = createStatusSignature(reports);
    if (expectedSignature === undefined) expectedSignature = signature;
    if (signature !== expectedSignature) {
      throw new SafeRunnerError("conformance.determinism_failed");
    }
    runs.push({ iteration, reports });
  }

  return {
    schemaVersion: "large-image-ingest.transport-conformance-suite.v1",
    recordedAt: new Date().toISOString(),
    libraryVersion: sdk.PACKAGE_VERSION,
    targetClass: "credential-free-representative",
    repeatCount: options.repeat,
    deterministic: true,
    status: deriveSuiteStatus(runs.flatMap(({ reports }) => reports)),
    runs
  };
}

async function runRealTarget(options: RunnerOptions, env: NodeJS.ProcessEnv, dependencies: { sdk?: Pick<ConformanceSdk, "PACKAGE_VERSION" | "runTransportConformance">; importModule?: (path: string) => Promise<DriverModule> } = {}) {
  const optIn = env.LII_CONFORMANCE_OPT_IN === "1";
  const driverModule = env.LII_CONFORMANCE_DRIVER_MODULE;
  if (!optIn || !driverModule) {
    return {
      schemaVersion: "large-image-ingest.transport-conformance-suite.v1",
      recordedAt: new Date().toISOString(),
      libraryVersion: runtimeRequire("../package.json").version,
      targetClass: "real-deployment",
      repeatCount: 0,
      deterministic: false,
      status: "incomplete",
      limitationCodes: ["explicit-opt-in-and-driver-required"],
      runs: []
    };
  }

  const sdk = dependencies.sdk ?? loadBuiltSdk();
  let loaded: DriverModule;
  try {
    const modulePath = isAbsolute(driverModule) ? driverModule : resolve(ROOT, driverModule);
    const importModule = dependencies.importModule ?? ((path: string) => import(pathToFileURL(path).href));
    loaded = await importModule(modulePath);
  } catch {
    throw new SafeRunnerError("conformance.driver_load_failed");
  }

  let target;
  try {
    if (!loaded || (typeof loaded !== "object" && typeof loaded !== "function")) {
      throw new SafeRunnerError("conformance.driver_invalid");
    }
    target = typeof loaded.createTarget === "function"
      ? await loaded.createTarget({ libraryVersion: sdk.PACKAGE_VERSION })
      : loaded.target ?? loaded.default;
  } catch (error) {
    if (error instanceof SafeRunnerError) throw error;
    throw new SafeRunnerError("conformance.driver_create_failed");
  }
  if (!target || target.profile?.targetClass !== "real-deployment") {
    throw new SafeRunnerError("conformance.driver_invalid");
  }

  const report = await sdk.runTransportConformance(target, {
    reportId: `real-${target.profile.transportCategory}-run-1`
  });
  return {
    schemaVersion: "large-image-ingest.transport-conformance-suite.v1",
    recordedAt: new Date().toISOString(),
    libraryVersion: sdk.PACKAGE_VERSION,
    targetClass: "real-deployment",
    repeatCount: 1,
    deterministic: false,
    status: report.overallStatus,
    runs: [{ iteration: 1, reports: [report] }]
  };
}

function loadBuiltSdk(): ConformanceSdk {
  return {
    ...runtimeRequire("../dist/cjs/core.js"),
    ...runtimeRequire("../dist/cjs/conformance.js"),
    ...runtimeRequire("../dist/cjs/s3.js"),
    ...runtimeRequire("../dist/cjs/tus.js"),
    ...runtimeRequire("../dist/cjs/node.js"),
    ...runtimeRequire("../dist/cjs/package-version.js")
  };
}

function parseOptions(args: string[]) {
  const options: RunnerOptions = { repeat: 1, realTarget: false };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--repeat") {
      const repeat = Number(args[++index]);
      if (!Number.isSafeInteger(repeat) || repeat < 1 || repeat > 100) {
        throw new SafeRunnerError("conformance.repeat_invalid");
      }
      options.repeat = repeat;
    } else if (value === "--output") {
      const output = args[++index];
      if (output) options.output = output;
      if (!options.output) throw new SafeRunnerError("conformance.output_invalid");
    } else if (value === "--real-target") {
      options.realTarget = true;
    } else {
      throw new SafeRunnerError("conformance.option_invalid");
    }
  }
  return options;
}

function resolveOutput(value: string) {
  if (isAbsolute(value) || normalize(value).startsWith(`..${sep}`)) {
    throw new SafeRunnerError("conformance.output_invalid");
  }
  const outputPath = resolve(ROOT, value);
  if (!outputPath.startsWith(`${ROOT}${sep}`)) {
    throw new SafeRunnerError("conformance.output_invalid");
  }
  return outputPath;
}

function createStatusSignature(reports: TransportConformanceReportV1[]) {
  return JSON.stringify(reports.map((report) => ({
    category: report.target.transportCategory,
    overallStatus: report.overallStatus,
    issues: report.issues,
    results: report.results.map((result) => ({
      scenarioId: result.scenarioId,
      status: result.status,
      cleanupStatus: result.cleanupStatus,
      evidence: result.evidence,
      limitationCodes: result.limitationCodes
    }))
  })));
}

function deriveSuiteStatus(reports: TransportConformanceReportV1[]) {
  if (reports.some(({ overallStatus }) => overallStatus === "non_conformant")) return "non_conformant";
  if (reports.some(({ overallStatus }) => overallStatus === "incomplete")) return "incomplete";
  return "conformant";
}

function printSummary(suite: Suite, output?: string) {
  if (suite.runs.length === 0) {
    process.stdout.write("SKIP real-target: explicit opt-in and driver module are required\n");
    return;
  }
  const finalReports = suite.runs.at(-1)!.reports;
  for (const report of finalReports) {
    const counts = report.results.reduce((result, scenario) => {
      result[scenario.status] = (result[scenario.status] ?? 0) + 1;
      return result;
    }, {} as Record<string, number>);
    process.stdout.write(
      `${report.overallStatus === "conformant" ? "PASS" : "FAIL"} ${report.target.transportCategory}: ` +
      `${counts.passed ?? 0} passed, ${counts.unsupported ?? 0} unsupported, ` +
      `${counts.skipped ?? 0} skipped, ${counts.failed ?? 0} failed\n`
    );
  }
  process.stdout.write(`deterministic repeats: ${suite.repeatCount}\n`);
  if (output) process.stdout.write("result: written\n");
}

class SafeRunnerError extends Error {
  readonly code: string;
  constructor(code: string) {
    super("Transport conformance runner failed safely.");
    this.code = code;
  }
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    const code = error instanceof SafeRunnerError || (error instanceof Error && "code" in error && typeof error.code === "string" && error.code.startsWith("conformance."))
      ? error.code
      : "conformance.execution_failed";
    process.stderr.write(`FAIL conformance: ${code}\n`);
    process.exitCode = 1;
  });
}

export {
  SafeRunnerError,
  createStatusSignature,
  deriveSuiteStatus,
  parseOptions,
  runRealTarget,
  runRepresentativeSuite
};
