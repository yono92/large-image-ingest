# Data Model: Node Verification & Integrity

## Verification Issue Code

```ts
export type VerificationIssueCode =
  | "verification.manifest_schema_unsupported"
  | "verification.manifest_invalid"
  | "verification.original_mismatch"
  | "verification.checksum_missing"
  | "verification.checksum_unsupported"
  | "verification.checksum_mismatch"
  | "verification.receipt_missing"
  | "verification.receipt_duplicate"
  | "verification.receipt_invalid"
  | "verification.receipt_incomplete"
  | "verification.transport_mismatch"
  | "verification.file_not_found"
  | "verification.file_unreadable";
```

Purpose:

- Gives applications stable codes for verification UI and recovery decisions.
- Keeps verification failures separate from transport execution failures.

## Verification Result

```ts
export interface VerificationResult {
  ok: boolean;
  issues: IngestIssue[];
}
```

Purpose:

- Mirrors validation results so callers can handle validation and verification uniformly.
- Avoids throwing for expected integrity mismatches.

## Manifest Verification Options

```ts
export type VerificationChecksumPolicy = "required" | "when-present" | false;

export interface VerifyManifestOptions {
  checksum?: VerificationChecksumPolicy;
  checksumChunkSize?: number;
  file?: IngestFileLike;
}
```

Purpose:

- Allows structural manifest verification alone.
- Allows optional file-like comparison when browser or test code has a `Blob`-compatible source.
- Defaults checksum verification to `"when-present"`.

## Receipt Verification Options

```ts
export interface VerifyUploadReceiptsOptions {
  allowPartial?: boolean;
  expectedTransportName?: string;
  requireChunkChecksums?: boolean;
}
```

Purpose:

- Complete verification requires one receipt per chunk.
- Partial verification supports resumable workflows and snapshots.
- Transport-name checks can use either an explicit expected name or the manifest upload transport name.

## Node File Verification Options

```ts
export interface VerifyNodeFileManifestOptions {
  checksum?: VerificationChecksumPolicy;
  checksumChunkSize?: number;
}
```

Purpose:

- Verifies stored files after NAS finalize or another server-side publish step.
- Keeps filesystem reads isolated to the Node subpath.
