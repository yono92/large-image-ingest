interface Trial {
  trialId: string; participantId: string; participantKind: "external-developer" | "maintainer" | "automation";
  firstTime: boolean; libraryVersion: string; journey: "minimal-upload" | "verified-workflow";
  environment: "node" | "browser"; assistance: "none" | "human"; startedAt: string; finishedAt: string | null;
  outcome: "success" | "blocked" | "abandoned"; storedVerified: boolean; evidencePersisted: boolean; blockers: string[];
}
interface Project {
  projectId: string; observedAt: string; libraryVersion: string; kind: "external" | "internal" | "example" | "test";
  status: "evaluating" | "active" | "discontinued"; evidenceKind: "self-reported" | "maintainer-reviewed"; evidenceRef: string;
}
interface AdoptionObservations { schemaVersion: string; trials: Trial[]; projects: Project[] }
import { readFileSync, statSync } from "node:fs";

const SCHEMA = "large-image-ingest.adoption-observations.v1";
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const BLOCKERS = ["install", "documentation", "server", "storage", "verification", "recovery", "environment", "other"];
const TRIAL_KEYS = ["trialId", "participantId", "participantKind", "firstTime", "libraryVersion", "journey",
  "environment", "assistance", "startedAt", "finishedAt", "outcome", "storedVerified", "evidencePersisted", "blockers"];
const PROJECT_KEYS = ["projectId", "observedAt", "libraryVersion", "kind", "status", "evidenceKind", "evidenceRef"];

function invalid(): never { throw new Error("Invalid adoption observations; consult docs/adoption-validation.md."); }
function exact(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) invalid();
}
function text(value: unknown, pattern: RegExp): asserts value is string { if (typeof value !== "string" || !pattern.test(value)) invalid(); }
function choice(value: unknown, values: readonly string[]) { if (typeof value !== "string" || !values.includes(value)) invalid(); }
function date(value: unknown): asserts value is string {
  text(value, DATE);
  if (!Number.isFinite(Date.parse(value))) invalid();
  // Date.parse normalizes impossible calendar days; reject those rather than silently shifting a trial.
  const calendar = value.slice(0, 10);
  if (new Date(`${calendar}T00:00:00Z`).toISOString().slice(0, 10) !== calendar) invalid();
}
function validateObservations(input: unknown): AdoptionObservations {
  exact(input, ["schemaVersion", "trials", "projects"]);
  if (input.schemaVersion !== SCHEMA || !Array.isArray(input.trials) || !Array.isArray(input.projects) ||
    input.trials.length > 10000 || input.projects.length > 10000) invalid();
  const trialIds = new Set();
  const projectTimes = new Set();
  for (const trial of input.trials as unknown[]) {
    exact(trial, TRIAL_KEYS);
    text(trial.trialId, ID); text(trial.participantId, ID); text(trial.libraryVersion, VERSION);
    if (trialIds.has(trial.trialId)) invalid();
    trialIds.add(trial.trialId);
    choice(trial.participantKind, ["external-developer", "maintainer", "automation"]);
    choice(trial.journey, ["minimal-upload", "verified-workflow"]);
    choice(trial.environment, ["node", "browser"]);
    choice(trial.assistance, ["none", "human"]);
    choice(trial.outcome, ["success", "blocked", "abandoned"]);
    for (const key of ["firstTime", "storedVerified", "evidencePersisted"]) if (typeof trial[key] !== "boolean") invalid();
    date(trial.startedAt);
    if (trial.finishedAt !== null) {
      date(trial.finishedAt);
      if (Date.parse(trial.finishedAt!) < Date.parse(trial.startedAt)) invalid();
    }
    if (!Array.isArray(trial.blockers) || trial.blockers.length > BLOCKERS.length ||
      new Set(trial.blockers).size !== trial.blockers.length) invalid();
    trial.blockers.forEach((value) => choice(value, BLOCKERS));
    if (trial.evidencePersisted && (!trial.storedVerified || trial.journey !== "verified-workflow")) invalid();
    if (trial.outcome === "success" && (trial.finishedAt === null || !trial.storedVerified ||
      (trial.journey === "verified-workflow" && !trial.evidencePersisted))) invalid();
  }
  for (const project of input.projects as unknown[]) {
    exact(project, PROJECT_KEYS);
    text(project.projectId, ID); text(project.evidenceRef, ID); text(project.libraryVersion, VERSION);
    date(project.observedAt);
    choice(project.kind, ["external", "internal", "example", "test"]);
    choice(project.status, ["evaluating", "active", "discontinued"]);
    choice(project.evidenceKind, ["self-reported", "maintainer-reviewed"]);
    const key = `${project.projectId}:${Date.parse(project.observedAt)}`;
    if (projectTimes.has(key)) invalid();
    projectTimes.add(key);
  }
  return input as unknown as AdoptionObservations;
}

function journeySummary(trials: Trial[]) {
  const successful = trials.filter((trial) => trial.outcome === "success");
  const minutes = successful.map((trial) => (Date.parse(trial.finishedAt!) - Date.parse(trial.startedAt)) / 60000).sort((a: number, b: number) => a - b);
  const middle = Math.floor(minutes.length / 2);
  const reportedBlockers = Object.fromEntries(BLOCKERS.map(code => [code, trials.filter((trial) => trial.blockers.includes(code)).length]));
  return { trials: trials.length, successes: successful.length,
    blocked: trials.filter((trial) => trial.outcome === "blocked").length,
    abandoned: trials.filter((trial) => trial.outcome === "abandoned").length,
    assisted: trials.filter((trial) => trial.assistance === "human").length,
    successRate: trials.length ? successful.length / trials.length : null,
    medianSuccessMinutes: minutes.length ? (minutes.length % 2 ? minutes[middle]! : (minutes[middle - 1]! + minutes[middle]!) / 2) : null,
    reportedBlockers };
}

function summarizeObservations(input: unknown) {
  const observations = validateObservations(input);
  const firstTrials = new Map<string, Trial>();
  const ordered = [...observations.trials].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.trialId.localeCompare(b.trialId));
  for (const trial of ordered) {
    if (trial.participantKind !== "external-developer" || !trial.firstTime) continue;
    const key = `${trial.participantId}:${trial.journey}`;
    if (!firstTrials.has(key)) firstTrials.set(key, trial);
  }
  const external = [...firstTrials.values()];
  const latest = new Map<string, Project>();
  for (const project of observations.projects) {
    const previous = latest.get(project.projectId);
    if (!previous || Date.parse(project.observedAt) > Date.parse(previous.observedAt)) latest.set(project.projectId, project);
  }
  const projects = [...latest.values()].filter(project => ["external", "internal"].includes(project.kind));
  const active = projects.filter(project => project.status === "active");
  return { schemaVersion: "large-image-ingest.adoption-summary.v1", actualAdoption: "unknown",
    observationStatus: observations.trials.some((trial) => trial.participantKind === "external-developer") ||
      projects.some(project => project.kind === "external") ? "external-observations-collected" : "no-external-observations",
    externalFirstTime: {
      minimalUpload: journeySummary(external.filter(trial => trial.journey === "minimal-upload")),
      verifiedWorkflow: journeySummary(external.filter(trial => trial.journey === "verified-workflow"))
    },
    otherTrials: { maintainer: observations.trials.filter((trial) => trial.participantKind === "maintainer").length,
      automation: observations.trials.filter((trial) => trial.participantKind === "automation").length },
    externalReturningTrials: observations.trials.filter((trial) => trial.participantKind === "external-developer" && !trial.firstTime).length,
    knownProjects: { observed: projects.length, active: active.length,
      evaluating: projects.filter(project => project.status === "evaluating").length,
      discontinued: projects.filter(project => project.status === "discontinued").length,
      activeSelfReported: active.filter(project => project.evidenceKind === "self-reported").length,
      activeReviewed: active.filter(project => project.evidenceKind === "maintainer-reviewed").length },
    limitations: ["Counts describe supplied observations, not the whole user population.",
      "Downloads, SDK examples and automated tests are not confirmed adoption projects."] };
}

if (process.argv[1] === __filename) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== "--input") throw new Error("Usage: npm run adoption:report -- --input <local-json>");
    if (statSync(args[1]!).size > 2 * 1024 * 1024) invalid();
    const report = summarizeObservations(JSON.parse(readFileSync(args[1]!, "utf8")));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error && error.message.startsWith("Usage:") ? error.message : "Could not read valid adoption observations; consult docs/adoption-validation.md."}\n`);
    process.exitCode = 1;
  }
}

export { validateObservations, summarizeObservations };
