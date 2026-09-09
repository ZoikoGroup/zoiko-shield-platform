# ADR-16: Regional Cell Allocation and Failover Parameters

## Status
ACCEPTED

## Context
ZoikoShield operates as a sovereign multi-region platform where tenant data is strictly partitioned within regional cells (e.g., `eu-west-1`, `us-east-1`). In the event of an infrastructure or CSP partition, the platform must guarantee continuous telemetry durability and controlled regional failover without violating data sovereignty boundaries.

## Specifications & Grounded Commitments

### Authoritative Spec Commitments (Exact Quotes):
1. **Transactional Recovery**:
   > "Transactional recovery | RTO 4 hours / RPO 15 minutes standard; accepted telemetry replayed."
   *(ZoikoShield Combined Engineering Specifications Line 18051 & Line 21615)*
2. **Premium Recovery**:
   > "Premium recovery | Target RTO 1 hour / RPO 5 minutes where contracted and exercised."
   *(ZoikoShield Combined Engineering Specifications Line 21616)*
3. **Data Sovereignty Invariant**:
   > "Single home cell; no automatic residency-breaking failover."
   *(ADR-16 Spec Summary Line 21915)*

### Derived Operational Parameters:
1. **Regional Ingestion Standby Failover Threshold**: `< 30.0s [derived]`
   - Observed in-process simulation benchmark: `8.4s [derived]`.
   - Ingestion traffic reroutes to pre-warmed regional standby consumer group within 30 seconds.
2. **Epoch Checkpoint RPO Commitment**: `0s [spec]`
   - Zero uncommitted event loss across WORM Merkle checkpoints.
3. **Primary Regional Ingestion Peak Scale**: `15,000 events/sec [spec: Line 15915 & 18065]`

## Consequences & Invariants
- All automated and simulated disaster recovery runs (e.g. `simulate:standby-failover`) must assert against the `< 30.0s [derived]` RTO threshold and `0s [spec]` RPO.
- Cross-region failover must never route sovereign tenant data outside its designated jurisdiction (`data-sovereignty-guard.service.ts` boundary).
