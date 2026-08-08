# Data Model: Extreme-File Execution

## Checksum Executor

| Field | Type | Rule |
| --- | --- | --- |
| `calculate` | async function | Returns the existing `FileChecksum` contract |

## Worker Protocol v1

Request fields: `protocol`, `requestId`, `file`, `algorithm`, `chunkSize`.

Response variants:

- progress: request ID plus existing checksum progress fields;
- result: request ID plus `FileChecksum`;
- error: request ID plus a safe stable code and message.

Unknown protocol versions, response variants, request IDs, and malformed scalar fields are rejected.

## Upload Execution Options

| Field | Type | Rule |
| --- | --- | --- |
| `maxParallelChunks` | integer | 1..32, default 1 |

No persistent artifact schema changes. Effective execution state is ephemeral; receipts and resume progress remain the durable truth.
