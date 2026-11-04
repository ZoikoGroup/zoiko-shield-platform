# ADR-021: Public Assistant Architectureproposal

Status: engineering proposal. Decisions pendingOwner input where noted.

Context
- We are implementing a public chatbot surface for ZoikoShield that operates on a separate backend app (shield-public-assistant) and a frontend widget. The public surface must be isolated from tenant data and authenticated surfaces, and should only access approved public content.
- The current codebase includes a functioning shield-public-assistant backend and a Next.js frontend with a proxy to a strict upstream public API, but a formal ADR documenting the architecture and the decisions is missing.

Decision summary (high level)
- D1 Backend separation: Create a dedicated backend/ app at backend/apps/shield-public-assistant with its own DB role and no route to tenant data. The app uses its own public schema and a restricted network boundary.
- D2 Frontend widget: Public assistant widget lives in frontend/src/components/public-assistant behind a strict same-origin proxy at /api/public/chat/v1 and is lazy-loaded to minimize impact on host page performance.
- D3 Canonical API: Use a single public API surface at /api/public/chat/v1 with a well-defined contract (config, status, sessions, messages, events, etc.). A strict proxy forwards requests to the BFF, strips sensitive headers, and does not fabricate responses if the BFF is down.
- D4 Content governance: Content-as-code stored in backend/apps/shield-public-assistant/content, codified with CODEOWNERS and a content publish flow. Content is filtered by eligibility and window when served.
- D5 AI flow and provider: AI is controlled by feature flags. The default for production disables AI unless ADR-11 is accepted. The public assistant will start with mock/provider-off and a defensive guardrails in place for safety and compliance.
- D6 Data model: Introduce Prisma schema for public assistant data to back guest sessions, messages, sources, and content chunks. The initial schema provides a minimal viable structure for Phase A. A migration plan will be prepared later.

Option rationale
- Separation reduces risk to tenant data and ensures public content surface is auditable and governable.
- A strict proxy enforces same-origin policy and prevents leakage of internal cookies/headers.
- Content-as-code enables reproducible governance and traceability.

Open questions / Next steps
- ADR-11 model provider adoption: confirm provider and DPAs; update configs and flags accordingly.
- OpenAPI: finalize docs/public-assistant.openapi.yaml detailing all endpoints with request/response schemas.
- Prisma: finalize public-assistant.prisma schema and implement migrations.
- Gatekeeping: define entry points for the widget (marketing site vs host app) and determine how to expose launcher UI.

Link to implementation
- Backend: shield-public-assistant module and frontend: public-assistant components are implemented in the repository; see backend/apps/shield-public-assistant and frontend/public-assistant directories.
