<!--
Sync Impact Report
Version change: template -> 1.0.0
Modified principles:
- Template principle 1 -> I. Preserve Originals And Separate Derivatives
- Template principle 2 -> II. Make Ingest State Observable And Recoverable
- Template principle 3 -> III. Keep Core Adapter-Based And Framework-Agnostic
- Template principle 4 -> IV. Ship Stable TypeScript Contracts And Versioned Artifacts
- Template principle 5 -> V. Validate, Verify, And Handle Sensitive Data Conservatively
Added sections:
- Product And Architecture Constraints
- Development Workflow And Quality Gates
Removed sections:
- Placeholder sections from the initial Spec Kit template
Templates requiring updates:
- .specify/templates/plan-template.md: updated
- .specify/templates/spec-template.md: updated
- .specify/templates/tasks-template.md: updated
Follow-up TODOs:
- None
-->

# large-image-ingest Constitution

## Core Principles

### I. Preserve Originals And Separate Derivatives

The uploaded original file is a source-of-truth inspection artifact. Core code
MUST NOT resize, recompress, decode-and-rewrite, strip EXIF, normalize, or
otherwise mutate the original unless an active feature specification explicitly
allows that behavior. Any thumbnail, preview, compressed image, tile pyramid,
metadata extraction output, or transformed representation MUST be modeled as a
derivative with its own manifest entry and traceable relationship to the
original.

Rationale: semiconductor and industrial inspection workflows rely on the
original artifact remaining verifiable after upload.

### II. Make Ingest State Observable And Recoverable

Large-file upload state MUST be explicit in public contracts. Progress, retry,
pause, resume, failure, cancellation, and completion MUST be observable through
typed events or typed state. Durable resume behavior MUST be specified separately
from transient in-process retry. Any resumable path MUST define what state is
persisted, when checkpoints are written, how stale or mismatched files are
rejected, and how completion or cancellation cleans up recoverable records.

Rationale: multi-GB uploads must survive real network and browser failures
without hiding ambiguous state from applications.

### III. Keep Core Adapter-Based And Framework-Agnostic

The core package MUST own validation, fingerprinting, manifest generation,
chunk planning, session state, and event contracts. It MUST NOT bake in S3, tus,
NAS, SMB, NFS, WebDAV, SFTP, React, or any cloud provider behavior. Transports,
storage targets, preview generation, React bindings, and Node helpers MUST be
adapters or companion modules. Browser-facing code SHOULD prefer `Blob.slice`,
streams, and Web Workers where practical instead of loading entire files into
memory.

Rationale: inspection pipelines vary widely, and the SDK must remain portable
across browser, server, storage, and UI choices.

### IV. Ship Stable TypeScript Contracts And Versioned Artifacts

Public APIs MUST be TypeScript-first with exported, stable types for manifests,
sessions, events, errors, validation results, chunk descriptors, and adapters.
Schemas that leave process memory, including manifests and resume records, MUST
be versioned. Public API or schema changes MUST update specifications, README
examples, and tests in the same change set. ESM-first packaging is the default
unless compatibility research justifies another output.

Rationale: downstream applications need compile-time confidence and migration
paths when handling high-value inspection data.

### V. Validate, Verify, And Handle Sensitive Data Conservatively

The SDK MUST treat filenames, metadata, storage hints, resume tokens, and remote
upload identifiers as untrusted input. It MUST provide typed error codes for
validation, transport, resume, and verification failures so applications can
offer safe recovery UI. Default tests MUST NOT require real cloud credentials or
network services. Presigned URLs, credentials, customer metadata, full manifests,
and sensitive resume records MUST NOT be logged by default.

Rationale: ingestion code sits near customer data, credentials, and irreversible
storage actions; safe defaults are part of the product contract.

## Product And Architecture Constraints

- Source artifacts MUST remain verifiable through manifest identity, file
  metadata, checksums or checksum-ready contracts, and storage references.
- Validation rules MUST cover MIME type, extension, size, dimensions when
  available, checksum when specified, and user-provided metadata according to
  the active feature specification.
- NAS compatibility MUST be modeled through a server-side adapter, gateway, or
  resumable protocol. Browser code MUST NOT assume direct SMB or NFS writes.
- Runtime dependencies SHOULD stay small; native Web APIs and focused adapters
  are preferred over large framework dependencies.
- Package structure MAY start as a single package, but planning MUST preserve a
  path toward modular packages such as core, transport adapters, browser
  preview helpers, Node verification helpers, and React bindings.

## Development Workflow And Quality Gates

- Non-trivial product or architecture work MUST follow the Spec Kit order:
  constitution, specify, clarify when behavior is underspecified, plan, tasks,
  analyze or checklist, implement, and converge when incomplete or uncertain.
- Broad feature implementation MUST NOT start until a relevant specification
  and implementation plan exist under `specs/<feature>/`.
- Each implementation plan MUST include a Constitution Check covering original
  preservation, recoverability, adapter boundaries, TypeScript contracts,
  validation/security, documentation updates, and focused tests.
- Tests MUST scale with risk. Manifest generation, validation error codes,
  session state transitions, chunk planning, retry and resume behavior,
  checksum or checksum-ready behavior, and transport adapters MUST use focused
  unit or fake-transport tests before release.
- Before finishing implementation work, run `npm run typecheck`, `npm test`,
  and `npm run build` when package scripts exist. If a check cannot run, the
  limitation MUST be recorded in the final work summary.

## Governance

This constitution supersedes conflicting guidance in feature plans, tasks, and
ad hoc implementation notes. Changes require updating this file, recording the
version bump rationale in the Sync Impact Report, and propagating affected rules
to templates, specs, plans, tasks, README examples, and AGENTS guidance when
applicable.

Versioning follows semantic versioning:

- MAJOR for incompatible governance changes or removed principles.
- MINOR for new principles, materially expanded requirements, or new mandatory
  quality gates.
- PATCH for clarifications that do not change project obligations.

All feature reviews MUST verify constitution compliance before implementation.
Any intentional violation MUST be documented in the feature plan's Complexity
Tracking section with the simpler alternative that was rejected.

**Version**: 1.0.0 | **Ratified**: 2026-07-02 | **Last Amended**: 2026-07-02
