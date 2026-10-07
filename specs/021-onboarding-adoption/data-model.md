# Data Model

## Example persistence
Resume: existing validated ResumeRecord in private hashed-ID JSON files.
Checkpoint: parsed WorkflowCheckpointV1 with expectedRevision compare-and-set.
Evidence: immutable operationId/evidenceId/revision/provenance/bundle/reference; identical repeat reconciles, changed content conflicts.
Fixture: valid TIFF bytes, known width/height/depth labelled caller_supplied.

One process owns the persistence factory; serialized checkpoint writes use atomic rename and immutable evidence uses exclusive creation. Original paths come from generated server upload IDs.

## Observation input
Schema `large-image-ingest.adoption-observations.v1` contains trials and projects.

Trial: trialId, participantId, participantKind (external-developer/maintainer/automation), firstTime, libraryVersion, journey (minimal-upload/verified-workflow), environment (node/browser), assistance (none/human), startedAt, finishedAt (nullable), outcome (success/blocked/abandoned), storedVerified, evidencePersisted, blockers.

Project: projectId, observedAt, libraryVersion, kind (external/internal/example/test), status (evaluating/active/discontinued), evidenceKind (self-reported/maintainer-reviewed), evidenceRef.

IDs are bounded pseudonymous references; timestamps have explicit timezone. Reject unknown keys, invalid enums, duplicate trial IDs and project/time pairs. Success requires stored verification; workflow success also requires evidence persistence.

## Aggregation
Earliest first-time trial per external participant/journey determines first-attempt outcomes; unsuccessful trials stay in denominator. Maintainer/automation counts are separate. Latest observation determines each known project's status and evidence strength; exclude example/test projects. Empty observations mean unknown actual population, never zero users.
