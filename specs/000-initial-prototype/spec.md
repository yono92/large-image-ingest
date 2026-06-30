# Feature Specification: Initial Large Image Ingest Prototype

## Status

Draft. This file is a manual SDD seed until the Spec Kit CLI is initialized.

## Goal

Provide a minimal TypeScript core that can validate a large image-like file, create a manifest, split it into upload chunks, and stream those chunks through a user-supplied transport adapter.

## User Stories

1. As a frontend engineer, I can reject files that exceed configured size, MIME, or extension constraints before upload starts.
2. As a platform engineer, I can receive a manifest that identifies the original file and the upload chunk plan.
3. As an application developer, I can plug in my own transport implementation without coupling the core package to S3, tus, or a framework.
4. As a UI developer, I can subscribe to typed upload events for progress, retry, completion, and failure states.
5. As an infrastructure team, I can later route uploaded chunks into NAS-backed storage without changing the core upload state machine.

## Functional Requirements

- The core must preserve the original file and only call `slice` to produce chunk bodies.
- The core must not resize, decode, recompress, or strip metadata from the original file.
- The core must expose file validation as a standalone function.
- The core must expose chunk planning as a standalone function.
- The core must generate a versioned manifest before upload starts.
- The core must upload chunks sequentially through an adapter interface.
- The core must support aborting an active session.
- The core must retry failed chunk uploads a configurable number of times.

## Non-Goals

- Built-in S3 multipart upload.
- Built-in tus upload.
- Built-in NAS, SMB, NFS, WebDAV, or SFTP upload.
- React UI components.
- Image decoding, tile generation, or thumbnail generation.
- Strong whole-file checksums for multi-GB files.

## Acceptance Criteria

- A TypeScript consumer can import the package entrypoint and create an upload session.
- Validation failures prevent upload from starting.
- Chunk ranges are deterministic.
- Transport implementations receive the manifest, upload ID, chunk descriptor, and sliced blob body.
- Public types are exported from the package entrypoint.

## Future NAS Compatibility

NAS support should be treated as a server-side transport/storage adapter, not a browser-direct feature. Browsers cannot safely or generally write to SMB/NFS shares directly. A later NAS design should evaluate:

- Browser to app server, then app server to mounted NAS.
- Browser to tus/WebDAV/SFTP gateway, then gateway to NAS.
- Local checksum verification before finalizing files on NAS.
- Atomic finalize behavior so partially uploaded inspection images are not exposed as complete artifacts.
- File path normalization and traversal prevention.
