# Research: Domain Validation Profiles

## Timestamp Syntax

**Decision**: Require RFC 3339 date-time strings with `Z` or an explicit numeric offset. Reject local timestamps without timezone and the RFC `-00:00` unknown-offset convention for acquisition authority.

**Rationale**: RFC 3339 defines an interoperable Internet timestamp and makes the relationship to UTC explicit. Acquisition records need an actual instant rather than a locale-dependent wall-clock assertion.

**Source**: [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339.html)

## OME-TIFF

**Decision**: The microscopy baseline recognizes `.ome.tif`, `.ome.tiff`, `.ome.tf2`, `.ome.tf8`, and `.ome.btf` names only as declared-family evidence; an `ome-tiff` structural result must still come from bounded SDK observation or labelled external attestation.

**Rationale**: OME defines these TIFF/BigTIFF extensions and requires OME-XML in the first IFD. A suffix alone cannot prove that structure.

**Source**: [OME-TIFF specification](https://ome-model.readthedocs.io/en/latest/ome-tiff/specification.html)

## GeoTIFF

**Decision**: The satellite baseline accepts TIFF/BigTIFF containers and a distinct `geotiff` structural format. Coordinate-reference evidence is an explicit warning-level baseline rule and can be tightened by an organization.

**Rationale**: OGC GeoTIFF defines georeferencing through TIFF tag sets. A `.tif` extension alone cannot establish georeferencing or a coordinate reference system.

**Source**: [OGC GeoTIFF 1.1](https://www.ogc.org/standards/geotiff/)

## TIFF, PNG, And JPEG Declarations

**Decision**: Baseline aliases are `image/tiff` and `image/x-tiff` with TIFF-family suffixes, `image/png` with `.png`, and `image/jpeg` with `.jpg`, `.jpeg`, or `.jpe`. Declared media type, suffix family, and structural evidence must agree.

**Rationale**: RFC 3302 registers `image/tiff`; W3C registers `image/png`; IANA registers `image/jpeg`. Aliases are explicit policy data rather than format inference.

**Sources**: [RFC 3302](https://www.rfc-editor.org/rfc/rfc3302.html), [W3C PNG](https://www.w3.org/TR/png-3/), [IANA image/jpeg](https://www.iana.org/assignments/media-types/image/jpeg)

## Conservative Baseline Thresholds

**Decision**: v1 requires non-empty safe-integer size and positive dimensions. Positive bit depth is blocking when present but unavailable bit depth is a warning. Baselines contain no maximum file size and no age/future-skew limit beyond timestamp validity.

**Rationale**: Universal size and clock-age limits would be unjustified across instruments and deployments. Organizations add them through a new effective profile identity. Warning-only bit-depth absence reflects current bounded-inspection availability without fabricating a pass.

## Evidence Authority

**Decision**: Use only explicit `manifest`, `sdk_observed`, `caller_supplied`, and `external_attested` source categories. Metadata never becomes structural evidence. Existing manifest whole-file SHA-256 is reused and the evaluator never accepts a file/Blob.

**Rationale**: This makes duplicate full reads impossible in the profile layer and prevents assertions from being presented as independent observation.
