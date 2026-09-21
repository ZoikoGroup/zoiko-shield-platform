# ADR-009: Canonical Sovereign AI Model Provider (GCP Vertex AI & ModelArmor) and BYOM Multi-Vendor Governance

## Status
**Accepted** (Ratified per Sovereign AI Architecture Standard)

## Date
2026-09-21

## Context
ZoikoShield integrates autonomous AI copilot workflows, real-time alert triage, automated Root Cause Analysis (RCA), and incident decision envelopes. Operating in regulated, sovereign, and multi-tenant environments requires strict controls around:
1. **Data Sovereignty & Zero Training Commitments**: Telemetry, security alerts, and customer configuration payloads must not be utilized for foundational model retraining or stored outside customer-designated sovereign regions.
2. **Deterministic Output & Schema Conformance**: Copilot decisions, containment proposals, and RCA graphs must adhere strictly to typed schema contracts (OCSF, JSON Schema) with zero hallucinations in security-critical actions.
3. **Guardrails & Prompt Injection Defense**: Pre-flight and post-flight sanitization must prevent prompt injection, jailbreaking, and data leakage before tokens enter or leave model execution runtimes.
4. **Customer BYOM (Bring Your Own Model) & Multi-Vendor Governance**: Regulated enterprise tenants require options to route intelligence tasks to their own sovereign cloud tenants (AWS Bedrock, Azure OpenAI, self-hosted LLMs) and perform multi-model drift evaluation per §21 / §24 PSI (Population Stability Index) specifications.

## Decision
We formally ratify **Google Cloud Vertex AI** with **GCP ModelArmor** as the canonical primary AI provider for ZoikoShield sovereign platform operations.

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
