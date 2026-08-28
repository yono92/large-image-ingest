# Decision Contracts: Uppy Adapter And tus-js-client Review

## Friction Evidence Standard

Each material issue discovered while building or validating the example must record:

1. a minimal reproduction tied to one required journey;
2. the user/developer consequence and severity;
3. whether responsibility belongs to documentation, application composition, large-image-ingest public API, or upstream Uppy;
4. a safe workaround, or an explicit statement that none exists;
5. evidence from a test, example location, or observed run;
6. the smallest contract change that could remove the issue.

Convenience, aesthetic preference, or code volume alone is not public API evidence.

## Uppy Adapter Decision Gate

Outcome is `specify-adapter` when either condition is true:

- **Correctness gate**: at least one mandatory acceptance scenario is unsafe or impossible through documented public APIs without duplicate upload ownership, source mutation, loss of recoverability, misleading completion, sensitive-state exposure, or private API access.
- **Repeated coordination gate**: at least two medium-or-higher friction records independently identify the same application-agnostic coordination behavior, and that behavior has one stable library-owned contract across transport and UI choices.

Otherwise the outcome is `defer`, and the recipe remains the supported surface.

If triggered, the separate Uppy adapter specification must define:

- exact ownership and non-ownership boundaries;
- selected-file and lifecycle mapping;
- progress, error, removal, pause, resume, cancellation, and completion semantics;
- React and Uppy compatibility policy;
- public types, entrypoint/package decision, dependency policy, and tree-shaking boundary;
- resume security and original-preservation guarantees;
- focused contract tests and migration/non-goals;
- why documentation or example-private code is insufficient.

No adapter implementation begins from this decision record alone.

## tus-js-client Review Gate

The follow-up brief must map one owner for each responsibility:

| Responsibility | Current owner | Candidate tus-js-client impact |
|---|---|---|
| Source slicing and chunk schedule | large-image-ingest core | tus-js-client normally owns whole-file slicing. |
| Automatic retry | large-image-ingest core | tus-js-client also has retry delays and retry decisions. |
| Progress | acknowledged core chunks | tus-js-client can report intra-request byte progress. |
| Pause and termination | large-image-ingest session/transport | tus-js-client exposes abort and optional termination. |
| Upload URL persistence | versioned large-image-ingest resume record | tus-js-client can maintain separate URL storage/fingerprints. |
| Remote offset validation | current raw tus transport | tus-js-client performs protocol resume behavior. |
| Receipts and completion evidence | large-image-ingest core/transport | tus-js-client completion callback is whole-upload oriented. |
| Parallel upload | unsupported by current session | tus-js-client can use tus concatenation and multiple partial uploads. |

The review may recommend implementation only if it demonstrates a measurable need not met safely by the current raw tus transport and chooses one non-duplicated owner for retry, resume persistence, progress, cancellation, and chunk scheduling.

Required comparison evidence:

- browser and server compatibility gained;
- protocol extensions or authentication hooks gained;
- bundle and runtime dependency cost;
- effect on current public transport, receipt, error, manifest, and resume contracts;
- migration behavior for existing persisted tus resume records;
- deterministic credential-free test strategy;
- whether a compatible internal replacement is possible or a new transport execution abstraction is required.

Allowed decisions:

- retain the current raw tus transport;
- replace its internals compatibly after proof;
- add an alternate tus-js-client adapter with explicit tradeoffs;
- first specify a transport-owned whole-file execution mode;
- no-go because authority cannot be made unambiguous.
