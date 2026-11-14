/**
 * Public Assistant domain types.
 *
 * Everything in this service is public-internet facing and anonymous. The
 * types deliberately have no tenant, user or case fields: the assistant must
 * never be able to represent authenticated ZoikoShield state.
 */

export type SourceKind =
  | 'HELP_ARTICLE'
  | 'GUIDE'
  | 'TRUST_CLAIM'
  | 'PLAN'
  | 'CONNECTOR'
  | 'CAPABILITY'
  | 'ONBOARDING'
  | 'PAGE';

export type SourceStatus =
  'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'WITHDRAWN' | 'EXPIRED';

export type Classification = 'PUBLIC' | 'RESTRICTED' | 'TENANT' | 'INTERNAL';

export type ClaimType =
  | 'CAPABILITY'
  | 'COMMERCIAL'
  | 'CERTIFICATION'
  | 'SECURITY'
  | 'INTEGRATION'
  | 'GENERAL';

export interface PublicSource {
  id: string;
  kind: SourceKind;
  title: string;
  canonicalUrl: string;
  status: SourceStatus;
  classification: Classification;
  claimType: ClaimType;
  markets: string[];
  locale: string;
  audience: string;
  owner: string;
  reviewer: string;
  summary: string;
  body: string;
  tags: string[];
  effectiveFrom: string;
  expiresAt?: string;
  reviewAt: string;
  revision: number;
  /** Optional curated answer used by the deterministic fallback. */
  answer?: string;
}

export interface SourceChunk {
  id: string;
  sourceId: string;
  ordinal: number;
  text: string;
}

export type AnswerOutcome =
  'ANSWERED' | 'LIMITED' | 'ABSTAINED' | 'PENDING' | 'REJECTED' | 'ERROR';

export type IntentKey =
  | 'INCIDENT'
  | 'SECRET'
  | 'PRIVILEGED'
  | 'PRIVACY'
  | 'WRITE_DEMO'
  | 'WRITE_SUPPORT'
  | 'WRITE_QUOTE'
  | 'INFO'
  | 'IDENTITY'
  | 'INJECTION'
  | 'DISCOVERY';

export interface AnswerBlock {
  type: 'paragraph' | 'bullets' | 'callout' | 'note';
  text?: string;
  items?: string[];
}

export interface Citation {
  source_id: string;
  title: string;
  url: string;
  kind: SourceKind;
}

export interface AnswerPayload {
  outcome: AnswerOutcome;
  blocks: AnswerBlock[];
  citations: Citation[];
  route_key?: string;
  follow_up_chips: string[];
  action?: {
    type: 'flow' | 'link';
    flow?: 'demo' | 'support' | 'quote' | 'trust' | 'onboarding';
    href?: string;
    label: string;
  };
}

export interface PlanFeatureClaim {
  key: string;
  label: string;
  state: 'INCLUDED' | 'OPTIONAL' | 'NOT_INCLUDED' | 'UNKNOWN';
  sourceId: string;
}

export interface PublicPlan {
  id: string;
  name: string;
  tagline: string;
  audience: string;
  priceDisplay: 'QUOTE_REQUIRED' | 'PUBLISHED';
  priceNote: string;
  features: PlanFeatureClaim[];
  sourceId: string;
}

export interface Connector {
  id: string;
  name: string;
  category: string;
  availability: 'VERIFIED' | 'NOT_VERIFIED';
  note: string;
  sourceId: string;
}

export interface TrustTopic {
  id: string;
  title: string;
  summary: string;
  claimPolicy: 'ALLOW' | 'QUALIFY' | 'ABSTAIN';
  sourceId: string;
}

export interface HelpArticle {
  id: string;
  title: string;
  category: string;
  summary: string;
  body: string;
  sourceId: string;
}

export interface GuideStep {
  id: string;
  title: string;
  body: string;
  choices?: Array<{ id: string; label: string; next?: string }>;
}

export interface Guide {
  id: string;
  title: string;
  intro: string;
  steps: GuideStep[];
}
