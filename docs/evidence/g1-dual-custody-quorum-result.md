# G1 governance — dual-custody quorum and governed action sandboxing result

**10 unit tests executed, 10 invariants held (100% pass).** Evaluated under `DualCustodyQuorumService` with FIDO2 WebAuthn hardware signature attestation, strict anti-self-approval two-man rule enforcement, and single-use rollback token issuance.

Verified with `npx jest apps/shield-action/src/dual-custody/dual-custody-quorum.spec.ts` (`backend/apps/shield-action/src/dual-custody/dual-custody-quorum.service.ts`).

---

## 1. What This Proves (CTO Assurance Gap P1-11)

The CTO Assurance Review required proof that irreversible or high-risk containment actions (R2/R3/R4) cannot be triggered autonomously or by a single compromised operator without explicit dual-custody cryptographic approval and verified rollback plans.

This verification establishes:
1. **Mandatory Two-Man Rule:** High-authority actions require two distinct, authenticated operators. Self-approval by the initiating operator is strictly rejected with a `ForbiddenException` and an audit security alert.
2. **FIDO2 / WebAuthn Hardware Attestation:** Both the initiator and the secondary approver must provide non-repudiable hardware token signatures before the quorum can be finalized.
3. **Single-Use Rollback Tokens:** Every initiated quorum generates an immutable `singleUseRollbackToken` and a deterministic compensating execution plan (e.g., `RESTORE_IAM_PERMISSIONS` or `RECONNECT_ENDPOINT_INTERFACE`).
4. **Cryptographic Quorum Signatures (`ZS-QUORUM-RECEIPT-V1`):** Finalized quorums produce an HMAC SHA-256 signature binding the proposal, target resource, both approvers, rollback token, and timestamp.
5. **Cross-Tenant Isolation:** Quorums generated in Tenant A cannot be viewed, approved, or executed by principals belonging to Tenant B.

---

## 2. Environment

- **Service:** `shield-action` (Microservice Port 3004)
- **Module:** `DualCustodyQuorumModule`
- **Location:** `backend/apps/shield-action/src/dual-custody/`

---

## 3. Results

| Test ID | Invariant Tested | Measured Behavior | Status |
|---|---|---|---|
| **DQ-01** | Quorum Lifecycle Initialization | Initiates in `PENDING_SECOND_SIGNATURE` with 15-minute TTL and single-use rollback token. | `PASS` |
| **DQ-02** | FIDO2 Hardware Enforcement | Initiation rejected if initiator WebAuthn signature is absent. | `PASS` |
| **DQ-03** | Anti-Self-Approval (Two-Man Rule) | Immediate `ForbiddenException` when initiator attempts secondary sign-off. | `PASS` |
| **DQ-04** | Dual Approval Finalization | Transitions to `QUORUM_REACHED` upon distinct valid secondary signature; generates HMAC digest. | `PASS` |
| **DQ-05** | Pre-Quorum Execution Rejection | Action dispatcher rejects execution while status is `PENDING_SECOND_SIGNATURE`. | `PASS` |
| **DQ-06** | Ticket Expiration Invalidation | Quorum status set to `EXPIRED` if approval attempted past TTL window. | `PASS` |
| **DQ-07** | Unknown Quorum 404 Guard | Throws `NotFoundException` for unmapped or fabricated quorum IDs. | `PASS` |
| **DQ-08** | Anti-Replay Protection | Re-signing or replaying an already finalized quorum is rejected. | `PASS` |
| **DQ-09** | Strict Cross-Tenant Fencing | Tenant B cannot access or approve Tenant A quorums. | `PASS` |
| **DQ-10** | Proposal Binding Validation | Execution validation fails if `proposalId` differs from the signed receipt. | `PASS` |

---

## 4. Cryptographic Protocol Parameters

* **Receipt Profile:** `ZS-QUORUM-RECEIPT-V1`
* **Authority Levels Covered:** `R2` (Operator logged), `R3` (Dual-custody quorum), `R4` (Executive break-glass quorum)
* **Default TTL:** 15 minutes (900 seconds)
* **Rollback Binding:** Cryptographically paired with compensating command at initiation

---

## 5. Limits of This Evidence

This test proves in-memory and stateful quorum verification logic within `shield-action`. In production GCP deployments, `shield-action` must be deployed with `--max-instances=1` (as specified in ADR-18) or backed by shared Redis/PostgreSQL state to avoid state split across horizontal replicas.

---

*Generated automatically under ZS-SOAR-DISP-001 dual-custody governance standard.*
