import type { ResumeStore } from "large-image-ingest/core";
import type { WorkflowCheckpointStore, WorkflowEvidenceSink } from "large-image-ingest/workflow";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { parseResumeRecord } from "large-image-ingest/core";
import { validateIngestEvidenceBundle, type IngestEvidenceBundleV1, parseWorkflowCheckpoint } from "large-image-ingest/workflow";
import { validateIngestProvenance, type IngestProvenanceArtifactV1, canonicalizeProvenanceJson } from "large-image-ingest/provenance";

// One process/factory owns this root. Use transactional storage for multiple owners.
export async function createFileStores(root: string): Promise<{ resume: ResumeStore; checkpoint: WorkflowCheckpointStore; evidence: WorkflowEvidenceSink }> {
  for (const kind of ["resume", "checkpoints", "evidence"]) {
    await mkdir(path.join(root, kind), { recursive: true, mode: 0o700 });
  }
  const file = (kind: string, id: string) => path.join(root, kind,
    `${createHash("sha256").update(String(id)).digest("hex")}.json`);
  async function read(filename: string): Promise<unknown> {
    try { return JSON.parse(await readFile(filename, "utf8")); }
    catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined; throw error; }
  }
  async function readEvidence(filename: string) {
    const value = await read(filename);
    if (value === undefined) return undefined;
    if (!value || typeof value !== "object" || !("operationId" in value) ||
      typeof value.operationId !== "string" || !("reference" in value) || typeof value.reference !== "string" ||
      !("provenance" in value) || !("bundle" in value)) throw new Error("Invalid evidence record.");
    if (!(await validateIngestProvenance(value.provenance)).ok || !(await validateIngestEvidenceBundle(value.bundle)).ok) throw new Error("Invalid evidence artifacts.");
    const provenance = value.provenance as IngestProvenanceArtifactV1;
    const bundle = value.bundle as IngestEvidenceBundleV1;
    return { operationId: value.operationId, reference: value.reference, provenance, bundle };
  }
  async function write(filename: string, value: unknown, exclusive = false) {
    const candidate = exclusive ? filename : `${filename}.${randomUUID()}.tmp`;
    const handle = await open(candidate, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
    finally { await handle.close(); }
    if (!exclusive) await rename(candidate, filename);
  }
  let pending = Promise.resolve();
  function serialized<T>(action: () => Promise<T>): Promise<T> {
    const result = pending.then(action);
    pending = result.then(() => {}, () => {});
    return result;
  }
  const evidenceFile = (id: string, revision: number) => file("evidence", `${id}:${revision}`);
  return {
    resume: {
      async get(id) { const value = await read(file("resume", id)); return value === undefined ? undefined : parseResumeRecord(value); },
      put(value) { return serialized(() => write(file("resume", value.id), parseResumeRecord(value))); },
      async list() {
        const names = (await readdir(path.join(root, "resume"))).filter(name => name.endsWith(".json"));
        return Promise.all(names.map(async name => parseResumeRecord(await read(path.join(root, "resume", name)))));
      },
      delete(id) { return serialized(() => rm(file("resume", id), { force: true })); }
    },
    checkpoint: {
      async get(id) { const value = await read(file("checkpoints", id)); return value === undefined ? undefined : parseWorkflowCheckpoint(value); },
      put(value, { expectedRevision }) {
        return serialized(async () => {
          const checkpoint = parseWorkflowCheckpoint(value);
          const filename = file("checkpoints", checkpoint.workflowId);
          const rawCurrent = await read(filename);
          const current = rawCurrent === undefined ? undefined : parseWorkflowCheckpoint(rawCurrent);
          if (expectedRevision === "absent" ? current !== undefined : current?.revision !== expectedRevision) return "conflict";
          await write(filename, checkpoint);
          return "stored";
        });
      },
      delete(id) { return serialized(() => rm(file("checkpoints", id), { force: true })); }
    },
    evidence: {
      persist(input) {
        return serialized(async () => {
          const { operationId, evidenceId, revision, provenance, bundle } = input;
          if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("Invalid evidence revision.");
          const filename = evidenceFile(evidenceId, revision);
          const reference = `local-evidence-${createHash("sha256").update(`${evidenceId}:${revision}`).digest("hex")}`;
          const value = { operationId, evidenceId, revision, provenance, bundle, reference };
          const current = await read(filename);
          if (current) {
            if (canonicalizeProvenanceJson(current) !== canonicalizeProvenanceJson(value)) throw new Error("Evidence revision conflict.");
          } else {
            if (revision === 1 ? input.expectedRevision !== "absent" :
              input.expectedRevision !== revision - 1 || !(await read(evidenceFile(evidenceId, revision - 1)))) {
              throw new Error("Evidence expected revision conflict.");
            }
            await write(filename, value, true);
          }
          return { status: "persisted", reference, revision };
        });
      },
      async reconcile({ operationId, evidenceId, revision }) {
        const value = await readEvidence(evidenceFile(evidenceId, revision));
        if (!value) return { status: "not_found" };
        if (value.operationId !== operationId) throw new Error("Evidence operation conflict.");
        return { status: "persisted", reference: value.reference, revision };
      },
      async get({ evidenceId, revision }) {
        const value = await readEvidence(evidenceFile(evidenceId, revision));
        if (!value) return undefined;
        return { provenance: value.provenance, bundle: value.bundle, reference: value.reference };
      }
    }
  };
}
