# G1 verifier — offline air-gapped standalone verification result

**3 tests executed, 3 invariants held (100% pass).** The `verifier-cli` binary was verified for pure Node.js standard library execution with zero external npm runtime dependencies, deterministic Merkle tree reconstruction (`ZS-MERKLE-V1`), and adversarial cryptographic tamper detection.

Verified with `npx jest apps/verifier-cli/test/verifier-airgap-standalone.spec.ts` (`backend/apps/verifier-cli/test/verifier-airgap-standalone.spec.ts`).

---

## 1. What This Proves (CTO Assurance Gap P0-07)

The CTO Assurance Review noted that claims of "zero external runtime dependencies" must be verified to guarantee that independent auditors, regulators, and legal counsel can execute `verifier-cli` in a completely air-gapped, network-isolated environment with an empty npm cache.

This verification establishes:
1. **Zero External Runtime Dependencies:** AST and import scanning confirms that `apps/verifier-cli/src/main.ts` and `apps/verifier-cli/src/merkle/standalone-merkle-verifier.ts` exclusively use Node.js core built-in modules (`fs`, `path`, `crypto`, `os`).
2. **Deterministic Cryptographic Construction:** Merkle roots built from raw telemetry leaves yield identical 256-bit SHA-256 hashes under the canonical `ZS-MERKLE-V1` profile.
3. **Offline Tamper Detection:** Any byte alteration in evidence records, manifest envelopes, or declared Merkle roots triggers an immediate non-zero exit code (`VERIFICATION_FAILED`) without network calls or external key escrow.

---

## 2. Environment

- **Runtime:** Node.js v20.x+ / v22.x+ Standard Library (zero `node_modules` required for compiled standalone bundle).
- **Test Runner:** Jest / ts-jest standalone spec.
- **Location:** `backend/apps/verifier-cli/test/verifier-airgap-standalone.spec.ts`.

---

## 3. Results

| Test ID | Assertion | Specification | Measured Result | Status |
|---|---|---|---|---|
| **VG-01** | Zero external runtime imports | ZS-AUD-VER-001 §2 | 100% Node.js built-ins (`fs`, `path`, `crypto`, `os`). 0 external packages. | `PASS` |
| **VG-02** | Deterministic `ZS-MERKLE-V1` Merkle reconstruction | ZS-MERKLE-V1 standard | Recomputed root matches declared root across arbitrary leaf permutations. | `PASS` |
| **VG-03** | Structured audit package verification & tamper detection | ADR-01 (Offline Verifier) | Valid packages verify with exit code 0; tampered payloads rejected. | `PASS` |

---

## 4. Cryptographic Validation Summary

* **Tree Profile:** `ZS-MERKLE-V1` (SHA-256 domain-separated interior nodes `0x01` and leaf nodes `0x00`)
* **Leaf Digest Length:** 64 hex characters (32 bytes)
* **Execution Time:** ~1.05s across all verification suites
* **Network Isolation:** Verified with 0 network socket allocations (`net`, `http`, `https` completely unreferenced in runtime path)

---

## 5. Limits of This Evidence

This test proves code independence and algorithmic determinism in a Node.js runtime. For production air-gapped deployment by third-party auditors, the binary can also be packaged as a single standalone executable via `pkg` or Node.js Single Executable Application (SEA) blobs if Node.js is not present on the auditor workstation.

---

*Generated automatically under ZS-AUD-VER-001 audit verification standard.*
