# Example Contract: Local Reference HTTP Target

This HTTP surface exists only for the runnable example and tests. It is not a production server API or a published library contract.

## Create Upload

`POST /api/uploads`

Request:

```json
{
  "manifest": {},
  "totalBytes": 25165824
}
```

Response `201`:

```json
{
  "uploadId": "opaque-random-id"
}
```

Rules:

- Validate manifest shape and total bytes within an example limit.
- Generate paths from the random upload ID, never the source filename.
- Persist the manifest only in the temporary local example root.

## Read Safe Upload State

`GET /api/uploads/{uploadId}`

Response `200`:

```json
{
  "uploadId": "opaque-random-id",
  "status": "open",
  "totalBytes": 25165824,
  "acknowledgedChunks": [0, 1],
  "acknowledgedBytes": 16777216,
  "duplicateBytes": 0,
  "verification": "pending"
}
```

Rules:

- Used by `resumeSession` to prove that the remote session still exists.
- Must not include paths, source names, manifests, metadata, checksum values, request headers, or resume tokens.

## Upload Chunk

`PUT /api/uploads/{uploadId}/chunks/{chunkIndex}`

Headers:

- `x-chunk-start`: non-negative byte offset
- `x-chunk-size`: positive body length

Body: raw chunk bytes

Response `200` includes a receipt digest in an `ETag` header and safe JSON containing the chunk index and accepted size.

Rules:

- Stream request bytes into the declared controlled range.
- Reject out-of-bounds ranges, mismatched body length, invalid index, and mutations after terminal state.
- Sync staged data before acknowledging the chunk.
- Count repeated accepted bytes so recovery tests can prove that acknowledged progress was not resent.

## Complete And Verify

`POST /api/uploads/{uploadId}/complete`

Response `200`:

```json
{
  "completed": true,
  "verification": "verified"
}
```

Rules:

- Require exact chunk coverage of the declared source.
- Verify byte count and required checksum against the stored manifest before promotion.
- Promote the staged original only after verification succeeds.
- A later status request reports `completed` and `verified` separately.

## Cancel

`DELETE /api/uploads/{uploadId}`

Response `204` with no body.

Rules:

- Remove only the upload's controlled staging artifact.
- Mark the session canceled and reject later chunk or completion calls.
- Repeated cancellation is safe and does not affect another upload.

## Failure Contract

- `400`: invalid request, manifest, header, body length, or range
- `404`: unknown upload ID
- `409`: lifecycle conflict, incomplete finalization, or conflicting repeated range
- `413`: example request or declared source exceeds configured limit
- `422`: stored-file integrity verification failed
- `500`: contained server failure with a generic safe message

Error responses never echo request bodies, full manifests, local paths, upload URLs, or sensitive metadata.
