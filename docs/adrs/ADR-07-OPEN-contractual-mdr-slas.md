# ADR-07 (OPEN) — Contractual MDR SLAs and service credits

**Status: OPEN. No decision has been made.** An SLA is a contractual promise
with financial consequences. Engineering can measure what the platform does;
it cannot decide what the company promises.

## Decision required

Which MDR service levels become contractual commitments, with what measurement
definitions, what exclusions, and what service credits apply when they are
missed.

## Current state in the code

`incidentResponseSlaHours` is `null` on every plan tier, and
`check:public-capability-claims` fails the build if any tier publishes an SLA.
Internal SOC SLA clocks exist and run per case (`CaseSlaClock`, severity-based
targets), but those are internal SLOs used for queue management. They are not
customer promises and must not be presented as any.

## What is blocked

- Any customer-facing SLA or service-credit commitment.
- Public MDR response-time claims.
- Pilot commitments beyond explicitly limited, measurable, written terms.

## What closing it requires

A named approver recording the committed levels, the measurement method for
each, the exclusions, and the credit schedule. Note the dependency: an SLA
promised before the scale envelope is met is a promise the platform has not
been shown able to keep. Measured sustained ingestion is currently ~60
events/sec against a 15,000/sec envelope
(`docs/evidence/g1-ingestion-load-test.md`).
