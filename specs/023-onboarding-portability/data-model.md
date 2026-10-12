# Data Model

- ExampleOptions: root?, file?; file allowed only by minimal CLI. Help is a non-executing parse outcome.
- LocalSource: file-backed Blob with basename/MIME/modification identity, plus stability check against original stat. Path/identity stay private; not in default errors.
- ExampleFailure: allowlisted cause code mapped to fixed message and recovery action; never embeds source fields in output.
- ConsumerQualification: manager/version, installation stage, ESM/CommonJS module smoke, optional-peer absence, minimal/workflow success and supplied-source outcome. Results are safe status lines; stage failure exits nonzero and private temp logs are cleaned.

Existing manifest, upload session, resume/checkpoint and evidence schemas remain unchanged.
