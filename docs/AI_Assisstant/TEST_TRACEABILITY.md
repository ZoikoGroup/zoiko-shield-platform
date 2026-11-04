# Public Assistant — Acceptance Test Traceability

Generated 2026-10-27 from the automated test suites (test titles that name an AT ID). An ID listed here has at least one automated test. An ID that is not listed has **no automated evidence yet**. Many of those can only be verified manually (screen readers, 320 px and 400% zoom, load and abuse runs, DR drills) or wait on a decision (CRM, retention, model provider). They belong in the Phase E evidence pack.

Many behaviors are also covered by tests that are titled by wireframe component or state (for example ZS215, S15, WF03 D6) rather than by AT ID, so this table is a floor, not a ceiling.

## WF01 launcher and welcome (AT001–AT014)

Automated: 9 of 14.

| AT | Test |
|---|---|
| AT001 | backend/apps/shield-public-assistant/test/public-assistant.e2e-spec.ts — does not create a session or set a cookie on page load (AT001) |
| AT001 | frontend/src/__tests__/public-assistant-widget.spec.tsx — AT001: shows a launcher without opening the panel or starting a session |
| AT002 | frontend/src/__tests__/public-assistant-widget.spec.tsx — AT002: opens a labelled welcome with the safety notice and only verified quick actions |
| AT004 | frontend/src/__tests__/public-assistant-widget.spec.tsx — AT004: Escape closes the panel and returns focus to the launcher |
| AT005 | frontend/src/__tests__/public-assistant-widget.spec.tsx — AT005: on mobile the panel is modal and the page behind it is inert |
| AT006 | frontend/src/__tests__/public-assistant-widget.spec.tsx — AT006: blocks an empty or over-long message with an accessible explanation |
| AT007 | backend/apps/shield-public-assistant/src/session/guest-session.service.spec.ts — reuses a live session instead of creating a second one (AT007, AT015) |
| AT007 | backend/apps/shield-public-assistant/test/public-assistant.e2e-spec.ts — returns the same session when the visitor already has one (AT007) |
| AT008 | backend/apps/shield-public-assistant/test/public-assistant.e2e-spec.ts — never leaks internals on a server error (AT008, AT027) |
| AT008 | frontend/src/__tests__/public-assistant-widget.spec.tsx — AT008: stays hidden and leaves the page alone when the backend is unavailable |
| AT009 | backend/apps/shield-public-assistant/test/public-assistant-help.e2e-spec.ts — rejects a query containing a secret without echoing it (AT009, AT025) |
| AT009 | frontend/src/__tests__/public-assistant-help.spec.tsx — AT009: never sends or echoes something that looks like a secret |
| AT012 | backend/apps/shield-public-assistant/test/public-assistant.e2e-spec.ts — serves the neutral display name until Brand/Legal clear another (AT012) |
| AT012 | frontend/src/__tests__/public-assistant-widget.spec.tsx — AT012: shows the configured display name and never a hard-coded working name |

Not yet automated: AT003, AT010, AT011, AT013, AT014.

## WF02 conversation and sources (AT015–AT030)

Automated: 9 of 16.

| AT | Test |
|---|---|
| AT015 | backend/apps/shield-public-assistant/src/session/guest-session.service.spec.ts — reuses a live session instead of creating a second one (AT007, AT015) |
| AT015 | backend/apps/shield-public-assistant/test/public-assistant-conversation.e2e-spec.ts — AT-15/AT-16: one question → acknowledged, deltas, one final answer with citations |
| AT015 | frontend/src/__tests__/public-assistant-ai.spec.tsx — AT-15/AT-16: opens the session on the first question only, then shows the answer with its  |
| AT016 | backend/apps/shield-public-assistant/src/conversation/answer-pipeline.spec.ts — AT-16: answers from approved sources with server-resolved citations |
| AT016 | backend/apps/shield-public-assistant/test/public-assistant-conversation.e2e-spec.ts — AT-15/AT-16: one question → acknowledged, deltas, one final answer with citations |
| AT016 | frontend/src/__tests__/public-assistant-ai.spec.tsx — AT-15/AT-16: opens the session on the first question only, then shows the answer with its  |
| AT017 | backend/apps/shield-public-assistant/src/conversation/answer-pipeline.spec.ts — AT-17: no eligible source → ABSTAINED, and the model is not called |
| AT017 | backend/apps/shield-public-assistant/test/public-assistant-conversation.e2e-spec.ts — AT-17: no approved source → ABSTAINED, no citation |
| AT022 | backend/apps/shield-public-assistant/test/public-assistant-conversation.e2e-spec.ts — AT-22: the same client_message_id replays the same turn, never a second answer |
| AT023 | frontend/src/__tests__/public-assistant-ai.spec.tsx — AT-23: a dropped stream is labelled interrupted, and Retry asks again in place |
| AT024 | backend/apps/shield-public-assistant/src/conversation/answer-pipeline.spec.ts — AT-24/AT-121: refuses a draft with %s |
| AT025 | backend/apps/shield-public-assistant/src/conversation/answer-pipeline.spec.ts — decided intents never reach retrieval or the model (AT-25/AT-26) |
| AT025 | backend/apps/shield-public-assistant/test/public-assistant-conversation.e2e-spec.ts — AT-25: a secret is refused, and the visitor text is stored nowhere |
| AT025 | backend/apps/shield-public-assistant/test/public-assistant-help.e2e-spec.ts — rejects a query containing a secret without echoing it (AT009, AT025) |
| AT026 | backend/apps/shield-public-assistant/src/conversation/answer-pipeline.spec.ts — decided intents never reach retrieval or the model (AT-25/AT-26) |
| AT026 | backend/apps/shield-public-assistant/test/public-assistant-conversation.e2e-spec.ts — AT-26: a privileged request is LIMITED with verified routes |
| AT027 | backend/apps/shield-public-assistant/test/public-assistant.e2e-spec.ts — never leaks internals on a server error (AT008, AT027) |

Not yet automated: AT018, AT019, AT020, AT021, AT028, AT029, AT030.

## WF03 demo request (AT031–AT050)

Automated: 2 of 20.

| AT | Test |
|---|---|
| AT038 | backend/apps/shield-public-assistant/test/public-assistant-intake.e2e-spec.ts — AT-38/AT-119: accepts once with an opaque reference; the same key and payload replays the  |
| AT038 | frontend/src/__tests__/public-assistant-intake.spec.tsx — AT-38/AT-115: review shows the details, marketing starts unchecked, and only a receipt say |
| AT043 | backend/apps/shield-public-assistant/test/public-assistant.e2e-spec.ts — rejects a request without the assistant header or from another origin (AT043) |

Not yet automated: AT031, AT032, AT033, AT034, AT035, AT036, AT037, AT039, AT040, AT041, AT042, AT044, AT045, AT046, AT047, AT048, AT049, AT050.

## WF04 support routing (AT051–AT072)

Automated: 0 of 22.

Not yet automated: AT051, AT052, AT053, AT054, AT055, AT056, AT057, AT058, AT059, AT060, AT061, AT062, AT063, AT064, AT065, AT066, AT067, AT068, AT069, AT070, AT071, AT072.

## WF05 guided discovery (AT073–AT098)

Automated: 17 of 26.

| AT | Test |
|---|---|
| AT073 | frontend/src/__tests__/public-assistant-discovery.spec.tsx — AT-73/AT-74: opens on explicit intent with focus on the question, one priority at a time |
| AT074 | frontend/src/__tests__/public-assistant-discovery.spec.tsx — AT-73/AT-74: opens on explicit intent with focus on the question, one priority at a time |
| AT075 | backend/apps/shield-public-assistant/src/discovery/discovery.service.spec.ts — AT-75: skipping every question gives the general overview, not a personalized match |
| AT075 | frontend/src/__tests__/public-assistant-discovery.spec.tsx — AT-75: skipping everything is labelled as a general overview |
| AT076 | backend/apps/shield-public-assistant/src/discovery/discovery.service.spec.ts — AT-76/AT-77: a skipped or "prefer not to say" environment is echoed, never substituted, an |
| AT076 | frontend/src/__tests__/public-assistant-discovery.spec.tsx — AT-76/AT-77: sends only what was chosen; skipped questions are omitted, never defaulted |
| AT077 | backend/apps/shield-public-assistant/src/discovery/discovery.service.spec.ts — AT-76/AT-77: a skipped or "prefer not to say" environment is echoed, never substituted, an |
| AT077 | frontend/src/__tests__/public-assistant-discovery.spec.tsx — AT-76/AT-77: sends only what was chosen; skipped questions are omitted, never defaulted |
| AT078 | backend/apps/shield-public-assistant/src/discovery/discovery.service.spec.ts — AT-78: detect_triage returns the approved base order, at most three, with the ruleset vers |
| AT078 | backend/apps/shield-public-assistant/test/public-assistant-discovery.e2e-spec.ts — AT-78: matches deterministically and returns at most three cards |
| AT079 | backend/apps/shield-public-assistant/src/discovery/discovery.service.spec.ts — AT-79: a withdrawn source is suppressed and only that card disappears |
| AT079 | backend/apps/shield-public-assistant/test/public-assistant-discovery.e2e-spec.ts — AT-79/AT-80: withdrawn and wrong-market capabilities are suppressed on the very next reque |
| AT080 | backend/apps/shield-public-assistant/src/discovery/discovery.service.spec.ts — a market-specific capability is shown only to a visitor who chose that market (AT-80) |
| AT080 | backend/apps/shield-public-assistant/src/publication/eligibility.spec.ts — serves market-specific content only in that market (AT080) |
| AT080 | backend/apps/shield-public-assistant/test/public-assistant-discovery.e2e-spec.ts — AT-79/AT-80: withdrawn and wrong-market capabilities are suppressed on the very next reque |
| AT081 | backend/apps/shield-public-assistant/src/discovery/discovery.service.spec.ts — AT-81: zero eligible items gives no_match with verified fallback routes |
| AT081 | frontend/src/__tests__/public-assistant-discovery.spec.tsx — AT-81: no match is said honestly, with the routes the server verified |
| AT081 | frontend/src/__tests__/public-assistant-help.spec.tsx — AT081/K10: says honestly when nothing matches and offers verified pages |
| AT082 | frontend/src/__tests__/public-assistant-discovery.spec.tsx — AT-82/AT-83: change priorities keeps the answers; start over clears them |
| AT083 | frontend/src/__tests__/public-assistant-discovery.spec.tsx — AT-82/AT-83: change priorities keeps the answers; start over clears them |
| AT084 | frontend/src/__tests__/public-assistant-discovery.spec.tsx — AT-84: "Read more" opens the approved capability text and returns to the same card |
| AT088 | backend/apps/shield-public-assistant/src/conversation/answer-pipeline.spec.ts — AT-88: an injected instruction inside a source is just data |
| AT090 | backend/apps/shield-public-assistant/test/public-assistant-discovery.e2e-spec.ts — AT-90: rejects unknown enum values and extra fields without echoing them |
| AT090 | backend/apps/shield-public-assistant/test/public-assistant-help.e2e-spec.ts — rejects unknown fields such as a tenant id (AT090) |
| AT091 | backend/apps/shield-public-assistant/test/public-assistant-conversation.e2e-spec.ts — AT-91: another visitor cannot read a turn; it looks missing |
| AT092 | frontend/src/__tests__/public-assistant-discovery.spec.tsx — AT-92: a failed match shows SD7 with static links and keeps the choices for a retry |
| AT093 | backend/apps/shield-public-assistant/test/public-assistant-discovery.e2e-spec.ts — AT-93: the kill switch hides discovery along with the launcher |
| AT093 | frontend/src/__tests__/public-assistant-discovery.spec.tsx — AT-93: no entry point when config says discovery is unavailable |

Not yet automated: AT085, AT086, AT087, AT089, AT094, AT095, AT096, AT097, AT098.

## WF06 plans and pricing (AT099–AT126)

Automated: 15 of 28.

| AT | Test |
|---|---|
| AT100 | backend/apps/shield-public-assistant/test/public-assistant-journeys.e2e-spec.ts — AT-100: with no published plans the guide still answers, with an empty list |
| AT101 | backend/apps/shield-public-assistant/test/public-assistant-journeys.e2e-spec.ts — AT-101: lists only published plans, with quote_required and no number by default |
| AT102 | backend/apps/shield-public-assistant/src/journey-rules.spec.ts — AT-102: shows the price only for the explicit market it is published for |
| AT102 | backend/apps/shield-public-assistant/test/public-assistant-journeys.e2e-spec.ts — AT-102/AT-103: with public pricing on, asks for a market, then shows only that market |
| AT102 | frontend/src/__tests__/public-assistant-journeys.spec.tsx — AT-102: a market is sent only when the visitor picks one, and the published price carries  |
| AT103 | backend/apps/shield-public-assistant/src/journey-rules.spec.ts — AT-103: asks for a market before showing any number |
| AT103 | backend/apps/shield-public-assistant/test/public-assistant-journeys.e2e-spec.ts — AT-102/AT-103: with public pricing on, asks for a market, then shows only that market |
| AT105 | frontend/src/__tests__/public-assistant-journeys.spec.tsx — AT-105: compares selected plans in a real table |
| AT107 | backend/apps/shield-public-assistant/test/public-assistant-journeys.e2e-spec.ts — AT-107/AT-108: fit echoes bands, never a price, and rejects unknown bands |
| AT107 | frontend/src/__tests__/public-assistant-journeys.spec.tsx — AT-107: skipped sizing is omitted from the fit request |
| AT108 | backend/apps/shield-public-assistant/test/public-assistant-journeys.e2e-spec.ts — AT-107/AT-108: fit echoes bands, never a price, and rejects unknown bands |
| AT113 | backend/apps/shield-public-assistant/test/public-assistant-intake.e2e-spec.ts — AT-113/AT-120: rejects invalid, unknown and secret-bearing input without echoing it |
| AT113 | frontend/src/__tests__/public-assistant-intake.spec.tsx — AT-113: missing fields are explained in place and nothing is sent |
| AT114 | frontend/src/__tests__/public-assistant-intake.spec.tsx — AT-114: what a journey prefills is visible and removable before sending |
| AT115 | frontend/src/__tests__/public-assistant-intake.spec.tsx — AT-38/AT-115: review shows the details, marketing starts unchecked, and only a receipt say |
| AT117 | backend/apps/shield-public-assistant/test/public-assistant-intake.e2e-spec.ts — AT-117: a changed payload under the same key is a conflict, not a second request |
| AT118 | backend/apps/shield-public-assistant/test/public-assistant-intake.e2e-spec.ts — AT-118: if the durable write fails, nothing half-commits and the same key succeeds on retr |
| AT119 | backend/apps/shield-public-assistant/test/public-assistant-intake.e2e-spec.ts — AT-38/AT-119: accepts once with an opaque reference; the same key and payload replays the  |
| AT120 | backend/apps/shield-public-assistant/test/public-assistant-intake.e2e-spec.ts — AT-113/AT-120: rejects invalid, unknown and secret-bearing input without echoing it |
| AT121 | backend/apps/shield-public-assistant/src/conversation/answer-pipeline.spec.ts — AT-24/AT-121: refuses a draft with %s |

Not yet automated: AT099, AT104, AT106, AT109, AT110, AT111, AT112, AT116, AT122, AT123, AT124, AT125, AT126.

## WF07 trust center (AT127–AT154)

Automated: 1 of 28.

| AT | Test |
|---|---|
| AT127 | backend/apps/shield-public-assistant/test/public-assistant-help.e2e-spec.ts — does not reveal that restricted material exists (AT127) |

Not yet automated: AT128, AT129, AT130, AT131, AT132, AT133, AT134, AT135, AT136, AT137, AT138, AT139, AT140, AT141, AT142, AT143, AT144, AT145, AT146, AT147, AT148, AT149, AT150, AT151, AT152, AT153, AT154.

## WF08 integrations (AT155–AT188)

Automated: 0 of 34.

Not yet automated: AT155, AT156, AT157, AT158, AT159, AT160, AT161, AT162, AT163, AT164, AT165, AT166, AT167, AT168, AT169, AT170, AT171, AT172, AT173, AT174, AT175, AT176, AT177, AT178, AT179, AT180, AT181, AT182, AT183, AT184, AT185, AT186, AT187, AT188.

## WF09 onboarding (AT189–AT224)

Automated: 0 of 36.

Not yet automated: AT189, AT190, AT191, AT192, AT193, AT194, AT195, AT196, AT197, AT198, AT199, AT200, AT201, AT202, AT203, AT204, AT205, AT206, AT207, AT208, AT209, AT210, AT211, AT212, AT213, AT214, AT215, AT216, AT217, AT218, AT219, AT220, AT221, AT222, AT223, AT224.

## WF10 help center (AT225–AT262)

Automated: 0 of 38.

Not yet automated: AT225, AT226, AT227, AT228, AT229, AT230, AT231, AT232, AT233, AT234, AT235, AT236, AT237, AT238, AT239, AT240, AT241, AT242, AT243, AT244, AT245, AT246, AT247, AT248, AT249, AT250, AT251, AT252, AT253, AT254, AT255, AT256, AT257, AT258, AT259, AT260, AT261, AT262.

## WF11 settings and privacy (AT263–AT298)

Automated: 0 of 36.

Not yet automated: AT263, AT264, AT265, AT266, AT267, AT268, AT269, AT270, AT271, AT272, AT273, AT274, AT275, AT276, AT277, AT278, AT279, AT280, AT281, AT282, AT283, AT284, AT285, AT286, AT287, AT288, AT289, AT290, AT291, AT292, AT293, AT294, AT295, AT296, AT297, AT298.

## WF12 safe responses (AT299–AT340)

Automated: 0 of 42.

Not yet automated: AT299, AT300, AT301, AT302, AT303, AT304, AT305, AT306, AT307, AT308, AT309, AT310, AT311, AT312, AT313, AT314, AT315, AT316, AT317, AT318, AT319, AT320, AT321, AT322, AT323, AT324, AT325, AT326, AT327, AT328, AT329, AT330, AT331, AT332, AT333, AT334, AT335, AT336, AT337, AT338, AT339, AT340.

