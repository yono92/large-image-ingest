# Data Model: Inspection Ecosystem

## Metadata Profile v1

- ID, version, description.
- Ordered field rules: key, required, scalar type, optional bounds/enum/anchored pattern.

## Policy Pack v1

- ID, version, optional profile.
- Preservation/checksum/completion/stored-checksum requirements.
- Optional source byte maximum and media-type allowlist.

## Policy Report v1

- Policy identity, manifest/completion IDs, pass flag, sorted code/path/severity issues, evaluated timestamp.

## Evidence Bundle v1

- Schema/producer/id/timestamp.
- Immutable manifest and completion evidence.
- Optional policy report.

## Signed Evidence Envelope v1

- Schema version.
- Bundle payload.
- SHA-256 payload digest.
- Signature label: algorithm, key ID, base64url value, signed timestamp.

Trust is an output of verification, not a field persisted in the envelope.
