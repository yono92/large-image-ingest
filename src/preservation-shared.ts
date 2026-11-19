// Part of preservation.ts, split out to keep modules under 500 lines; public exports stay on preservation.ts.
import type { IngestFileLike } from "./types.js";
import type { PreservationIssue, PreservationMapping, PreservationMappingEntry, PreservationRelationshipSidecarV1 } from "./preservation.js";

export interface SourceEntry extends PreservationMappingEntry {
  source: { kind: "blob"; bytes: IngestFileLike } | { kind: "generated"; bytes: Uint8Array };
}

export interface ExecutionPlan {
  createdAt: string;
  entries: readonly SourceEntry[];
  relationship: PreservationRelationshipSidecarV1;
}

export interface MutableMappingState {
  entries: SourceEntry[];
  warnings: PreservationIssue[];
  blockers: PreservationIssue[];
}

export interface OcflInventory {
  id: string;
  type: "https://ocfl.io/1.1/spec/#inventory";
  digestAlgorithm: "sha256";
  head: "v1";
  manifest: Record<string, string[]>;
  versions: {
    v1: {
      created: string;
      state: Record<string, string[]>;
    };
  };
}

export const executionPlans = new WeakMap<PreservationMapping, ExecutionPlan>();
export const SHA256 = /^[a-f0-9]{64}$/;
export const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export const BAGIT_DECLARATION = "BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n";
export const OCFL_DECLARATION = "ocfl_object_1.1\n";
export const OCFL_INVENTORY_TYPE = "https://ocfl.io/1.1/spec/#inventory" as const;
