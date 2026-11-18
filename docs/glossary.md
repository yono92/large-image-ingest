# Glossary

Plain meanings of terms used across the docs.

| Term | Meaning |
| --- | --- |
| Original | The file the user selected, exactly as selected. The SDK never changes its bytes. |
| Derivative | Anything made from the original (preview, thumbnail, tile, metadata extract). Recorded separately in the manifest. |
| Manifest | Versioned JSON describing one ingest: file identity, image metadata, checksums, upload session and derivative references. |
| Source identity | The whole-file SHA-256 plus size of the original. Resume and parallel upload use it to prove the same content is being uploaded. |
| Receipt | What the transport returns for one stored chunk (range, size, and checksum when available). |
| Authoritative | The single component whose result counts. For example, the upload session is authoritative for transfer state; a UI may only display it. |
| Evidence | Recorded facts that let someone check a claim later, such as checksums, receipts and verification results. |
| Evidence bundle (dossier) | One self-hashed JSON document that collects the evidence of a verified ingest. |
| Provenance | Integrity-protected record of who did what to the original and when. |
| Fixity | Proof that stored bytes still match their recorded checksum. |
| Conformance | A fixed set of scenarios a transport must pass to be called compatible. |
| Qualification / qualified | Running the conformance scenarios (or a benchmark) against a specific target and recording that it passed. |
| Executor | Pluggable component that computes the whole-file checksum (built-in JavaScript, Worker, `node:crypto`, WASM). |
