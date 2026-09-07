import { openAsBlob } from "node:fs";
import { access } from "node:fs/promises";
import type { PathLike } from "node:fs";
import {
  evaluatePreservationMapping,
  exportBagIt,
  exportOcflObject,
  PreservationError,
  validateBagIt,
  validateOcflObject,
  type PreservationProfile
} from "./preservation.js";
import { verifyNodeFileManifest } from "./node-verification.js";
import type {
  PreservationHandoffAdapter,
  PreservationHandoffResult,
  StoredObjectVerificationAdapter,
  WorkflowVerificationResult
} from "./workflow-types.js";
import type { IngestFileLike, IngestManifest } from "./types.js";

export interface CreateNodeStoredFileVerifierOptions {
  resolvePath(manifest: IngestManifest): Promise<PathLike>;
  checksum?: "required" | "when-present";
  now?: () => Date;
}

export interface CreateFilesystemPreservationHandoffOptions {
  profile: PreservationProfile;
  resolveOriginalPath(manifest: IngestManifest): Promise<PathLike>;
  resolveDestination(input: { workflowId: string; operationId: string }): Promise<string>;
}

export function createNodeStoredFileVerifier(
  options: CreateNodeStoredFileVerifierOptions
): StoredObjectVerificationAdapter {
  return {
    category: "node-stored-file",
    async verify({ manifest, signal }): Promise<WorkflowVerificationResult> {
      if (signal.aborted) throw signal.reason;
      try {
        const path = await options.resolvePath(manifest);
        if (signal.aborted) throw signal.reason;
        const result = await verifyNodeFileManifest(path, manifest, {
          checksum: options.checksum ?? "required"
        });
        const checkedAt = (options.now?.() ?? new Date()).toISOString();
        if (result.ok) {
          return {
            status: "verified",
            checkedAt,
            expectedEvidenceCategories: ["whole-file-sha256", "size"],
            observedEvidenceCategories: ["whole-file-sha256", "size"]
          };
        }
        const issueCodes = result.issues.map((issue) => issue.code);
        return {
          status: "failed",
          checkedAt,
          issueCodes,
          retryable: issueCodes.some((code) =>
            code === "verification.file_not_found" || code === "verification.file_unreadable"
          )
        };
      } catch {
        return {
          status: "unavailable",
          checkedAt: (options.now?.() ?? new Date()).toISOString(),
          issueCodes: ["verification.file_unreadable"],
          retryable: true
        };
      }
    }
  };
}

export function createFilesystemPreservationHandoff(
  options: CreateFilesystemPreservationHandoffOptions
): PreservationHandoffAdapter {
  return {
    category: `filesystem-${options.profile}`,
    async handoff(input): Promise<PreservationHandoffResult> {
      if (input.signal.aborted) throw input.signal.reason;
      const destination = await options.resolveDestination({
        workflowId: input.evidence.workflowId,
        operationId: input.operationId
      });
      const existing = await inspectDestination(destination, options.profile, input.operationId);
      if (existing) return existing;
      try {
        const originalPath = await options.resolveOriginalPath(input.manifest);
        const originalBlob = await openAsBlob(originalPath);
        const original = asIngestFile(originalBlob);
        if (input.signal.aborted) throw input.signal.reason;
        const mapping = await evaluatePreservationMapping({
          profile: options.profile,
          manifest: input.manifest,
          original: { bytes: original },
          provenance: input.provenance
        });
        if (mapping.status === "blocked") {
          return {
            status: "failed",
            issueCodes: mapping.blockers.map((issue) => issue.code),
            retryable: false
          };
        }
        if (options.profile === "bagit-1.0-sha256") {
          await exportBagIt(mapping, { destination });
        } else {
          await exportOcflObject(mapping, { destination });
        }
        return preserved(options.profile, input.operationId);
      } catch (error) {
        if (error instanceof PreservationError) {
          return {
            status: "failed",
            issueCodes: [error.code, ...error.issues.map((issue) => issue.code)],
            retryable: error.code === "preservation.materialization_failed"
          };
        }
        return {
          status: "failed",
          issueCodes: ["preservation.materialization_failed"],
          retryable: true
        };
      }
    },
    async reconcile({ operationId, workflowId, signal }) {
      if (signal.aborted) throw signal.reason;
      const destination = await options.resolveDestination({ workflowId, operationId });
      return (await inspectDestination(destination, options.profile, operationId)) ?? {
        status: "not_found" as const
      };
    }
  };
}

async function inspectDestination(
  destination: string,
  profile: PreservationProfile,
  operationId: string
): Promise<PreservationHandoffResult | undefined> {
  try {
    await access(destination);
  } catch {
    return undefined;
  }
  const validation = profile === "bagit-1.0-sha256"
    ? await validateBagIt(destination)
    : await validateOcflObject(destination);
  if (validation.ok) return preserved(profile, operationId);
  return {
    status: "failed",
    issueCodes: validation.issues.map((issue) => issue.code),
    retryable: false
  };
}

function preserved(profile: PreservationProfile, operationId: string): PreservationHandoffResult {
  return {
    status: "preserved",
    profile,
    reference: `preservation-${operationId}`
  };
}

function asIngestFile(blob: Blob): IngestFileLike {
  Object.defineProperties(blob, {
    name: { value: "stored-original", configurable: false },
    lastModified: { value: 0, configurable: false }
  });
  return blob as IngestFileLike;
}
