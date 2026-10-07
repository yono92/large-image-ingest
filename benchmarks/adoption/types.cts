import type { SourceFixture, FixtureChunk, ReferenceTarget } from "./reference-target.cjs";
import type { AdoptionSdk } from "./candidates/sdk-s3.cjs";
export interface CandidateController {
  start(source: SourceFixture): Promise<unknown>;
  resume(source: SourceFixture): Promise<unknown>;
  verify(source: SourceFixture): Promise<boolean>;
  tamperRecord(kind: string): Promise<void>;
  setCleanupFailure(value: boolean): void;
  safeOutput(): { code: string }[];
  clearSafeOutput(): void;
  chunks(source: SourceFixture): FixtureChunk[];
}
export interface CandidateModule {
  descriptor: { version: string; transportStyle: string; dependencies: { id: string; version: string }[];
    responsibilities: Record<string, string>; publicBoundaries: string[]; configurationDecisions: string[] };
  createController(context: { sdk: AdoptionSdk; target: ReferenceTarget }): CandidateController;
}
export interface Trial {
  status: string; detected: boolean; preMutationRejected: boolean; recoveryAction: string;
  acknowledgedBytesRetransmitted: number; finalApplicationStatus: string; storedVerification: string;
  remoteMutationCountBeforeAuthority: number; safeOutput: string; invariantSatisfied: boolean;
  limitationCodes: string[];
}
export interface ScenarioResult { scenarioId: string; status: string; trials: Trial[]; limitationCodes?: string[] }
export interface CandidateEvidence {
  id: string;
  revision: { value: string };
  implementation: { applicationNonCommentSourceLines: number; applicationResponsibilityCount: number; configurationDecisionCount: number };
  scenarios: ScenarioResult[];
}
export interface EvidenceReport {
  schemaVersion: string;
  protocol: { id: string; digest: { value: string } };
  candidates: CandidateEvidence[];
  aggregates: Record<string, unknown>;
  claims: { id: string; text: string; reportField: string; boundary: string; principalLimitation: string }[];
  inputsDigest: { value: string };
  staleness: { status: string };
}
