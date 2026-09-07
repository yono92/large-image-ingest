import { describe, expect, it } from "vitest";
import {
  parseWorkflowCheckpoint,
  restoreWorkflowOperationIds,
  workflowCheckpointMatchesSource
} from "../src/workflow.js";
import { MemoryWorkflowCheckpointStore } from "./workflow-fixtures.js";
import type { WorkflowCheckpointV1 } from "../src/workflow.js";

const checksum = "a".repeat(64);

function checkpoint(): WorkflowCheckpointV1 {
  return {
    schemaVersion: "large-image-ingest.workflow-checkpoint.v1",
    workflowId: "workflow-checkpoint-1",
    revision: 2,
    updatedAt: "2026-09-07T00:00:00.000Z",
    status: "uploaded_unverified",
    lastAuthoritativeState: "uploaded_unverified",
    manifestId: "manifest-checkpoint-1",
    sourceIdentity: {
      algorithm: "sha256",
      scope: "whole-file",
      sizeBytes: 1024,
      value: checksum
    },
    resumeRecordId: "resume-checkpoint-1",
    operationIds: { verification: "operation-verification-1" },
    attempts: { verification: 1 }
  };
}

describe("workflow checkpoint", () => {
  it("parses exact safe fields and restores operation identities", () => {
    const parsed = parseWorkflowCheckpoint(checkpoint());
    expect(parsed).toEqual(checkpoint());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(restoreWorkflowOperationIds(parsed).get("verification")).toBe("operation-verification-1");
  });

  it("rejects unknown, secret-bearing, malformed, and stale identity fields", () => {
    expect(() => parseWorkflowCheckpoint({ ...checkpoint(), presignedUrl: "https://secret" }))
      .toThrowError(expect.objectContaining({ code: "workflow.checkpoint_invalid" }));
    expect(() => parseWorkflowCheckpoint({ ...checkpoint(), revision: 0 }))
      .toThrowError(expect.objectContaining({ code: "workflow.checkpoint_invalid" }));
    expect(() => parseWorkflowCheckpoint({
      ...checkpoint(),
      operationIds: { providerSecret: "secret" }
    })).toThrowError(expect.objectContaining({ code: "workflow.checkpoint_invalid" }));
    expect(workflowCheckpointMatchesSource(checkpoint(), { sizeBytes: 1024, checksum })).toBe(true);
    expect(workflowCheckpointMatchesSource(checkpoint(), { sizeBytes: 1024, checksum: "b".repeat(64) })).toBe(false);
  });

  it("detects stale compare-and-set writers", async () => {
    const store = new MemoryWorkflowCheckpointStore();
    expect(await store.put(checkpoint(), { expectedRevision: "absent" })).toBe("stored");
    expect(await store.put({ ...checkpoint(), revision: 3 }, { expectedRevision: 1 })).toBe("conflict");
    expect(await store.put({ ...checkpoint(), revision: 3 }, { expectedRevision: 2 })).toBe("stored");
  });
});
