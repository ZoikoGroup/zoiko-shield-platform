/**
 * ZS-UX-EMTI-001 Appendix A — exact user-facing microcopy (American English).
 *
 * These strings are reproduced verbatim from the handoff. Pages import them
 * from here instead of paraphrasing, so a wording change happens in one place
 * and the tests can assert on the canonical text.
 */
export const EMAIL_COPY = {
  NO_CONNECTED_SOURCE:
    "No email security sources connected. Connect a supported provider to view security findings and coverage.",
  SOURCE_LAG:
    "Security data is delayed. Threat totals may be incomplete for this period.",
  READ_ONLY_CONSENT:
    "ZoikoShield will read supported security alerts. It will not access your message contents or change mailboxes in this setup.",
  SCOPE_UNAVAILABLE:
    "This source does not provide the requested events under the current permissions or provider plan.",
  PERMISSION_DENIAL:
    "You don’t have permission to view this information. Contact your organization’s security administrator.",
  UNVERIFIED_PROOF:
    "This record has not yet passed independent verification. Review its provenance and coverage status.",
  VALID_PROOF_WITH_GAP:
    "The captured evidence is intact. Some source events may be missing for this period.",
  RESPONSE_GATE:
    "Mailbox actions are not enabled for this organization. Security review and separate authorization are required.",
  AI_UNCERTAIN:
    "The available evidence is insufficient for a reliable conclusion. An analyst must review this finding.",
} as const;

export type EmailCopyKey = keyof typeof EMAIL_COPY;

/** Additional state copy used alongside Appendix A (not part of the canonical list). */
export const EMAIL_STATE_COPY = {
  NO_DATA_FOR_WINDOW:
    "Sources are connected, but no events were recorded for this period. This is not a statement that no threats occurred.",
  DISCONNECTED_SOURCE:
    "This source is disconnected or suspended. Findings after the disconnection time are not being collected.",
  STALE_VERSION:
    "Another analyst updated this record while you were reviewing it. Your decision was not saved. The latest version has been reloaded; review it and submit again.",
  HANDSHAKE_NOT_SUCCESS:
    "Consent was recorded, but the connection is not active yet. Run the connection test to confirm which events this source can actually provide.",
} as const;
