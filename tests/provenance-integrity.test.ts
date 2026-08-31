import { describe, expect, it } from "vitest";
import { createDerivativeReference } from "../src/derivatives.js";
import {
  canonicalizeProvenanceJson,
  validateIngestProvenance
} from "../src/provenance.js";
import {
  completedArtifact,
  fixtureManifest,
  fixtureRecorder,
  mutableArtifact
} from "./provenance-fixtures.js";

describe("ingest provenance integrity and relationships", () => {
  it("canonicalizes I-JSON independently of insertion order", () => {
    expect(canonicalizeProvenanceJson({
      string: "€$\u000f\nA'B\"\\\\\"/",
      numbers: [333333333.3333333, 1e30, 4.5, 0.002, 1e-27],
      literals: [null, true, false]
    })).toBe(
      "{\"literals\":[null,true,false],\"numbers\":[333333333.3333333,1e+30,4.5,0.002,1e-27]," +
      "\"string\":\"€$\\u000f\\nA'B\\\"\\\\\\\\\\\"/\"}"
    );
    expect(canonicalizeProvenanceJson({ b: 2, a: { d: 4, c: 3 } }))
      .toBe(canonicalizeProvenanceJson({ a: { c: 3, d: 4 }, b: 2 }));
  });

  it("rejects non-I-JSON numbers, lone surrogates, unsupported objects, and cycles", () => {
    expect(() => canonicalizeProvenanceJson(Number.NaN)).toThrow();
    expect(() => canonicalizeProvenanceJson("\ud800")).toThrow();
    expect(() => canonicalizeProvenanceJson(new Date())).toThrow();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalizeProvenanceJson(cyclic)).toThrow();
  });

  it("detects mutation of every authoritative artifact section", async () => {
    const manifest = await fixtureManifest();
    const recorder = fixtureRecorder(manifest, { authorized: true });
    recorder.observeIngestEvent({ type: "completed", manifest, uploadId: "upload-secret" });
    recorder.recordVerification({ status: "verified", verifierCategory: "stored-original" });
    recorder.recordRecovery({ classification: "resumable", acknowledgedRangesReused: 1 });
    recorder.recordDerivative({
      derivative: createDerivativeReference({
        manifest,
        id: "preview-1",
        kind: "preview",
        status: "created",
        checksum: { algorithm: "sha256", scope: "whole-file", value: "a".repeat(64), calculatedAt: "2026-08-31T00:00:00.000Z", chunkSizeBytes: 1 }
      })
    });
    recorder.recordExternalAttestation({
      attestation: {
        id: "attestation-1",
        type: "application-signature",
        digest: { algorithm: "sha256", value: "b".repeat(64) }
      }
    });
    const artifact = await recorder.seal();
    const mutations: Array<(candidate: Record<string, any>) => void> = [
      (candidate) => { candidate.correlationId = "ingest-2"; },
      (candidate) => { candidate.manifest.sizeBytes += 1; },
      (candidate) => { candidate.policy.result = "failed"; },
      (candidate) => { candidate.transport.receiptEvidenceCount += 1; },
      (candidate) => { candidate.recovery.resumeCount += 1; },
      (candidate) => { candidate.entries[0].occurredAt = "2026-08-30T00:00:00.000Z"; },
      (candidate) => { candidate.verification.verifierCategory = "other-verifier"; },
      (candidate) => { candidate.derivatives[0].status = "failed"; },
      (candidate) => { candidate.attestations[0].type = "other-signature"; },
      (candidate) => { candidate.annotations.caseId = "changed-value"; }
    ];

    for (const mutate of mutations) {
      const candidate = mutableArtifact(artifact);
      mutate(candidate);
      const validation = await validateIngestProvenance(candidate);
      expect(validation.ok).toBe(false);
      expect(validation.integrity).toBe("invalid");
    }
  });

  it("detects manifest, policy, derivative, and verification relationship mismatches", async () => {
    const manifest = await fixtureManifest();
    const recorder = fixtureRecorder(manifest);
    recorder.observeIngestEvent({ type: "completed", manifest, uploadId: "upload-secret" });
    recorder.recordVerification({ status: "verified", verifierCategory: "stored-original" });
    recorder.recordDerivative({
      derivative: createDerivativeReference({
        manifest,
        id: "preview-1",
        kind: "preview",
        status: "created"
      })
    });
    const artifact = await recorder.seal();
    const changedManifest = {
      ...manifest,
      id: "manifest-other",
      original: {
        ...manifest.original,
        sizeBytes: manifest.original.sizeBytes + 1,
        checksum: { ...manifest.original.checksum!, value: "f".repeat(64) }
      },
      derivatives: manifest.derivatives
    };
    const validation = await validateIngestProvenance(artifact, {
      manifest: changedManifest,
      policy: { id: "different-policy", version: "1.0.0" }
    });
    expect(validation.ok).toBe(false);
    expect(validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "provenance.identity_mismatch", path: "manifest.id" }),
      expect.objectContaining({ code: "provenance.identity_mismatch", path: "manifest.sizebytes" }),
      expect.objectContaining({ code: "provenance.identity_mismatch", path: "manifest.checksum" }),
      expect.objectContaining({ code: "provenance.identity_mismatch", path: "policy" }),
      expect.objectContaining({ code: "provenance.relationship_mismatch", path: "derivatives" })
    ]));

    const inconsistent = mutableArtifact(artifact);
    inconsistent.terminalStatus = "completed_unverified";
    expect((await validateIngestProvenance(inconsistent)).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "provenance.relationship_mismatch", path: "terminalstatus" })
    ]));
  });

  it("reports unsigned and application-evaluated attestation trust separately", async () => {
    const unsigned = await completedArtifact({ verified: "verified" });
    expect(await validateIngestProvenance(unsigned.artifact)).toMatchObject({
      integrity: "valid",
      actorTrust: "unsigned"
    });
    expect(JSON.stringify(await validateIngestProvenance(unsigned.artifact))).not.toMatch(
      /trusted.?time|non.?repudiation|compliance/i
    );

    const recorder = fixtureRecorder(unsigned.manifest);
    recorder.recordExternalAttestation({
      attestation: {
        id: "attestation-1",
        type: "application-signature",
        digest: { algorithm: "sha256", value: "c".repeat(64) },
        referenceId: "key-1"
      }
    });
    const artifact = await recorder.seal();
    expect(await validateIngestProvenance(artifact)).toMatchObject({
      ok: true,
      actorTrust: "not_evaluated"
    });
    expect(await validateIngestProvenance(artifact, {
      verifyAttestation: async () => ({ valid: true })
    })).toMatchObject({ ok: true, actorTrust: "externally_attested" });
    expect(await validateIngestProvenance(artifact, {
      verifyAttestation: async () => ({ valid: false })
    })).toMatchObject({ ok: false, actorTrust: "attestation_invalid" });
  });
});
