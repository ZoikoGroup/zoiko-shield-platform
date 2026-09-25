# G1 resilience — game-day drill result

**5 drills executed, 5 invariants held.** Faults were injected by stopping
real services; every line below was observed, not asserted.

Run with `npm run gameday -- --tenant <uuid> --connector <uuid>`
(`backend/scripts/run-gameday-drills.ts`).

## What this replaces

`run-lab18-gameday-drills.ts` declares, per scenario, an `expectedBehavior`
string and `invariantStatus: 'NOT_EXECUTED'`. It is a description of what
should happen if somebody ran the drill. Nothing is stopped, no request is
sent and no invariant is observed. It is honest about itself, but a resilience
claim needs evidence, and a description is not evidence.

## Environment

Local docker-compose stack. Drills stop and start real containers, so the
runner refuses to operate with `NODE_ENV=production`.

## Results

| ID | Drill | Invariant | Observed | Result |
|---|---|---|---|---|
| GD-01 | Forged webhook signature | Rejected 401; event never enters the pipeline | HTTP 401 | PASS |
| GD-02 | Replay with a consumed nonce | First accepted, identical replay refused | 202 then 401 | PASS |
| GD-03 | Alert promotion while shield-core is stopped | Fails loudly (5xx), reports no caseId | HTTP 503, no caseId | PASS |
| GD-04 | Ingestion while Kafka is stopped | Refused, or accepted and still recoverable after Kafka returns — never silently lost | Accepted 202; RawEvent present after recovery | PASS |
| GD-05 | Ingestion while object storage is stopped | Answers definitively rather than hanging | HTTP 202 | PASS |

## Notes on individual drills

**GD-03** is the drill that matters most for the case flow. shield-ingest's
promotion used to mark an alert `PROMOTED_TO_CASE` and return a
`caseCandidatePayload` describing a case that was never created. With
shield-core stopped it now returns 503 and claims no case id, so a caller
learns the promotion did not happen.

The probe mints a workload identity token, because shield-ingest's API
authenticates services rather than user sessions. An earlier version of this
drill used a user session and got a 401 — it was measuring the auth guard, not
the behaviour under fault. A drill that cannot reach the code path it claims
to test is worth less than no drill, because it reports a result.

**GD-04** treats either refusal or durable acceptance as a pass, because both
are defensible. Silent loss is the failure being tested for. The platform
accepted the event and the RawEvent row was present after Kafka returned.

## Limits of this evidence

Five drills against one machine. This covers dependency loss, replay and
forgery. It does not cover partial failure (a dependency that is slow rather
than absent), network partition between services, disk exhaustion, or
failure under concurrent load — the drills run against an idle stack. Those
remain untested, and G1 resilience should not be recorded as complete on the
strength of this file alone.
