import type { VerifiedIngestWorkflow, CreateVerifiedIngestWorkflowOptions } from "large-image-ingest/workflow";
import path from "node:path";
import { loadBundledDomainProfile } from "large-image-ingest/profiles";
import { createVerifiedIngestWorkflow } from "large-image-ingest/workflow";
import { createNodeStoredFileVerifier } from "large-image-ingest/node";
import { createLocalReferenceServer } from "../reference-local/local-server.mjs";
import { createFixture, exampleRoot, runCli } from "./fixture.mjs";
import { createReferenceTransport } from "./transport.mjs";
import { createFileStores } from "./file-stores.mjs";

export async function runVerifiedWorkflow(options: { root?: string; exerciseRecovery?: boolean } = {}) {
  const root = await exampleRoot(options.root);
  const server = await createLocalReferenceServer({ root });
  try {
    const file = createFixture();
    const profile = await loadBundledDomainProfile("semiconductor-inspection");
    let stores = await createFileStores(path.join(root, "records"));
    let workflow: VerifiedIngestWorkflow;
    let paused = false;
    const configuration = (): CreateVerifiedIngestWorkflowOptions => ({
      profile: { definition: profile,
        structuralEvidence: { source: "caller_supplied", format: "tiff", width: 512, height: 512, bitDepth: 8 } },
      session: {
        transport: createReferenceTransport(server.baseUrl),
        chunking: { chunkSize: 256 * 1024 },
        resume: { store: stores.resume, cleanup: "delete-on-complete" },
        metadata: { lotId: "STARTER", waferId: "DEMO", inspectionTimestamp: "2026-10-07T00:00:00Z" }
      },
      verifier: createNodeStoredFileVerifier({ resolvePath: async manifest => server.resolveStoredPath(manifest.id) }),
      checkpointStore: stores.checkpoint,
      evidenceSink: stores.evidence,
    });
    workflow = createVerifiedIngestWorkflow(file, configuration());
    const unsubscribe = workflow.subscribe(() => {
      const state = workflow.getState();
      if (options.exerciseRecovery && !paused && state.status === "uploading" && (state.snapshot?.uploadedBytes ?? 0) > 0) {
        paused = true;
        workflow.pause();
      }
    });
    let result = await workflow.start();
    unsubscribe();
    let recovered = false;
    if (options.exerciseRecovery) {
      if (result.status !== "paused") throw new Error(`Expected a paused workflow; received ${result.status}.`);
      stores = await createFileStores(path.join(root, "records"));
      workflow = createVerifiedIngestWorkflow(file, configuration());
      result = await workflow.resume(result.workflowId);
      recovered = true;
    }
    if (result.status !== "evidence_persisted") throw new Error(`Evidence was not persisted: ${result.status} ${JSON.stringify("issueCodes" in result ? result.issueCodes : [])}.`);
    const reloaded = await createFileStores(path.join(root, "records"));
    const checkpoint = await reloaded.checkpoint.get(result.workflowId);
    if (!checkpoint?.evidenceId || checkpoint.evidenceRevision === undefined || !checkpoint.manifestId) throw new Error("Evidence checkpoint is incomplete.");
    const evidence = await reloaded.evidence.get({ evidenceId: checkpoint.evidenceId, revision: checkpoint.evidenceRevision });
    if (!evidence || evidence.reference !== result.evidenceReference) throw new Error("Evidence reload failed.");
    return { root, status: result.status, storedVerified: checkpoint.verification?.status === "verified",
      evidenceReloaded: true, recovered, workflowId: result.workflowId, evidenceId: checkpoint.evidenceId,
      storedPath: server.resolveStoredPath(checkpoint.manifestId) };
  } finally {
    await server.close();
  }
}

runCli(import.meta.url, options => runVerifiedWorkflow({ ...options, exerciseRecovery: true }));
