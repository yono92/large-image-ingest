#!/usr/bin/env node

const { runRealTarget } = require("./run-conformance.cjs");

const targetDefinitions = [
  {
    kind: "transport-conformance",
    requiredEnvironment: ["LII_CONFORMANCE_OPT_IN", "LII_CONFORMANCE_DRIVER_MODULE"]
  }
];

function getIntegrationTargets(env = process.env) {
  return targetDefinitions.map((target) => {
    const missing = target.requiredEnvironment.filter((name) => (
      name === "LII_CONFORMANCE_OPT_IN" ? env[name] !== "1" : !env[name]
    ));
    return {
      kind: target.kind,
      enabled: missing.length === 0,
      requiredEnvironment: [...target.requiredEnvironment],
      missing
    };
  });
}

async function runIntegrationHarness(options = {}) {
  const env = options.env ?? process.env;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const runQualification = options.runQualification ?? runRealTarget;
  const targets = getIntegrationTargets(env);
  let failed = false;

  for (const target of targets) {
    if (!target.enabled) {
      stdout.write(`SKIP ${target.kind}: missing ${target.missing.join(", ")}\n`);
      continue;
    }

    try {
      const suite = await runQualification({ repeat: 1, realTarget: true }, env);
      if (!suite || suite.status !== "conformant") {
        failed = true;
        stderr.write(`FAIL ${target.kind}: conformance.${suite?.status ?? "execution_failed"}\n`);
        continue;
      }
      stdout.write(`PASS ${target.kind}: catalog completed\n`);
    } catch (error) {
      failed = true;
      stderr.write(`FAIL ${target.kind}: ${toSafeMessage(error)}\n`);
    }
  }

  return failed ? 1 : 0;
}

function toSafeMessage(error) {
  if (
    error &&
    typeof error === "object" &&
    typeof error.code === "string" &&
    /^conformance\.[a-z0-9._-]+$/.test(error.code)
  ) {
    return error.code;
  }
  return "conformance.execution_failed";
}

if (require.main === module) {
  runIntegrationHarness().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`FAIL integration-harness: ${toSafeMessage(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  getIntegrationTargets,
  runIntegrationHarness
};
