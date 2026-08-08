const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const packageJson = require("../package.json");

async function main() {
  const esm = await import("large-image-ingest");
  const esmCore = await import("large-image-ingest/core");
  const esmTus = await import("large-image-ingest/transport-tus");
  const esmS3 = await import("large-image-ingest/transport-s3");
  const esmNode = await import("large-image-ingest/node");
  const esmReact = await import("large-image-ingest/react");
  const esmTiff = await import("large-image-ingest/tiff");
  const cjs = require("large-image-ingest");
  const cjsCore = require("large-image-ingest/core");
  const cjsTus = require("large-image-ingest/transport-tus");
  const cjsS3 = require("large-image-ingest/transport-s3");
  const cjsNode = require("large-image-ingest/node");
  const cjsReact = require("large-image-ingest/react");
  const cjsTiff = require("large-image-ingest/tiff");

  assert.equal(typeof esm.planChunks, "function");
  assert.equal(typeof esm.createIngestSession, "function");
  assert.equal(typeof esm.parseResumeRecord, "function");
  assert.equal(typeof esm.createSafeEventSummary, "function");
  assert.equal(typeof esm.createDerivativeReference, "function");
  assert.equal(typeof esm.attachDerivative, "function");
  assert.equal(typeof esm.createPreviewDerivative, "function");
  assert.equal(typeof esmCore.createIngestSession, "function");
  assert.equal(esmCore.LARGE_IMAGE_INGEST_VERSION, packageJson.version);
  assert.equal(typeof esmCore.createCompletionEvidence, "function");
  assert.equal(typeof esmCore.validateCompletionEvidence, "function");
  assert.equal(typeof esmCore.createWorkerChecksumExecutor, "function");
  assert.equal(typeof esmCore.installChecksumWorkerRuntime, "function");
  assert.equal(typeof esmCore.createIngestQueue, "function");
  assert.equal(typeof esmCore.WebStorageQueueStore, "function");
  assert.equal(typeof esmCore.createSafeQueueEventSummary, "function");
  assert.equal(typeof esmCore.validateInspectionMetadata, "function");
  assert.equal(typeof esmCore.evaluateInspectionPolicy, "function");
  assert.equal(typeof esmCore.createEvidenceBundle, "function");
  assert.equal(typeof esmCore.signEvidenceBundle, "function");
  assert.equal(typeof esmCore.verifySignedEvidenceEnvelope, "function");
  assert.equal(typeof esmCore.validateResumeRecord, "function");
  assert.equal(typeof esmCore.redactUploadSessionSnapshot, "function");
  assert.equal(typeof esmCore.validateManifestDerivatives, "function");
  assert.equal(typeof esmTus.createTusTransport, "function");
  assert.equal(typeof esmS3.createS3MultipartTransport, "function");
  assert.equal(typeof esmNode.createNasGateway, "function");
  assert.equal(typeof esmNode.calculateNodeFileChecksum, "function");
  assert.equal(typeof esmNode.createNodeFileCompletionResult, "function");
  assert.equal(typeof esmNode.createMetadataDerivative, "function");
  assert.equal(typeof esmNode.createTilePyramidDerivative, "function");
  assert.equal(typeof esmReact.createIngestController, "function");
  assert.equal(typeof esmReact.IngestProvider, "function");
  assert.equal(typeof esmReact.useIngestSession, "function");
  assert.equal(typeof esmTiff.probeTiffMetadata, "function");
  assert.equal(typeof esmTiff.toTiffImageMetadata, "function");
  assert.equal(typeof cjs.planChunks, "function");
  assert.equal(typeof cjs.createIngestSession, "function");
  assert.equal(typeof cjs.parseResumeRecord, "function");
  assert.equal(typeof cjs.createSafeEventSummary, "function");
  assert.equal(typeof cjs.createDerivativeReference, "function");
  assert.equal(typeof cjs.attachDerivative, "function");
  assert.equal(typeof cjs.createPreviewDerivative, "function");
  assert.equal(typeof cjsCore.createIngestSession, "function");
  assert.equal(cjsCore.LARGE_IMAGE_INGEST_VERSION, packageJson.version);
  assert.equal(typeof cjsCore.createCompletionEvidence, "function");
  assert.equal(typeof cjsCore.validateCompletionEvidence, "function");
  assert.equal(typeof cjsCore.createWorkerChecksumExecutor, "function");
  assert.equal(typeof cjsCore.installChecksumWorkerRuntime, "function");
  assert.equal(typeof cjsCore.createIngestQueue, "function");
  assert.equal(typeof cjsCore.WebStorageQueueStore, "function");
  assert.equal(typeof cjsCore.createSafeQueueEventSummary, "function");
  assert.equal(typeof cjsCore.validateInspectionMetadata, "function");
  assert.equal(typeof cjsCore.evaluateInspectionPolicy, "function");
  assert.equal(typeof cjsCore.createEvidenceBundle, "function");
  assert.equal(typeof cjsCore.signEvidenceBundle, "function");
  assert.equal(typeof cjsCore.verifySignedEvidenceEnvelope, "function");
  assert.equal(typeof cjsCore.validateResumeRecord, "function");
  assert.equal(typeof cjsCore.redactUploadSessionSnapshot, "function");
  assert.equal(typeof cjsCore.validateManifestDerivatives, "function");
  assert.equal(typeof cjsTus.createTusTransport, "function");
  assert.equal(typeof cjsS3.createS3MultipartTransport, "function");
  assert.equal(typeof cjsNode.createNasGateway, "function");
  assert.equal(typeof cjsNode.calculateNodeFileChecksum, "function");
  assert.equal(typeof cjsNode.createNodeFileCompletionResult, "function");
  assert.equal(typeof cjsNode.createMetadataDerivative, "function");
  assert.equal(typeof cjsNode.createTilePyramidDerivative, "function");
  assert.equal(typeof cjsReact.createIngestController, "function");
  assert.equal(typeof cjsReact.IngestProvider, "function");
  assert.equal(typeof cjsReact.useIngestSession, "function");
  assert.equal(typeof cjsTiff.probeTiffMetadata, "function");
  assert.equal(typeof cjsTiff.toTiffImageMetadata, "function");
  assert.deepEqual(esm.planChunks(10, { chunkSize: 256 * 1024 }).chunks, [
    { index: 0, start: 0, end: 10, size: 10 }
  ]);
  assert.deepEqual(cjs.planChunks(10, { chunkSize: 256 * 1024 }).chunks, [
    { index: 0, start: 0, end: 10, size: 10 }
  ]);

  for (const subpath of [
    "manifest.v1", "resume.v0.3", "completion.v1", "queue.v0.1",
    "inspection-profile.v1", "inspection-policy.v1", "evidence-bundle.v1", "signed-evidence.v1"
  ]) {
    const schemaPath = require.resolve(`large-image-ingest/schemas/${subpath}`);
    const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
