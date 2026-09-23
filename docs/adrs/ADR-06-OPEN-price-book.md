# ADR-06 (OPEN) — First approved price book

**Status: OPEN. No decision has been made.** Pricing is a Finance and
Commercial decision. This record states what the code does while it is open,
so nobody has to infer it.

## Decision required

The first approved, versioned offer and price book: protected-resource
definitions, telemetry and retention charging posture, managed-service
economics, partner margin thresholds, discounts, overages, minimums and
renewal rules.

## Current state in the code

`DRAFT_PLAN_TIERS` carries no prices. Every tier has `monthlyUsd: null`,
`annualBilledMonthlyUsd: null` and `isContractOnly: true`.
`check:public-capability-claims` fails the build if a tier publishes a price,
so the absence is enforced rather than merely observed.

Design-partner pricing is bespoke, which is what the Commercial standard
(ZS-COM-BILL-001) says is permitted while this ADR is open.

## What is blocked

- Any public price on any surface.
- Automatic production price mapping in CPQ or billing.
- A public plan taxonomy. The standard explicitly refuses to invent
  Essentials/Professional-style plan names before the price book exists.

## What closing it requires

Finance and Commercial approving one versioned price book that engineering,
CPQ, billing, the website and support all consume. Until then the enforcement
above stays in place and should not be relaxed to "unblock" a demo.
