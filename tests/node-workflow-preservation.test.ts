import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createFilesystemPreservationHandoff,
  type CreateFilesystemPreservationHandoffOptions
} from "../src/node-workflow.js";
import { createVerifiedIngestWorkflow } from "../src/workflow.js";
import type { IngestEvidenceBundleV1 } from "../src/workflow.js";
import {
  MemoryWorkflowEvidenceSink,
  workflowFile,
  workflowOptions
} from "./workflow-fixtures.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe.each(["bagit-1.0-sha256", "ocfl-1.1-sha256"] as const)(
  "Node %s preservation handoff",
  (profile) => {
    it("creates one new output and safely reconciles a repeated operation", async () => {
      const fixture = await evidenceFixture();
      const destination = join(fixture.root, profile === "bagit-1.0-sha256" ? "bag" : "ocfl");
      const options: CreateFilesystemPreservationHandoffOptions = {
        profile,
        async resolveOriginalPath() { return fixture.sourcePath; },
        async resolveDestination() { return destination; }
      };
      const adapter = createFilesystemPreservationHandoff(options);
      const input = {
        operationId: "preserve-1",
        manifest: fixture.manifest,
        provenance: fixture.provenance,
        evidence: fixture.evidence,
        signal: new AbortController().signal
      };

      const first = await adapter.handoff(input);
      const repeated = await adapter.handoff(input);
      expect(first).toEqual({ status: "preserved", profile, reference: "preservation-preserve-1" });
      expect(repeated).toEqual(first);
      await expect(adapter.reconcile?.({
        operationId: "preserve-1",
        workflowId: fixture.evidence.workflowId,
        signal: new AbortController().signal
      })).resolves.toEqual(first);
      expect(JSON.stringify(first)).not.toContain(destination);
    });

    it("does not treat interrupted staging or an invalid existing destination as preserved", async () => {
      const fixture = await evidenceFixture();
      const destination = join(fixture.root, "target");
      await mkdir(join(fixture.root, ".target.incomplete-seeded"));
      const adapter = createFilesystemPreservationHandoff({
        profile,
        async resolveOriginalPath() { return fixture.sourcePath; },
        async resolveDestination() { return destination; }
      });
      await expect(adapter.reconcile?.({
        operationId: "preserve-2",
        workflowId: fixture.evidence.workflowId,
        signal: new AbortController().signal
      })).resolves.toEqual({ status: "not_found" });

      await mkdir(destination);
      const result = await adapter.handoff({
        operationId: "preserve-2",
        manifest: fixture.manifest,
        provenance: fixture.provenance,
        evidence: fixture.evidence,
        signal: new AbortController().signal
      });
      expect(result.status).toBe("failed");
      expect(JSON.stringify(result)).not.toContain(destination);
    });
  }
);

async function evidenceFixture(): Promise<{
  root: string;
  sourcePath: string;
  manifest: Parameters<ReturnType<typeof createFilesystemPreservationHandoff>["handoff"]>[0]["manifest"];
  provenance: Parameters<ReturnType<typeof createFilesystemPreservationHandoff>["handoff"]>[0]["provenance"];
  evidence: IngestEvidenceBundleV1;
}> {
  const root = await mkdtemp(join(tmpdir(), "large-image-ingest-node-preservation-"));
  roots.push(root);
  const source = workflowFile();
  const sourcePath = join(root, "stored-original.bin");
  await writeFile(sourcePath, new Uint8Array(await source.arrayBuffer()));
  const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
  const sink = new MemoryWorkflowEvidenceSink();
  let capturedManifest: Parameters<ReturnType<typeof createFilesystemPreservationHandoff>["handoff"]>[0]["manifest"] | undefined;
  const options = await workflowOptions(calls, sink);
  options.verifier = {
    category: "capture",
    async verify({ manifest }) {
      capturedManifest = manifest;
      return {
        status: "verified",
        checkedAt: "2026-09-07T00:00:00.000Z",
        expectedEvidenceCategories: ["whole-file-sha256", "size"],
        observedEvidenceCategories: ["whole-file-sha256", "size"]
      };
    }
  };
  const result = await createVerifiedIngestWorkflow(source, options).start();
  if (result.status !== "evidence_persisted" || result.terminal !== true) {
    throw new Error("expected evidence fixture");
  }
  const persisted = sink.values.get(`${result.bundle.id}:1`);
  if (!persisted || !capturedManifest) throw new Error("missing evidence fixture");
  return { root, sourcePath, manifest: capturedManifest, provenance: persisted.provenance, evidence: result.bundle };
}
