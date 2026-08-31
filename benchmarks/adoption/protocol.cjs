const { createHash } = require("node:crypto");

const PROTOCOL_ID = "large-image-ingest.adoption-evidence-protocol.v1";
const REPORT_SCHEMA = "large-image-ingest.adoption-evidence-report.v1";
const TIMING_TRIALS = 10;
const CANDIDATE_IDS = Object.freeze(["sdk-s3", "raw-tus", "raw-s3"]);

const JOURNEY = Object.freeze([
  "validate-source", "whole-file-sha256", "versioned-manifest", "chunk-plan",
  "resumable-transfer", "durable-recovery", "completion", "stored-original-verification"
]);

const RESPONSIBILITIES = Object.freeze([
  "validation", "checksum", "manifest", "chunking", "retry", "sourceIdentity",
  "recoveryPersistence", "reconciliation", "progress", "completion",
  "storedVerification", "safeDiagnostics", "cleanup", "brokerIntegration"
]);

const ELIGIBILITY_RULES = Object.freeze([
  "same-source-bytes", "same-validation", "whole-file-sha256", "versioned-manifest",
  "durable-resume", "authoritative-completion", "independent-stored-verification"
]);

const OUTCOME_FIELDS = Object.freeze([
  "status", "detected", "preMutationRejected", "recoveryAction",
  "acknowledgedBytesRetransmitted", "completionCallCount", "finalApplicationStatus",
  "storedVerification", "remoteMutationCountBeforeAuthority", "safeOutput",
  "invariantSatisfied", "limitationCodes"
]);

const AGGREGATION_POLICY = Object.freeze({
  weighting: "unweighted-candidate-scenario",
  unsupported: "excluded-with-explicit-limitation",
  scenarioPass: "all-required-trials-safe"
});

const SAFE_OUTPUT_POLICY = Object.freeze([
  "credentials", "secret-urls", "object-keys", "filesystem-roots", "customer-metadata",
  "full-recovery-records", "full-manifests", "raw-provider-receipts"
]);

const CLAIM_POLICY = Object.freeze([
  "report-field-required", "candidate-boundary-required", "principal-limitation-required",
  "no-field-frequency-extrapolation"
]);

const SCENARIOS = Object.freeze([
  scenario("failure-before-acknowledgement", true, "retry-unacknowledged"),
  scenario("failure-after-acknowledgement", true, "reconcile-before-retry"),
  scenario("lost-acknowledgement-response", true, "reconcile-before-retry"),
  scenario("metadata-equal-source-mismatch", false, "reject-before-remote-mutation"),
  scenario("stale-recovery-state", false, "reject-before-remote-mutation"),
  scenario("remote-behind-state", false, "reject-before-remote-mutation"),
  scenario("remote-ahead-state", false, "adopt-authoritative-receipt"),
  scenario("expired-session", false, "reject-before-remote-mutation"),
  scenario("missing-receipt", false, "reject-before-remote-mutation"),
  scenario("duplicate-receipt", false, "reject-before-remote-mutation"),
  scenario("lost-completion-response", true, "reconcile-completion"),
  scenario("stored-byte-corruption", false, "detect-verification-failure"),
  scenario("cleanup-failure-after-completion", false, "complete-with-warning"),
  scenario("sensitive-provider-error", false, "redact-provider-output")
]);

const COUNTING_POLICY = Object.freeze({
  id: "physical-non-comment-source-lines.v1",
  includes: ["imports", "runtime-code", "type-declarations", "configuration", "error-handling"],
  excludes: ["blank-lines", "comment-only-lines", "generated-code", "fixtures", "shared-harness", "reports"]
});

const PROHIBITED_CLAIMS = [
  /failure probability/i, /incident[- ]rate/i, /availability/i,
  /universal reliability/i, /장애\s*확률/u, /사고율/u, /가용성/u
];

function scenario(id, timingSensitive, invariant) {
  return Object.freeze({ id, timingSensitive, trials: timingSensitive ? TIMING_TRIALS : 1, invariant });
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function protocolSnapshot() {
  return {
    id: PROTOCOL_ID,
    journey: JOURNEY,
    eligibilityRules: ELIGIBILITY_RULES,
    responsibilities: RESPONSIBILITIES,
    outcomeFields: OUTCOME_FIELDS,
    scenarios: SCENARIOS,
    countingPolicy: COUNTING_POLICY,
    aggregationPolicy: AGGREGATION_POLICY,
    safeOutputPolicy: SAFE_OUTPUT_POLICY,
    claimPolicy: CLAIM_POLICY
  };
}

function protocolDigest() {
  return sha256(canonicalize(protocolSnapshot()));
}

function countNonCommentSourceLines(source) {
  let block = false;
  let quote = "";
  let escaped = false;
  let count = 0;
  for (const line of source.split(/\r?\n/u)) {
    let code = "";
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (block) {
        if (char === "*" && next === "/") { block = false; index += 1; }
        continue;
      }
      if (quote) {
        code += char;
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = "";
        continue;
      }
      if (char === '"' || char === "'" || char === "`") { quote = char; code += char; continue; }
      if (char === "/" && next === "*") { block = true; index += 1; continue; }
      if (char === "/" && next === "/") break;
      code += char;
    }
    if (code.trim()) count += 1;
  }
  return count;
}

function inspectSafeValue(value) {
  const serialized = JSON.stringify(value);
  const forbidden = [
    /customer-secret/i, /[?&](?:token|signature|credential)=/i, /X-Amz-/i,
    /s3:\/\//i, /\/Users\//, /recoveryRecord/i, /rawReceipt/i
  ];
  return { safe: !forbidden.some((pattern) => pattern.test(serialized)), forbiddenPatternCount: forbidden.filter((pattern) => pattern.test(serialized)).length };
}

function computeCoverage(candidates) {
  const pairs = candidates.flatMap((candidate) => candidate.scenarios.map((entry) => entry));
  const included = pairs.filter((entry) => entry.status !== "unsupported");
  const numerator = included.filter((entry) => entry.status === "safe_pass").length;
  const denominator = included.length;
  return {
    numerator,
    denominator,
    excludedScenarioCount: pairs.length - included.length,
    weighting: "unweighted-candidate-scenario",
    trialComposition: "four-timing-sensitive-scenarios-ten-trials-and-ten-deterministic-scenarios-one-trial-per-candidate",
    percentage: denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(2))
  };
}

function computeInputsDigest({ candidateRevisions }) {
  return sha256(canonicalize({ protocolDigest: protocolDigest(), candidateRevisions }));
}

function computeImplementationAggregates(candidates) {
  const sdk = candidates.find((candidate) => candidate.id === "sdk-s3");
  if (!sdk) return { implementationLineChanges: [], responsibilityReductions: [], configurationDecisionReductions: [] };
  const generics = candidates.filter((candidate) => candidate.id !== "sdk-s3");
  const comparison = (candidate, metric, fields, weighting) => {
    const sdkValue = sdk.implementation[metric];
    const genericValue = candidate.implementation[metric];
    const removed = genericValue - sdkValue;
    return {
      candidateId: "sdk-s3",
      versusCandidateId: candidate.id,
      [fields.numerator]: removed,
      [fields.denominator]: genericValue,
      ...(fields.metric ? { metric } : {}),
      percentage: Number(((removed / genericValue) * 100).toFixed(2)),
      weighting,
      measurementMode: "static-frozen-candidate-revision"
    };
  };
  return {
    implementationLineChanges: generics.map((candidate) => comparison(
      candidate,
      "applicationNonCommentSourceLines",
      { numerator: "numeratorLinesRemoved", denominator: "denominatorGenericLines" },
      "physical-non-comment-source-lines"
    )),
    responsibilityReductions: generics.map((candidate) => comparison(
      candidate,
      "applicationResponsibilityCount",
      { numerator: "numeratorRemoved", denominator: "denominatorGeneric", metric: true },
      "unweighted-count"
    )),
    configurationDecisionReductions: generics.map((candidate) => comparison(
      candidate,
      "configurationDecisionCount",
      { numerator: "numeratorRemoved", denominator: "denominatorGeneric", metric: true },
      "unweighted-count"
    ))
  };
}

function validateReport(report, options = {}) {
  const errors = [];
  if (report?.schemaVersion !== REPORT_SCHEMA) errors.push("report.schema_invalid");
  if (report?.protocol?.id !== PROTOCOL_ID || report?.protocol?.digest?.value !== protocolDigest()) errors.push("report.protocol_mismatch");
  if (!Array.isArray(report?.candidates) || report.candidates.length !== 3) errors.push("report.candidates_incomplete");
  const candidateIds = (report?.candidates ?? []).map((candidate) => candidate.id);
  if (new Set(candidateIds).size !== candidateIds.length || canonicalize([...candidateIds].sort()) !== canonicalize([...CANDIDATE_IDS].sort())) errors.push("report.candidate_ids_invalid");
  for (const candidate of report?.candidates ?? []) {
    if (!/^[a-f0-9]{64}$/u.test(candidate?.revision?.value ?? "")) errors.push(`candidate.revision_invalid:${candidate?.id}`);
    const byId = new Map((candidate.scenarios ?? []).map((entry) => [entry.scenarioId, entry]));
    if ((candidate.scenarios ?? []).length !== SCENARIOS.length || byId.size !== SCENARIOS.length) errors.push(`scenario.catalog_invalid:${candidate.id}`);
    for (const expected of SCENARIOS) {
      const actual = byId.get(expected.id);
      if (!actual) { errors.push(`scenario.missing:${candidate.id}:${expected.id}`); continue; }
      if (actual.status === "unsupported") {
        if ((actual.trials ?? []).length !== 0) errors.push(`scenario.unsupported_has_trials:${candidate.id}:${expected.id}`);
        if (!Array.isArray(actual.limitationCodes) || actual.limitationCodes.length === 0) errors.push(`scenario.unsupported_unexplained:${candidate.id}:${expected.id}`);
        continue;
      }
      if (actual.trials?.length !== expected.trials) errors.push(`scenario.trial_count:${candidate.id}:${expected.id}`);
      for (const trial of actual.trials ?? []) {
        if (OUTCOME_FIELDS.some((key) => !(key in trial))) errors.push(`trial.fields_missing:${candidate.id}:${expected.id}`);
        if (!inspectSafeValue(trial).safe) errors.push(`trial.unsafe:${candidate.id}:${expected.id}`);
        const trialStatus = trial.invariantSatisfied && trial.safeOutput === "safe" ? "safe_pass" : "failed";
        if (trial.status !== trialStatus) errors.push(`trial.status_mismatch:${candidate.id}:${expected.id}`);
      }
      const derived = actual.trials?.every((trial) => trial.status === "safe_pass" && trial.invariantSatisfied && trial.safeOutput === "safe") ? "safe_pass" : "failed";
      if (actual.status !== derived) errors.push(`scenario.status_mismatch:${candidate.id}:${expected.id}`);
    }
  }
  const coverage = computeCoverage(report?.candidates ?? []);
  if (canonicalize(coverage) !== canonicalize(report?.aggregates?.observedSafeScenarioCoverage)) errors.push("aggregate.coverage_mismatch");
  const implementation = computeImplementationAggregates(report?.candidates ?? []);
  for (const [key, value] of Object.entries(implementation)) {
    if (canonicalize(value) !== canonicalize(report?.aggregates?.[key])) errors.push(`aggregate.${key}_mismatch`);
  }
  for (const claim of report?.claims ?? []) {
    if (PROHIBITED_CLAIMS.some((pattern) => pattern.test(claim.text ?? ""))) errors.push(`claim.prohibited:${claim.id}`);
    if (!claim.reportField || !claim.boundary || !claim.principalLimitation) errors.push(`claim.unbounded:${claim.id}`);
    else if (resolveReportField(report, claim.reportField) === undefined) errors.push(`claim.field_missing:${claim.id}`);
  }
  if (!inspectSafeValue(report).safe) errors.push("report.unsafe");
  const revisions = (report?.candidates ?? []).map((candidate) => ({ id: candidate.id, value: candidate.revision?.value }));
  const currentDigest = computeInputsDigest({ candidateRevisions: revisions });
  const expectedDigest = options.currentInputsDigest ?? currentDigest;
  const stale = report?.inputsDigest?.value !== expectedDigest;
  if (report?.staleness?.status === "current" && stale) errors.push("report.stale_label_invalid");
  return { ok: errors.length === 0, errors, currentInputsDigest: currentDigest, stale };
}

function resolveReportField(report, field) {
  const segments = field.replace(/\[(\d+)\]/gu, ".$1").split(".");
  let value = report;
  for (const segment of segments) {
    if (!segment || value === null || value === undefined || !Object.prototype.hasOwnProperty.call(value, segment)) return undefined;
    value = value[segment];
  }
  return value;
}

module.exports = {
  AGGREGATION_POLICY, CANDIDATE_IDS, CLAIM_POLICY, COUNTING_POLICY, ELIGIBILITY_RULES, JOURNEY,
  OUTCOME_FIELDS, PROHIBITED_CLAIMS, PROTOCOL_ID, REPORT_SCHEMA, RESPONSIBILITIES,
  SAFE_OUTPUT_POLICY, SCENARIOS, TIMING_TRIALS, canonicalize, computeCoverage,
  computeImplementationAggregates, computeInputsDigest, countNonCommentSourceLines, inspectSafeValue,
  protocolDigest, protocolSnapshot, sha256, validateReport
};
