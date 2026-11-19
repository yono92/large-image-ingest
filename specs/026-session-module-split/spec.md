# Feature Specification: Session Module Split

**Status**: Implemented
**Created**: 2026-11-19

## Context

`src/session.ts` held the whole upload session in one class (about 1,770 lines after the 1.9.0 helper extraction). The roadmap called for splitting it by role without changing behavior.

## Requirements

- **FR-001**: `LargeImageIngestSession` and `createIngestSession` MUST keep the same public members, signatures and behavior.
- **FR-002**: Session internals MUST be split by role: lifecycle and state, sequential transfer and completion, parallel transfer and chunk integrity, and resume records.
- **FR-003**: No new exports from any package entry point.

## Success Criteria

- Every existing test passes unchanged.
- Public (non-`private`) declarations in `dist/esm/session.d.ts` are identical to 1.9.2; package entry declarations are unchanged.

## Not In Scope

- One shared internal interface for both transfer engines, and a CI line-count warning (roadmap items, left for later).
- The 500-line target: `session-runtime.ts` and `session-resume.ts` are about 600 lines.
