# Research

## Executable onboarding
Decision: Plain .mjs public-package examples using the existing local real HTTP/filesystem target.
Rationale: Run with Node.js 20+ and installed package alone, without a TypeScript runner or cloud credentials.
Alternatives: New hosted service/provider adapter would expand scope.

## Progressive documentation
Decision: Minimal session first; complete workflow second.
Rationale: Basic session requires only transport; current first example hides five application adapters.
Alternatives: Weakening checksum or stored verification would violate preservation goals.

## Persistence and recovery
Decision: Example-only filesystem resume, CAS checkpoints and immutable evidence; one process owns each factory. Reconstruct client/adapters against the same running HTTP server.
Rationale: Existing server authority is an in-memory map; persistence does not establish distributed CAS.
Alternatives: Database storage/server crash recovery need separate deployment work.

## Structural evidence
Decision: Generate a valid grayscale TIFF with known caller_supplied dimensions.
Rationale: Existing synthetic header-only fixtures do not prove sdk_observed structural metadata.

## Adoption
Decision: Strict versioned local trial/project observations and deterministic reporting, separate from SDK runtime.
Rationale: Controlled scenarios, downloads and dependency searches do not count actual projects.
Alternatives: Telemetry or inferred user counts would exceed scope and distort evidence.

Two research agents reviewed examples, packaging, public APIs and adoption evidence. Findings above resolve all design unknowns.
