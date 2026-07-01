# Security Policy

## Supported Versions

This project is pre-1.0. Security fixes apply to the latest published version and the `main` branch.

## Reporting A Vulnerability

Please report security issues privately through GitHub Security Advisories when available.

Do not include presigned URLs, credentials, customer inspection metadata, or private sample images in public issues.

## Scope

Security-sensitive areas include:

- Upload session state and retry behavior.
- Manifest integrity and checksum handling.
- Presigned URL handling.
- Server-side adapters for object storage, NAS, WebDAV, SFTP, or filesystem targets.
- Filename and metadata validation.
