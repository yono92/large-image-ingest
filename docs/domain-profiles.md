# Domain Validation Profiles

`large-image-ingest/profiles` provides explicitly selected reference policies for semiconductor inspection, microscopy acquisition, and satellite imagery. The profiles are conservative starting points, not claims of regulatory compliance, scientific validity, calibration validity, diagnostic suitability, image quality, or fitness for a production process.

Nothing is activated automatically. Filename, media type, metadata, path, and observed image structure never cause the SDK to select a domain.

## Baseline Identity

Each effective profile has schema `large-image-ingest.domain-profile.v1`, a stable name and semantic version, a complete rule inventory, compatibility data, and SHA-256 over RFC 8785 canonical JSON. A changed rule inventory therefore has a different effective-policy digest even if a malformed producer reuses a name and version.

| Bundled ID | Profile | Required traceability | Accepted declared family |
| --- | --- | --- | --- |
| `semiconductor-inspection` | `semiconductor-inspection-baseline@1.0.0` | `lotId`, `waferId`, `inspectionTimestamp` | TIFF/BigTIFF, PNG, JPEG |
| `microscopy-acquisition` | `microscopy-acquisition-baseline@1.0.0` | `specimenId`, `acquisitionId`, `instrumentId`, `acquisitionTimestamp` | TIFF/BigTIFF, OME-TIFF |
| `satellite-imagery` | `satellite-imagery-baseline@1.0.0` | `sceneId`, `sensorId`, `acquisitionTimestamp` | TIFF/BigTIFF, GeoTIFF |

All three baselines require:

- a non-empty, safe-integer source size;
- whole-file SHA-256 already present in the manifest;
- coherent declared media type, filename suffix family, and explicit structural format evidence;
- positive dimensions;
- positive bit depth when available, with unavailable bit depth reported as a warning;
- normalized identifiers of 1–256 characters with no control or path separator characters;
- RFC 3339 acquisition/inspection timestamps with `Z` or a known numeric timezone offset.

There is no universal maximum file size, acquisition-age limit, or future-clock-skew limit in baseline v1. Deployments add those constraints through a new derived profile. Satellite coordinate-reference evidence is an explicit warning-level baseline rule; a derived profile can make it blocking.

OME-TIFF suffixes follow the [OME-TIFF specification](https://ome-model.readthedocs.io/en/latest/ome-tiff/specification.html), and GeoTIFF structural meaning follows [OGC GeoTIFF 1.1](https://www.ogc.org/standards/geotiff/). A suffix remains declared evidence only. It never proves embedded OME-XML, GeoTIFF keys, or a coordinate reference system.

## Evaluate Explicitly

Create or receive the ingest manifest first so the existing whole-file checksum is reused. Profile evaluation does not accept a Blob and therefore cannot perform a duplicate full-file traversal.

```ts
import {
  evaluateDomainValidationProfile,
  loadBundledDomainProfile
} from "large-image-ingest/profiles";

const profile = await loadBundledDomainProfile("semiconductor-inspection");
const evaluation = await evaluateDomainValidationProfile({
  profile,
  manifest,
  structuralEvidence: {
    source: "sdk_observed",
    format: "bigtiff",
    width: 4096,
    height: 4096,
    bitDepth: 16
  }
});
```

Every rule returns one stable rule ID, category, severity, evidence source, outcome, and safe description code. Outcomes distinguish `pass`, `warning`, `blocking_failure`, `not_applicable`, `unavailable_evidence`, and `invalid_configuration`. The aggregate is `passed`, `passed_with_warnings`, `failed`, or `invalid_configuration`.

Structural evidence must be labelled `sdk_observed`, `caller_supplied`, or `external_attested`. Manifest metadata is always reported as caller-supplied evidence. The evaluator never upgrades metadata assertions to observed image facts.

## Session And Resume Binding

Only passing evaluations expose a `large-image-ingest.domain-profile-binding.v1`. Pass it with the same manifest:

```ts
const session = createIngestSession(file, {
  manifest,
  domainProfile: evaluation.sessionBinding,
  transport,
  resume: { store }
});
```

A mismatched binding fails before `transport.createSession()`. New persistent resume records store only the safe profile reference: name, version, and effective-policy digest. Resume requires an exact reference match before selected-source hashing, `resumeSession()`, chunk upload, or acknowledged-byte reuse. Missing-versus-present and same-name/version-but-different-digest cases produce `resume.profile_mismatch`. Old records with no profile remain compatible when the current session also selects none.

A retained reference remains identifiable even if an application no longer bundles that historical profile. Re-evaluation requires the exact definition; the SDK never silently substitutes a newer version.

## Derived Organization Profiles

`deriveDomainValidationProfile()` starts from exactly one verified base and requires a new name/version. It supports:

- additional rules;
- provably tighter replacements, such as a lower maximum size, smaller allowed-format set, or stricter identifier bound;
- bounded canonical-to-organization metadata key mappings;
- explicit rule replacement or disablement with one safe rationale category.

Any relaxation must use an exception with `proprietary-format`, `external-evidence-authority`, `legacy-instrument`, or `organization-risk-acceptance`. Free-text rationale is intentionally excluded. Widening a rule through the tightening interface, duplicate IDs, mappings to unknown or unsafe fields, ancestry cycles, invalid digests, and undeclared inherited-rule changes are rejected.

Untrusted reconstructed derived profiles must be validated with their exact base definition. Published baseline objects remain deep-frozen and are never mutated by derivation.

## Safe Output

Evaluation records contain the safe profile reference and rule outcomes, not metadata values, source checksums, filenames, full rules, private exception text, storage locations, credentials, resume tokens, or provider receipts. Applications can map the evaluation to provenance policy codes and retain the full profile separately in an authorized policy registry.

Timestamp syntax follows [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339.html). Baseline media declarations reference [RFC 3302 for TIFF](https://www.rfc-editor.org/rfc/rfc3302.html), [W3C PNG](https://www.w3.org/TR/png-3/), and [IANA image/jpeg](https://www.iana.org/assignments/media-types/image/jpeg).
