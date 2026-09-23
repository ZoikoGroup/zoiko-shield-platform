# ADR-05 (OPEN) — Certified EDR response partner

**Status: OPEN. No decision has been made. This record exists so the decision
is visible and blocked work is traceable to it, not to propose an answer.**

A decision here commits the company to a vendor relationship and to what the
product tells customers it can do to their endpoints. That is a business and
legal decision, and it is not engineering's to make or to pre-empt.

## Decision required

Which EDR vendor, if any, is a *certified response partner* — meaning
ZoikoShield may take containment actions in that vendor's product on a
customer's behalf, under a named integration agreement.

This is narrower than "which EDR do we read telemetry from". Reading telemetry
needs a read-only credential the customer grants. Taking a containment action
is acting inside someone else's security product, and needs an agreement that
says we may.

## Current state in the code

Connector providers exist for `crowdstrike`, `sentinelone`, `cortex-xdr` and
`microsoft-defender`. These are **ingestion** connectors: they normalize
telemetry. None of them executes a response action against the vendor.

The response adapters in shield-action do not call any vendor API at all.
Every live path is closed behind the G1 fail-closed rule and raises
`ForbiddenException` rather than acting. Simulation is genuinely simulated.

So nothing in the product currently depends on this decision being made — but
nothing can move past simulation until it is.

## What is blocked

- R2+ live containment of any kind (isolate host, kill process, quarantine).
- Any customer-facing statement that ZoikoShield "responds" rather than
  "recommends", for any specific vendor.
- The response adapter work itself: an adapter cannot be written against an
  API contract nobody has agreed to.

## What closing it requires

A named approver recording: the vendor, the scope of actions permitted, the
agreement that authorises them, the credential model, and the rollback
obligation. Until that exists, this stays OPEN and live response stays closed.
