import { describe, expect, it } from "vitest";
import { createIngestSession } from "../src/session.js";
import type { TransportSession, UploadTransport } from "../src/types.js";
import { fixtureManifest, fixtureRecorder, namedBlob } from "./provenance-fixtures.js";

describe("ingest provenance lifecycle", () => {
  it("represents completed, resumed, failed, canceled, unverified, and verification-failed outcomes", async () => {
    const manifest = await fixtureManifest();

    const completed = fixtureRecorder(manifest);
    completed.observeIngestEvent({ type: "started", manifest, uploadId: "upload-1" });
    completed.observeIngestEvent({ type: "completed", manifest, uploadId: "upload-1" });
    completed.recordVerification({ status: "verified", verifierCategory: "stored-original" });

    const resumed = fixtureRecorder(manifest);
    resumed.recordRecovery({
      recordSchemaVersion: "large-image-ingest.resume.v0.3",
      classification: "resumable",
      acknowledgedRangesReused: 2,
      retransmittedAcknowledgedBytes: 0
    });
    resumed.observeIngestEvent({ type: "resume:started", recordId: "secret-record", manifestId: manifest.id });
    resumed.observeIngestEvent({ type: "completed", manifest, uploadId: "secret-upload" });
    resumed.recordVerification({ status: "verified", verifierCategory: "stored-original" });

    const failed = fixtureRecorder(manifest);
    failed.observeIngestEvent({ type: "failed", manifestId: manifest.id, error: new Error("secret") });

    const canceled = fixtureRecorder(manifest);
    canceled.observeIngestEvent({ type: "upload:canceled", recordId: "secret-record" });

    const unverified = fixtureRecorder(manifest);
    unverified.observeIngestEvent({ type: "completed", manifest, uploadId: "secret-upload" });

    const verificationFailed = fixtureRecorder(manifest);
    verificationFailed.observeIngestEvent({ type: "completed", manifest, uploadId: "secret-upload" });
    verificationFailed.recordVerification({
      status: "failed",
      verifierCategory: "stored-original",
      issueCodes: ["verification.checksum_mismatch"]
    });

    const artifacts = await Promise.all([
      completed.seal(), resumed.seal(), failed.seal(), canceled.seal(), unverified.seal(),
      verificationFailed.seal()
    ]);
    expect(artifacts.map(({ terminalStatus }) => terminalStatus)).toEqual([
      "completed", "completed", "upload_failed", "canceled", "completed_unverified",
      "verification_failed"
    ]);
    expect(artifacts[1]?.recovery).toMatchObject({
      resumeCount: 1,
      acknowledgedRangesReused: 2,
      retransmittedAcknowledgedBytes: 0
    });
  });

  it("uses sequence rather than equal or regressing timestamps as ordering authority", async () => {
    const manifest = await fixtureManifest();
    const times = [
      "2026-08-31T00:00:02.000Z",
      "2026-08-31T00:00:02.000Z",
      "2026-08-31T00:00:01.000Z",
      "2026-08-31T00:00:00.000Z"
    ];
    let index = 0;
    const recorder = fixtureRecorder(manifest, {
      now: () => new Date(times[Math.min(index++, times.length - 1)] as string)
    });
    recorder.observeIngestEvent({ type: "started", manifest, uploadId: "upload-1" });
    recorder.observeIngestEvent({ type: "completed", manifest, uploadId: "upload-1" });
    recorder.recordVerification({ status: "verified", verifierCategory: "stored-original" });
    const artifact = await recorder.seal();

    expect(artifact.entries.map(({ sequence }) => sequence)).toEqual(
      artifact.entries.map((_, entryIndex) => entryIndex)
    );
    expect(artifact.entries.map(({ entryId }) => entryId)).toEqual(
      artifact.entries.map((_, entryIndex) => `entry-${entryIndex}`)
    );
    expect(new Set(artifact.entries.map(({ occurredAt }) => occurredAt)).size)
      .toBeLessThan(artifact.entries.length);
  });

  it("counts multiple resume cycles without retaining record identifiers", async () => {
    const manifest = await fixtureManifest();
    const recorder = fixtureRecorder(manifest);
    recorder.observeIngestEvent({ type: "resume:started", recordId: "secret-record-1", manifestId: manifest.id });
    recorder.observeIngestEvent({ type: "resume:started", recordId: "secret-record-2", manifestId: manifest.id });
    recorder.observeIngestEvent({ type: "completed", manifest, uploadId: "secret-upload" });
    const artifact = await recorder.seal();

    expect(artifact.recovery.resumeCount).toBe(2);
    expect(JSON.stringify(artifact)).not.toContain("secret-record");
    expect(JSON.stringify(artifact)).not.toContain("secret-upload");
  });

  it("retains policy history when validation policy changes across recovery", async () => {
    const manifest = await fixtureManifest();
    const recorder = fixtureRecorder(manifest);
    recorder.recordPolicyEvaluation({
      id: "inspection-strict",
      version: "2.0.0",
      result: "passed",
      occurredAt: "2026-08-31T00:00:02.000Z"
    });
    const artifact = await recorder.seal();

    expect(artifact.policy).toMatchObject({ id: "inspection-strict", version: "2.0.0" });
    expect(artifact.policy.history).toHaveLength(2);
  });

  it("retains multiple verification attempt categories while the final result remains authoritative", async () => {
    const manifest = await fixtureManifest();
    const recorder = fixtureRecorder(manifest);
    recorder.observeIngestEvent({ type: "completed", manifest, uploadId: "upload-1" });
    recorder.recordVerification({
      status: "failed",
      verifierCategory: "stored-original",
      issueCodes: ["verification.checksum_mismatch"]
    });
    recorder.recordVerification({ status: "verified", verifierCategory: "stored-original" });
    const artifact = await recorder.seal();

    expect(artifact.terminalStatus).toBe("completed");
    expect(artifact.entries.filter(({ type }) => type === "verification").map(({ code }) => code))
      .toEqual(["verification.failed", "verification.verified"]);
  });

  it("rejects verification evidence before transfer completion", async () => {
    const manifest = await fixtureManifest();
    const recorder = fixtureRecorder(manifest);
    expect(() => recorder.recordVerification({
      status: "verified",
      verifierCategory: "stored-original"
    })).toThrow();
  });

  it("leaves the existing session lifecycle unchanged when no recorder is configured", async () => {
    const events: string[] = [];
    let completions = 0;
    const transport: UploadTransport = {
      async createSession(): Promise<TransportSession> {
        return {
          uploadId: "upload-1",
          transportName: "fixture",
          createdAt: "2026-08-31T00:00:00.000Z"
        };
      },
      async uploadChunk(): Promise<void> {},
      async completeSession(): Promise<void> {
        completions += 1;
      }
    };
    const session = createIngestSession(namedBlob(), {
      transport,
      checksum: false,
      onEvent(event) {
        events.push(event.type);
      }
    });

    await session.start();
    expect(session.getSnapshot()?.status).toBe("completed");
    expect(completions).toBe(1);
    expect(events).toContain("completed");
  });
});
