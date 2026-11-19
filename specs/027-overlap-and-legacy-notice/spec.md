# Feature Specification: Checksum/Upload Overlap And Legacy Resume Notice

**Status**: Implemented for 1.10.0
**Created**: 2026-11-19
**Amends**: 020 parallel upload integrity (overlap is limited to sequential uploads)

## User Stories

- **US1**: As an application uploading a large original, I can start transferring chunks while the whole-file checksum is still running, so the first bytes leave sooner.
- **US2**: As an application with stored v0.1/v0.2 resume records, I am told when one is read, so I can migrate before 2.0.0 stops reading them.

## Requirements

- **FR-001**: `overlapChecksum: true` MUST start the sequential chunk loop without waiting for the whole-file checksum.
- **FR-002**: `overlapChecksum` MUST be rejected with `session.invalid_state` before any transport call when combined with `parallel`, `checksum: false`, a supplied `manifest`, or `resumeFrom`. Parallel uploads need source identity before chunk evidence; the others have nothing to overlap.
- **FR-003**: With a resume store, the persistent record MUST NOT exist until the checksum is known. It MUST then be written once with every chunk already uploaded. An upload stopped before that point cannot resume.
- **FR-004**: `completeSession` MUST NOT run until the checksum is known and recorded in `manifest.original.checksum`. A `checksum.expected` mismatch MUST fail with `validation.failed` and add a `checksum.mismatch` validation issue.
- **FR-005**: A checksum failure during upload MUST stop the upload after the current chunk.
- **FR-006**: Resuming a stored v0.1 or v0.2 record MUST emit `resume:legacy-record` with the record id, schema version and `removedIn: "2.0.0"`. Behavior is otherwise unchanged.
- **FR-007**: Default behavior (no `overlapChecksum`) is unchanged.

## Success Criteria

- Tests show a chunk uploading before the checksum finishes, the record appearing only afterwards with earlier chunks, a resumed upload continuing from the next chunk, mismatch failing before completion, and rejected combinations creating no remote session.
- All existing tests pass.
