#!/usr/bin/env node

const { access } = require("node:fs/promises");

const targetDefinitions = [
  {
    kind: "tus",
    requiredEnvironment: ["LII_INTEGRATION_TUS_ENDPOINT"]
  },
  {
    kind: "s3-compatible",
    requiredEnvironment: ["LII_INTEGRATION_S3_BROKER_URL"]
  },
  {
    kind: "nas",
    requiredEnvironment: [
      "LII_INTEGRATION_NAS_STAGING_ROOT",
      "LII_INTEGRATION_NAS_TARGET_ROOT"
    ]
  }
];

function getIntegrationTargets(env = process.env) {
  return targetDefinitions.map((target) => {
    const missing = target.requiredEnvironment.filter((name) => !env[name]);
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
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const targets = getIntegrationTargets(env);
  let failed = false;

  for (const target of targets) {
    if (!target.enabled) {
      stdout.write(`SKIP ${target.kind}: missing ${target.missing.join(", ")}\n`);
      continue;
    }

    try {
      if (target.kind === "tus") {
        await checkTusTarget(fetchImpl, env);
      } else if (target.kind === "s3-compatible") {
        await checkS3BrokerTarget(fetchImpl, env);
      } else if (target.kind === "nas") {
        await checkNasTarget(env);
      }

      stdout.write(`PASS ${target.kind}: integration preflight completed\n`);
    } catch (error) {
      failed = true;
      stderr.write(`FAIL ${target.kind}: ${toSafeMessage(error)}\n`);
    }
  }

  return failed ? 1 : 0;
}

async function checkTusTarget(fetchImpl, env) {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is unavailable in this runtime.");
  }

  const response = await fetchImpl(env.LII_INTEGRATION_TUS_ENDPOINT, {
    method: "OPTIONS"
  });

  if (!response || typeof response.ok !== "boolean" || !response.ok) {
    throw new Error("endpoint preflight failed.");
  }
}

async function checkS3BrokerTarget(fetchImpl, env) {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is unavailable in this runtime.");
  }

  const response = await fetchImpl(env.LII_INTEGRATION_S3_BROKER_URL, {
    method: "GET"
  });

  if (!response || typeof response.ok !== "boolean" || !response.ok) {
    throw new Error("broker preflight failed.");
  }
}

async function checkNasTarget(env) {
  await access(env.LII_INTEGRATION_NAS_STAGING_ROOT);
  await access(env.LII_INTEGRATION_NAS_TARGET_ROOT);
}

function toSafeMessage(error) {
  const message = error instanceof Error ? error.message : "integration preflight failed.";
  if (/https?:\/\//i.test(message) || /credential|authorization|presigned|secret/i.test(message)) {
    return "details redacted.";
  }

  return message;
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
