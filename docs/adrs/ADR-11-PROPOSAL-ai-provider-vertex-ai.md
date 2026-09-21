# ADR-11 (Proposal): AI Providers, Models and Data Terms — Vertex AI / Gemini

## Status
**Proposed — not accepted.** Nothing in this record is ratified.

This was first filed as "ADR-009 … Accepted (Ratified per Sovereign AI Architecture Standard)". That was incorrect on three counts, per the Combined Engineering Specification §30.2 Gate-0 ADR Set:

| Item | Specification | As originally filed |
| --- | --- | --- |
| Number | ADR-09 is **Evidence canonicalization and digest profile**; AI providers are **ADR-11** | ADR-009 |
| Owner / acceptor | **AI Risk Committee / Security / Legal** | Self-ratified by engineering |
| Deadline | Before production AI | — |
| Default until accepted | **Gateway only; no customer training; deterministic fallback** | Vertex AI declared canonical |
| Acceptance proof | **DPA / region / retention, evaluation and kill-switch evidence** | None attached |

"Sovereign AI Architecture Standard" does not exist in the controlled specification set. The specification also requires provider neutrality (§4324: provider selection "may not leak into domain contracts"; §4452 lists "provider product names treated as architecture" as an anti-pattern).

## Date
Proposed 2026-09-21. Re-classified as a proposal the same day.

## Current implementation state (verified against the code)

- `ModelArmorSafetyGatewayService` (`shield-ai/src/gateway/`) is a **local regex prompt-injection filter**, not Google Cloud Model Armor, and **no inference path calls it**. The "mandatory ModelArmor Guardrails Proxy" below does not exist yet.
- `gemini-1.5-pro-002` appears only as `pinnedModelVersion` metadata in `ai-use-case-registry.service.ts`; it does not select a model at runtime.
- The Gemini and OpenAI providers return a canned "safe offline" response when no API key is configured or the call fails.
- Claims below about zero retention, regulatory satisfaction (EU AI Act, NIST AI RMF, ISO 42001) and "zero hallucinations" are **unevidenced** and must not be repeated as facts until the acceptance proof above exists.

---

*The remainder is the original proposal text, kept for the ADR-11 decision owners to evaluate. Read "We formally ratify" as "We propose".*

## Context
ZoikoShield integrates autonomous AI copilot workflows, real-time alert triage, automated Root Cause Analysis (RCA), and incident decision envelopes. Operating in regulated, sovereign, and multi-tenant environments requires strict controls around:
1. **Data Sovereignty & Zero Training Commitments**: Telemetry, security alerts, and customer configuration payloads must not be utilized for foundational model retraining or stored outside customer-designated sovereign regions.
2. **Deterministic Output & Schema Conformance**: Copilot decisions, containment proposals, and RCA graphs must adhere strictly to typed schema contracts (OCSF, JSON Schema) with zero hallucinations in security-critical actions.
3. **Guardrails & Prompt Injection Defense**: Pre-flight and post-flight sanitization must prevent prompt injection, jailbreaking, and data leakage before tokens enter or leave model execution runtimes.
4. **Customer BYOM (Bring Your Own Model) & Multi-Vendor Governance**: Regulated enterprise tenants require options to route intelligence tasks to their own sovereign cloud tenants (AWS Bedrock, Azure OpenAI, self-hosted LLMs) and perform multi-model drift evaluation per §21 / §24 PSI (Population Stability Index) specifications.

## Decision
We propose **Google Cloud Vertex AI** with **GCP ModelArmor** as the canonical primary AI provider for ZoikoShield sovereign platform operations.

### Key Architectural Tenets:
1. **Canonical Model Tiering**:
   - **Primary Complex Reasoning & RCA**: `vertex-ai/gemini-1.5-pro-002` (Long-context multi-event correlation, graph-based root cause analysis, automated remediation plan drafting).
   - **High-Throughput / Real-Time Triage**: `vertex-ai/gemini-2.0-flash` (Sub-second anomaly classification, initial severity scoring, structured OCSF mapping).
2. **Mandatory ModelArmor Guardrails Proxy**:
   - Every inference request processed by `shield-ai` must pass through the **ModelArmor Guardrails Proxy** prior to model tokenization.
   - Enforces prompt injection detection, PII/secret scrubbing, tenant data masking, and content safety filters.
   - Outbound responses are validated for schema adherence and non-leakage of raw system prompts.
3. **Pluggable BYOM & Multi-Vendor Architecture**:
   - The `shield-ai` service retains pluggable multi-vendor adapters (`vertex-ai`, `bedrock`, `azure-openai`, `anthropic`, `local-llm`).
   - Tenant configuration controls provider routing: default platform tenants use the canonical Vertex AI infrastructure, while enterprise tenants can supply sovereign BYOM credentials.
   - Multi-vendor adapters are utilized in §21 and §24 multi-model consensus evaluation and drift detection harnesses.
4. **Cryptographic Decision Envelopes & Evidence Anchor Commitment**:
   - Every AI-generated remediation suggestion or triage assessment is sealed in a deterministic `CopilotDecisionEnvelope`.
   - The envelope contains: `model_id`, `provider`, `prompt_hash`, `reasoning_trace_hash`, `modelarmor_filter_result`, `timestamp`, and the HMAC/ECDSA signature.
   - Sealed envelopes are submitted to `shield-anchor` for Merkle tree aggregation and immutable audit logging.

## Consequences

### Positive:
- **Unified Sovereign Security**: Guarantees zero data retention for training, enterprise-grade regional data residency, and native integration with GCP Sovereign Cloud / Google Cloud KMS.
- **Ultra-Fast Structured Inferences**: Native JSON schema constrained generation with Gemini models minimizes parsing errors and eliminates prompt drift in automated security orchestration.
- **Enterprise Compliance Alignment**: ModelArmor integration satisfies regulatory compliance frameworks (EU AI Act, NIST AI RMF, ISO 42001) with cryptographic evidence backing every copilot suggestion.
- **Vendor Independence via BYOM**: Customers maintain sovereignty by retaining the ability to switch inference backends without altering platform business logic.

### Trade-offs:
- Strict schema enforcement requires schema validation fallback handlers in `shield-ai` when upstream model formats undergo minor version increments.
- Offline and air-gapped deployments require the local vLLM / Ollama container adapter with pre-downloaded quantized open-weights models.
