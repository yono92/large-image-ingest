import { createRequire } from "node:module";
import { expect, test } from "vitest";

const require = createRequire(import.meta.url);
const load = () => require("../scripts/adoption-report.cjs");
const blank = () => ({ schemaVersion: "large-image-ingest.adoption-observations.v1", trials: [], projects: [] });
const trial = (changes = {}) => ({ trialId: "trial-001", participantId: "participant-001",
  participantKind: "external-developer", firstTime: true, libraryVersion: "1.8.0",
  journey: "minimal-upload", environment: "node", assistance: "none",
  startedAt: "2026-10-07T00:00:00Z", finishedAt: "2026-10-07T00:10:00Z",
  outcome: "success", storedVerified: true, evidencePersisted: false, blockers: [], ...changes });
const project = (changes = {}) => ({ projectId: "project-001", observedAt: "2026-10-07T00:00:00Z",
  libraryVersion: "1.8.0", kind: "external", status: "active", evidenceKind: "self-reported",
  evidenceRef: "review-001", ...changes });

test("empty observations mean unknown actual adoption", () => {
  const report = load().summarizeObservations(blank());
  expect(report.actualAdoption).toBe("unknown");
  expect(report.externalFirstTime.minimalUpload.trials).toBe(0);
  expect(report.knownProjects.observed).toBe(0);
  expect(report.externalFirstTime.minimalUpload.successRate).toBeNull();
});

test("external outcomes retain failures and assistance but exclude maintainers and automation", () => {
  const input = { ...blank(), trials: [trial(),
    trial({ trialId: "trial-002", participantId: "participant-002", outcome: "blocked", storedVerified: false,
      finishedAt: null, assistance: "human", blockers: ["server"] }),
    trial({ trialId: "trial-003", participantId: "participant-003", outcome: "abandoned", storedVerified: false }),
    trial({ trialId: "trial-004", participantKind: "maintainer" }),
    trial({ trialId: "trial-005", participantKind: "automation" }),
    trial({ trialId: "trial-006", startedAt: "2026-10-08T00:00:00Z", finishedAt: "2026-10-08T00:05:00Z" })] };
  const result = load().summarizeObservations(input);
  expect(result.externalFirstTime.minimalUpload).toMatchObject({ trials: 3, successes: 1, blocked: 1, abandoned: 1, assisted: 1 });
  expect(result.externalFirstTime.minimalUpload.successRate).toBeCloseTo(1 / 3);
  expect(result.otherTrials).toEqual({ maintainer: 1, automation: 1 });
  expect(result.externalFirstTime.minimalUpload.medianSuccessMinutes).toBe(10);
  expect(JSON.stringify(result)).not.toContain("participant-001");
});

test("latest observations determine distinct active projects and exclude examples", () => {
  const result = load().summarizeObservations({ ...blank(), projects: [project(),
    project({ observedAt: "2026-10-08T00:00:00Z", status: "discontinued" }),
    project({ projectId: "project-002", evidenceKind: "maintainer-reviewed" }),
    project({ projectId: "project-003", kind: "example" }),
    project({ projectId: "project-004", status: "evaluating" })] });
  expect(result.knownProjects).toEqual({ observed: 3, active: 1, evaluating: 1, discontinued: 1,
    activeSelfReported: 0, activeReviewed: 1 });
  expect(result.actualAdoption).toBe("unknown");
  expect(result.observationStatus).toBe("external-observations-collected");
  expect(result.externalFirstTime.minimalUpload.successRate).toBeNull();
});

test.each([
  () => ({ ...blank(), secret: "anything" }),
  () => ({ ...blank(), trials: [trial(), trial()] }),
  () => ({ ...blank(), trials: [trial({ finishedAt: "2026-10-06T00:00:00Z" })] }),
  () => ({ ...blank(), trials: [trial({ storedVerified: false })] }),
  () => ({ ...blank(), trials: [trial({ journey: "verified-workflow", evidencePersisted: false })] }),
  () => ({ ...blank(), trials: [trial({ participantId: "name@example.com" })] }),
  () => ({ ...blank(), trials: [trial({ startedAt: "2026-10-07T00:00:00" })] }),
  () => ({ ...blank(), projects: [project({ evidenceRef: "../private" })] }),
  () => ({ ...blank(), projects: [project(), project()] }),
  () => ({ ...blank(), trials: [trial({ blockers: ["customer-data"] })] })
])("rejects invalid, unsafe or contradictory observations", make => {
  expect(() => load().summarizeObservations(make())).toThrow("Invalid adoption observations");
});
