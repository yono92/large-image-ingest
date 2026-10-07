# Developer Trials And Actual Adoption

Use this process to observe whether developers can adopt the SDK and whether known projects keep using it. The [controlled integration comparison](adoption-evidence.md) measures fixtures; it does not establish external usability or adoption.

## Start A Local Record

```bash
mkdir -p .local-adoption
cp docs/adoption-observations.template.json .local-adoption/observations.json
npm run adoption:report -- --input .local-adoption/observations.json
```

An empty record reports `no-external-observations`, null success rates and `actualAdoption: unknown`. A zero **known observed** project count does not mean zero users. No SDK runtime telemetry or network requests are added.

## First-Time Developer Trial

Start with three independent developers who have not previously integrated this SDK. Three is an initial learning target, not evidence of representative population-wide performance. Ask each participant to complete the same tasks in a clean environment:

1. Follow the README and run the minimum example. Start the timer before installation.
2. Confirm the stored original verifies. Transfer completion alone is insufficient.
3. Run the full workflow, observe pause/reconstruction/resume and persisted evidence.
4. Attempt adapting one example to their intended transport or storage; record the first blocker even if they later solve it.
5. Record each journey's success, blocked or abandoned outcome, time and any human assistance. Do not discard unsuccessful trials.

Let developers use the documentation. Record human hints as `assistance: human`; do not quietly coach a trial and describe it as independent success. End an abandoned trial explicitly. When timing is missing, use `finishedAt: null` for blocked/abandoned outcomes; a success requires a recorded finish time and stored verification.

The maintainer's smoke runs and automated tests prove executable examples, not external first-time usability. Classify them as `maintainer` or `automation`. External trials must come from real observations; the tool does not manufacture participants or contact anyone.

Trial fields (all required):

| Field | Meaning |
| --- | --- |
| `trialId`, `participantId` | Stable pseudonymous IDs such as `trial-001`, `participant-001` |
| `participantKind` | `external-developer`, `maintainer`, `automation` |
| `firstTime` | Whether this is a first-time integration observation |
| `libraryVersion` | Exact package version, such as `1.8.1` |
| `journey` | `minimal-upload` or `verified-workflow` |
| `environment` | `node` or `browser` |
| `assistance` | `none` or `human` |
| `startedAt`, `finishedAt` | ISO timestamps with timezone; finish may be null for unsuccessful trials |
| `outcome` | `success`, `blocked`, `abandoned` |
| `storedVerified` | Independent stored-original verification succeeded |
| `evidencePersisted` | Workflow evidence persistence succeeded |
| `blockers` | Unique codes from `install`, `documentation`, `server`, `storage`, `verification`, `recovery`, `environment`, `other` |

For successful `verified-workflow` trials, both verification and evidence persistence must be true. Reported blockers can include a blocker later solved during a successful trial. The report chooses the earliest first-time trial per participant/journey, so repeated attempts cannot inflate first-attempt success. Success-rate denominator includes blocked and abandoned trials. Successful duration medians include assisted trials; inspect assistance counts before making ease-of-use claims.

## Known Project Observations

Record evidence from actual maintainers or deployment review using these required fields:

| Field | Meaning |
| --- | --- |
| `projectId` | Stable pseudonymous project ID |
| `observedAt` | Timestamp with timezone for this observation |
| `libraryVersion` | Observed SDK version |
| `kind` | `external`, `internal`, `example`, `test` |
| `status` | `evaluating`, `active`, `discontinued` |
| `evidenceKind` | `self-reported` or `maintainer-reviewed` |
| `evidenceRef` | Safe opaque reference to separately retained evidence, e.g. `review-001` |

An active project is reported or reviewed as using the SDK in its application during the observation, rather than just evaluating the sample. The latest observation determines a project's status; each stable ID counts once. SDK examples/test harnesses are excluded. Self-reported and reviewed active counts stay separate. Keep project identity stable when its version changes or it stops using the SDK.

Do not put personal names, email addresses, customer filenames, metadata, credentials, manifests, URLs or filesystem paths in observation records. Keep any private evidence and pseudonym mapping separately under the application's existing access controls. Local observation files are ignored by Git and npm; the summary omits individual IDs and raw timestamps.

## Review And Act

Compare the same journeys and package versions; do not merge trials into npm downloads. Inspect installation, documentation, server and storage blockers first. Use first-attempt success, time and assistance to choose the next onboarding correction. Revisit known project observations on a consistent schedule and retain evaluating/discontinued records. Downloads and public dependents remain separate discovery signals, never confirmed project counts.

As of the 2026-10-07 investigation, GitHub's public dependency graph showed no dependents and external code search found no references. Private adoption and external developer outcomes remain unknown. This initial source check is not a participant trial or an active-project record.
