const assert = require("node:assert/strict");

async function main() {
  const esm = await import("large-image-ingest");
  const cjs = require("large-image-ingest");

  assert.equal(typeof esm.planChunks, "function");
  assert.equal(typeof esm.createIngestSession, "function");
  assert.equal(typeof cjs.planChunks, "function");
  assert.equal(typeof cjs.createIngestSession, "function");
  assert.deepEqual(esm.planChunks(10, { chunkSize: 256 * 1024 }).chunks, [
    { index: 0, start: 0, end: 10, size: 10 }
  ]);
  assert.deepEqual(cjs.planChunks(10, { chunkSize: 256 * 1024 }).chunks, [
    { index: 0, start: 0, end: 10, size: 10 }
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
