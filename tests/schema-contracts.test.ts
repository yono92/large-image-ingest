import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { createCompletionEvidence } from "../src/completion-evidence";
import { createEvidenceBundle, signEvidenceBundle } from "../src/evidence-bundle";
import { SEMICONDUCTOR_WAFER_PROFILE_V1 } from "../src/inspection-profile";
import {
  EVIDENCE_GRADE_INSPECTION_POLICY_V1,
  evaluateInspectionPolicy
} from "../src/inspection-policy";
import { createManifest } from "../src/manifest";
import {
  INGEST_QUEUE_RECORD_SCHEMA_VERSION,
  createQueueSourceIdentity,
  parseIngestQueueRecord
} from "../src/queue";
import type { IngestQueueRecord } from "../src/types";
import {
  createResumeChunkingIdentity,
  createResumeFileIdentity,
  createResumeRecord,
  parseResumeRecord
} from "../src/resume";
import { toLegacyResumeRecord, toV0_2ResumeRecord } from "./resume-fixtures";
import { createPolicyFixture } from "./inspection-fixtures";

const schemaFiles = {
  manifest: "manifest.v1.schema.json",
  resume: "resume.v0.3.schema.json",
  completion: "completion.v1.schema.json",
  queue: "queue.v0.1.schema.json",
  profile: "inspection-profile.v1.schema.json",
  policy: "inspection-policy.v1.schema.json",
  bundle: "evidence-bundle.v1.schema.json",
  signed: "signed-evidence.v1.schema.json"
} as const;

describe("published JSON Schema contracts", () => {
  it("validates current manifest, resume, and completion artifacts", async () => {
    const validators = await loadValidators();
    const file = createFile();
    const manifest = await createManifest(file, { chunking: { chunkSize: 256 * 1024 } });
    const resume = createResumeRecord({
      manifest,
      file: await createResumeFileIdentity(file),
      chunking: createResumeChunkingIdentity(file.size, { chunkSize: 256 * 1024 }),
      transport: { name: "fake", uploadId: "schema-upload" }
    });
    const completion = await createCompletionEvidence({
      manifest,
      transportName: "fake",
      receipts: []
    });
    const queue = createQueueRecord(file);
    const policyFixture = await createPolicyFixture();
    const policyReport = evaluateInspectionPolicy({
      manifest: policyFixture.manifest,
      completion: policyFixture.verified,
      policy: EVIDENCE_GRADE_INSPECTION_POLICY_V1
    });
    const bundle = createEvidenceBundle({
      manifest: policyFixture.manifest,
      completion: policyFixture.verified,
      policyReport
    });
    const signed = await signEvidenceBundle(bundle, {
      algorithm: "test",
      keyId: "schema-key",
      sign: () => new Uint8Array([1, 2, 3])
    });

    expect(validators.manifest(manifest), formatErrors(validators.manifest.errors)).toBe(true);
    expect(validators.resume(resume), formatErrors(validators.resume.errors)).toBe(true);
    expect(validators.completion(completion), formatErrors(validators.completion.errors)).toBe(true);
    expect(validators.queue(queue), formatErrors(validators.queue.errors)).toBe(true);
    expect(parseIngestQueueRecord(queue)).toEqual(queue);
    expect(validators.profile(SEMICONDUCTOR_WAFER_PROFILE_V1), formatErrors(validators.profile.errors)).toBe(true);
    expect(validators.policy(EVIDENCE_GRADE_INSPECTION_POLICY_V1), formatErrors(validators.policy.errors)).toBe(true);
    expect(validators.bundle(bundle), formatErrors(validators.bundle.errors)).toBe(true);
    expect(validators.signed(signed), formatErrors(validators.signed.errors)).toBe(true);
  });

  it("rejects malformed artifacts at documented fields", async () => {
    const validators = await loadValidators();
    const file = createFile();
    const manifest = await createManifest(file, { chunking: { chunkSize: 256 * 1024 } });
    const resume = createResumeRecord({
      manifest,
      file: await createResumeFileIdentity(file),
      chunking: createResumeChunkingIdentity(file.size, { chunkSize: 256 * 1024 }),
      transport: { uploadId: "schema-upload" }
    });
    const completion = await createCompletionEvidence({ manifest, transportName: "fake", receipts: [] });

    const badManifest = structuredClone(manifest) as unknown as Record<string, unknown>;
    delete (badManifest.original as Record<string, unknown>).preservation;
    const badResume = structuredClone(resume) as unknown as Record<string, unknown>;
    ((badResume.file as Record<string, unknown>).contentIdentity as Record<string, unknown>).value = "bad";
    const badCompletion = structuredClone(completion) as unknown as Record<string, unknown>;
    (badCompletion.upload as Record<string, unknown>).acknowledgedChunks = -1;
    const badQueue = structuredClone(createQueueRecord(file)) as unknown as Record<string, unknown>;
    badQueue.uploadedBytes = -1;
    const badProfile = { ...structuredClone(SEMICONDUCTOR_WAFER_PROFILE_V1), schemaVersion: "bad" };
    const badPolicy = { ...structuredClone(EVIDENCE_GRADE_INSPECTION_POLICY_V1), schemaVersion: "bad" };

    expect(validators.manifest(badManifest)).toBe(false);
    expect(validators.manifest.errors?.some((error) => error.instancePath === "/original")).toBe(true);
    expect(validators.resume(badResume)).toBe(false);
    expect(validators.resume.errors?.some((error) => error.instancePath === "/file/contentIdentity/value")).toBe(true);
    expect(validators.completion(badCompletion)).toBe(false);
    expect(validators.completion.errors?.some((error) => error.instancePath === "/upload/acknowledgedChunks")).toBe(true);
    expect(validators.queue(badQueue)).toBe(false);
    expect(validators.queue.errors?.some((error) => error.instancePath === "/uploadedBytes")).toBe(true);
    expect(validators.profile(badProfile)).toBe(false);
    expect(validators.policy(badPolicy)).toBe(false);
  });

  it("allows additive fields while rejecting unsupported schema versions", async () => {
    const validators = await loadValidators();
    const manifest = await createManifest(createFile(), { chunking: { chunkSize: 256 * 1024 } });
    const additive = { ...manifest, futureExtension: { enabled: true } };
    const unsupported = { ...manifest, schemaVersion: "large-image-ingest.manifest.v99" };

    expect(validators.manifest(additive)).toBe(true);
    expect(validators.manifest(unsupported)).toBe(false);
  });

  it("keeps documented legacy resume records parseable outside the current schema", async () => {
    const file = createFile();
    const manifest = await createManifest(file, { chunking: { chunkSize: 256 * 1024 } });
    const current = createResumeRecord({
      manifest,
      file: await createResumeFileIdentity(file),
      chunking: createResumeChunkingIdentity(file.size, { chunkSize: 256 * 1024 }),
      transport: { uploadId: "legacy-schema-upload" }
    });

    expect(parseResumeRecord(toLegacyResumeRecord(current)).schemaVersion)
      .toBe("large-image-ingest.resume.v0.1");
    expect(parseResumeRecord(toV0_2ResumeRecord(current)).schemaVersion)
      .toBe("large-image-ingest.resume.v0.2");
  });
});

async function loadValidators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const entries = await Promise.all(
    Object.entries(schemaFiles).map(async ([name, filename]) => [
      name,
      JSON.parse(await readFile(join(process.cwd(), "schemas", filename), "utf8"))
    ] as const)
  );
  for (const [, schema] of entries) ajv.addSchema(schema);
  return Object.fromEntries(entries.map(([name, schema]) => [name, ajv.getSchema(schema.$id)!])) as Record<
    keyof typeof schemaFiles,
    ReturnType<Ajv2020["compile"]>
  >;
}

function createFile(): File {
  return new File([new Uint8Array(512 * 1024)], "schema-wafer.tif", { type: "image/tiff" });
}

function createQueueRecord(file: File): IngestQueueRecord {
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: INGEST_QUEUE_RECORD_SCHEMA_VERSION,
    id: "schema-queue-item",
    sequence: 0,
    status: "pending",
    source: createQueueSourceIdentity(file),
    uploadedBytes: 0,
    totalBytes: file.size,
    attempt: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  return JSON.stringify(errors ?? []);
}
