#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const {
  CANDIDATE_IDS, REPORT_SCHEMA, computeCoverage, computeImplementationAggregates,
  computeInputsDigest, countNonCommentSourceLines, protocolDigest, sha256, validateReport
} = require("./adoption/protocol.cjs");
const { runAllScenarios, runHappyPath } = require("./adoption/reference-harness.cjs");

const ROOT = path.resolve(__dirname, "..");
async function runEvidence(options = {}) {
  const sdk = options.sdk ?? loadBuiltSdk();
  const candidates = [];
  for (const id of CANDIDATE_IDS) {
    const sourcePath = path.join(ROOT, "benchmarks", "adoption", "candidates", `${id}.cjs`);
    const testPath = path.join(ROOT, "benchmarks", "adoption", "candidate-tests", `${id}.cjs`);
    delete require.cache[sourcePath];
    delete require.cache[testPath];
    const candidate = require(sourcePath);
    const verificationCases = require(testPath);
    const source = fs.readFileSync(sourcePath, "utf8");
    const testSource = fs.readFileSync(testPath, "utf8");
    const revision = sha256(`${path.relative(ROOT, sourcePath)}\0${source}\0${path.relative(ROOT, testPath)}\0${testSource}`);
    const happyPath = await runHappyPath(candidate, sdk);
    const scenarios = await runAllScenarios(candidate, sdk);
    const responsibilityValues = Object.values(candidate.descriptor.responsibilities);
    candidates.push({
      id,
      version: candidate.descriptor.version,
      transportStyle: candidate.descriptor.transportStyle,
      revision: { algorithm: "sha256", value: revision },
      artifacts: {
        application: [path.relative(ROOT, sourcePath)],
        candidateTests: [path.relative(ROOT, testPath)],
        sharedHarness: ["benchmarks/adoption/reference-harness.cjs", "benchmarks/adoption/reference-target.cjs"]
      },
      dependencies: candidate.descriptor.dependencies,
      responsibilityMatrix: candidate.descriptor.responsibilities,
      publicBoundaries: candidate.descriptor.publicBoundaries,
      configurationDecisions: candidate.descriptor.configurationDecisions,
      eligibility: { status: happyPath.status, storedVerification: happyPath.storedSha256Match ? "verified" : "failed", happyPath },
      implementation: {
        applicationNonCommentSourceLines: countNonCommentSourceLines(source),
        applicationFileCount: 1,
        testNonCommentSourceLines: countNonCommentSourceLines(testSource),
        testFileCount: 1,
        configurationDecisionCount: candidate.descriptor.configurationDecisions.length,
        publicBoundaryCount: candidate.descriptor.publicBoundaries.length,
        applicationResponsibilityCount: responsibilityValues.filter((owner) => owner === "application").length,
        dependencyResponsibilityCount: responsibilityValues.filter((owner) => owner === "dependency").length,
        candidateSpecificVerificationCaseCount: verificationCases.length
      },
      scenarios
    });
  }

  const revisions = candidates.map((candidate) => ({ id: candidate.id, value: candidate.revision.value }));
  const { implementationLineChanges, responsibilityReductions, configurationDecisionReductions } = computeImplementationAggregates(candidates);
  const report = {
    schemaVersion: REPORT_SCHEMA,
    recordedAt: options.recordedAt ?? "2026-08-31T00:00:00.000Z",
    protocol: { id: "large-image-ingest.adoption-evidence-protocol.v1", digest: { algorithm: "sha256", value: protocolDigest() } },
    environment: { nodeMajor: Number(process.versions.node.split(".")[0]), platform: process.platform, architecture: process.arch, target: "credential-free-in-memory-reference" },
    command: "npm run evidence:adoption",
    candidates,
    aggregates: {
      observedSafeScenarioCoverage: computeCoverage(candidates),
      implementationLineChanges,
      responsibilityReductions,
      configurationDecisionReductions
    },
    claims: implementationLineChanges.map((change) => ({
      id: `application-lines-${change.versusCandidateId}`,
      text: change.percentage >= 0
        ? `The SDK reference binding used ${change.percentage}% fewer application-owned non-comment source lines than the ${change.versusCandidateId} reference composition.`
        : `The SDK reference binding used ${Math.abs(change.percentage)}% more application-owned non-comment source lines than the ${change.versusCandidateId} reference composition.`,
      reportField: `aggregates.implementationLineChanges[${implementationLineChanges.indexOf(change)}]`,
      boundary: "Frozen TIFF ingest journey and repository reference candidates only.",
      principalLimitation: "Source lines and responsibility ownership measure maintenance surface, not production outcomes or engineering quality."
    })).concat(responsibilityReductions.map((reduction) => ({
      id: `application-responsibilities-${reduction.versusCandidateId}`,
      text: `The SDK reference binding required ${reduction.percentage}% fewer application-owned lifecycle responsibilities than the ${reduction.versusCandidateId} reference composition.`,
      reportField: `aggregates.responsibilityReductions[${responsibilityReductions.indexOf(reduction)}]`,
      boundary: "Fourteen frozen lifecycle responsibilities in the common ingest journey.",
      principalLimitation: "Responsibility count measures coordination surface and does not assign equal effort to every responsibility."
    })), configurationDecisionReductions.map((reduction) => ({
      id: `configuration-decisions-${reduction.versusCandidateId}`,
      text: `The SDK reference binding required ${reduction.percentage}% fewer explicit configuration decisions than the ${reduction.versusCandidateId} reference composition.`,
      reportField: `aggregates.configurationDecisionReductions[${configurationDecisionReductions.indexOf(reduction)}]`,
      boundary: "Frozen reference candidate configuration for the common ingest journey.",
      principalLimitation: "Configuration decisions differ in complexity and are counted without effort weighting."
    })), {
      id: "controlled-scenario-coverage",
      text: "The report records safe outcomes for the controlled candidate-scenario matrix.",
      reportField: "aggregates.observedSafeScenarioCoverage",
      boundary: "Fourteen credential-free injected scenarios across three frozen candidates.",
      principalLimitation: "Controlled scenario coverage does not estimate production behavior outside the stated matrix."
    }),
    limitations: [
      "The generic candidates are representative reference compositions, not measurements of every tus or object-storage client.",
      "The in-memory target makes lifecycle boundaries deterministic and does not model provider latency, policy, or service behavior.",
      "Application source lines and ownership counts are maintenance-surface indicators only.",
      "Developer elapsed time is intentionally omitted from this initial evidence set.",
      "The four timing-sensitive injections are repeated deterministically to prove result retention, not to estimate field frequency."
    ],
    inputsDigest: { algorithm: "sha256", value: computeInputsDigest({ candidateRevisions: revisions }) },
    staleness: { status: "current", causes: ["protocol", "candidate-revision", "journey", "counting-policy", "scenario-invariant"] }
  };
  const validation = validateReport(report);
  if (!validation.ok) throw new Error(`Adoption evidence report validation failed: ${validation.errors.join(", ")}`);
  return report;
}

function loadBuiltSdk() {
  const sdkPath = path.join(ROOT, "dist", "cjs", "index.js");
  if (!fs.existsSync(sdkPath)) throw new Error("Built SDK not found. Run npm run build first.");
  return require(sdkPath);
}

function parseOutput(argv) {
  const index = argv.indexOf("--output");
  return index >= 0 ? argv[index + 1] : "benchmarks/results/2026-08-adoption-evidence.json";
}

async function main() {
  const outputLabel = parseOutput(process.argv.slice(2));
  if (!outputLabel || path.isAbsolute(outputLabel) || outputLabel.split(path.sep).includes("..")) throw new Error("--output must be a repository-relative path.");
  const outputPath = path.resolve(ROOT, outputLabel);
  if (!outputPath.startsWith(`${ROOT}${path.sep}`)) throw new Error("--output must stay inside the repository.");
  const report = await runEvidence();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const coverage = report.aggregates.observedSafeScenarioCoverage;
  console.log(`Adoption evidence: ${report.candidates.length} eligible candidates, ${coverage.numerator}/${coverage.denominator} safe candidate-scenarios.`);
  console.log(`Report: ${path.relative(ROOT, outputPath)}`);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { CANDIDATE_IDS, runEvidence };
