const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const swaggerPath = path.join(__dirname, '..', '..', 'docs', 'swagger.yaml');
const checkScriptPath = path.join(__dirname, 'check-swagger-coverage.js');

console.log('Loading OpenAPI specification from:', swaggerPath);
const spec = yaml.load(fs.readFileSync(swaggerPath, 'utf8'));

// 1. Add Tags if missing
const newTags = [
  { name: 'CommercialCapabilities', description: 'Commercial capability registry and public service disclosures' },
  { name: 'CommercialPlans', description: 'Commercial plan tier ladder, pricing, and recommendations' },
  { name: 'MdrServiceObligations', description: 'MDR service obligations, SLA windows, and Rule SVC-01 operational proof gates' },
];

for (const t of newTags) {
  if (!spec.tags.some((existing) => existing.name === t.name)) {
    spec.tags.push(t);
  }
}

// 2. Add Component Schemas
if (!spec.components) spec.components = {};
if (!spec.components.schemas) spec.components.schemas = {};

spec.components.schemas.PublicServiceDefinition = {
  type: 'object',
  required: ['serviceId', 'serviceName', 'category', 'publicOutcomeDescription', 'status', 'substantiatingComponents'],
  properties: {
    serviceId: { type: 'string', example: 'SVC-01' },
    serviceName: { type: 'string', example: 'Continuous Compliance & Assurance Monitoring' },
    category: { type: 'string', example: 'Governance, Risk & Compliance' },
    publicOutcomeDescription: { type: 'string' },
    status: { type: 'string', enum: ['CORE', 'CONTROLLED', 'GATED', 'DEFERRED'] },
    substantiatingComponents: { type: 'array', items: { type: 'string' } },
    includedCapabilities: { type: 'array', items: { type: 'string' } },
    pricingTierMinimum: { type: 'string', enum: ['ESSENTIAL', 'PROFESSIONAL', 'ADVANCED', 'ENTERPRISE'] },
  },
};

spec.components.schemas.CapabilityDomainSummary = {
  type: 'object',
  properties: {
    domainId: { type: 'string' },
    domainName: { type: 'string' },
    description: { type: 'string' },
    totalCapabilities: { type: 'integer' },
    coreCount: { type: 'integer' },
    controlledCount: { type: 'integer' },
    gatedCount: { type: 'integer' },
    deferredCount: { type: 'integer' },
    items: { type: 'array', items: { $ref: '#/components/schemas/CapabilityItem' } },
  },
};

spec.components.schemas.CapabilityItem = {
  type: 'object',
  required: ['id', 'name', 'domain', 'customerService', 'status'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    domain: { type: 'string' },
    customerService: { type: 'string' },
    status: { type: 'string', enum: ['CORE', 'CONTROLLED', 'GATED', 'DEFERRED'] },
    substantiatingSatellites: { type: 'array', items: { type: 'string' } },
    governanceRationale: { type: 'string' },
    statutoryReference: { type: 'string' },
  },
};

spec.components.schemas.PlanTier = {
  type: 'object',
  required: ['key', 'displayName', 'tagline', 'description', 'pricing', 'allocations', 'includedOffers'],
  properties: {
    key: { type: 'string', enum: ['SHIELD_ESSENTIAL', 'SHIELD_PROFESSIONAL', 'SHIELD_ADVANCED', 'SHIELD_ENTERPRISE'] },
    displayName: { type: 'string' },
    tagline: { type: 'string' },
    description: { type: 'string' },
    pricing: {
      type: 'object',
      properties: {
        monthlyUsd: { type: 'number', nullable: true },
        annualBilledMonthlyUsd: { type: 'number', nullable: true },
        isContractOnly: { type: 'boolean' },
        currency: { type: 'string', example: 'USD' },
      },
    },
    allocations: {
      type: 'object',
      properties: {
        maxProtectedAssets: { type: 'integer', nullable: true },
        includedTelemetryGbPerDay: { type: 'integer', nullable: true },
        incidentResponseSlaHours: { type: 'integer' },
        retentionDays: { type: 'integer' },
        includedRetainerHoursPerYear: { type: 'integer' },
      },
    },
    includedOffers: { type: 'array', items: { type: 'string' } },
    highlightedFeatures: { type: 'array', items: { type: 'string' } },
    supportModel: { type: 'string' },
  },
};

spec.components.schemas.MdrServiceObligation = {
  type: 'object',
  required: ['id', 'contractId', 'tenantId', 'coverageTier', 'readinessStatus', 'staffingSchedule', 'slaWindows', 'escalationPath'],
  properties: {
    id: { type: 'string' },
    contractId: { type: 'string' },
    tenantId: { type: 'string' },
    coverageTier: { type: 'string', enum: ['BUSINESS_HOURS_8X5', 'EXTENDED_16X7', 'CONTINUOUS_24X7'] },
    readinessStatus: { type: 'string', enum: ['OPERATIONALLY_PROVEN', 'CONTINGENT', 'UNPROVEN'] },
    staffingSchedule: { type: 'object' },
    slaWindows: { type: 'array', items: { type: 'object' } },
    escalationPath: { type: 'array', items: { type: 'object' } },
    operationalProofReference: { type: 'string' },
  },
};

// 3. Add New Path Definitions
if (!spec.paths) spec.paths = {};

spec.paths['/api/v1/commercial/capabilities/public-services'] = {
  get: {
    tags: ['CommercialCapabilities'],
    summary: 'List customer-visible public services substantiated by platform satellites',
    security: [],
    responses: {
      '200': {
        description: 'Approved public services list',
        content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/PublicServiceDefinition' } } } } } },
      },
    },
  },
};

spec.paths['/api/v1/commercial/capabilities/public-services/{serviceId}'] = {
  get: {
    tags: ['CommercialCapabilities'],
    summary: 'Retrieve single public service definition',
    security: [],
    parameters: [
      { name: 'serviceId', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      '200': { description: 'Public service details' },
      '404': { description: 'Service not found' },
    },
  },
};

spec.paths['/api/v1/commercial/capabilities/domains'] = {
  get: {
    tags: ['CommercialCapabilities'],
    summary: 'List platform capability domains with governance breakdown',
    security: [],
    responses: {
      '200': {
        description: 'Capability domain summaries',
        content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/CapabilityDomainSummary' } } } } } },
      },
    },
  },
};

spec.paths['/api/v1/commercial/capabilities/all'] = {
  get: {
    tags: ['CommercialCapabilities'],
    summary: 'List all granular capability items with fail-closed status',
    security: [],
    responses: {
      '200': { description: 'All capabilities' },
    },
  },
};

spec.paths['/api/v1/commercial/capabilities/check/{capabilityId}'] = {
  get: {
    tags: ['CommercialCapabilities'],
    summary: 'Check if specific capability is active vs gated/deferred',
    security: [],
    parameters: [
      { name: 'capabilityId', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      '200': { description: 'Availability status' },
    },
  },
};

spec.paths['/api/v1/commercial/capabilities/evaluators/check'] = {
  get: {
    tags: ['CommercialCapabilities'],
    summary: 'Check if compliance framework evaluator is active baseline vs deferred',
    security: [],
    parameters: [
      { name: 'framework', in: 'query', required: false, schema: { type: 'string' } },
    ],
    responses: {
      '200': { description: 'Evaluator active status' },
    },
  },
};

spec.paths['/api/v1/commercial/plans'] = {
  get: {
    tags: ['CommercialPlans'],
    summary: 'List all 4 approved commercial plan tiers and pricing ladders',
    security: [],
    responses: {
      '200': {
        description: 'Approved commercial plan tiers',
        content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/PlanTier' } } } } } },
      },
    },
  },
};

spec.paths['/api/v1/commercial/plans/{planKey}'] = {
  get: {
    tags: ['CommercialPlans'],
    summary: 'Retrieve single commercial plan tier by key',
    security: [],
    parameters: [
      { name: 'planKey', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      '200': { description: 'Plan tier details' },
      '404': { description: 'Plan tier not found' },
    },
  },
};

spec.paths['/api/v1/commercial/plans/recommend'] = {
  post: {
    tags: ['CommercialPlans'],
    summary: 'Calculate recommended plan tier based on organizational scale and telemetry',
    security: [],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['protectedAssetCount', 'estimatedDailyTelemetryGb'],
            properties: {
              protectedAssetCount: { type: 'integer' },
              estimatedDailyTelemetryGb: { type: 'number' },
              requiresAiSecurity: { type: 'boolean' },
              requiresManagedDefense: { type: 'boolean' },
            },
          },
        },
      },
    },
    responses: {
      '200': { description: 'Plan recommendation with rationale' },
      '400': { description: 'Invalid request' },
    },
  },
};

spec.paths['/api/v1/managed-defense/service-obligations/{contractId}'] = {
  get: {
    tags: ['MdrServiceObligations'],
    summary: 'Retrieve contractual MDR service obligations and SLA windows',
    security: [],
    parameters: [
      { name: 'contractId', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      '200': { description: 'Service obligations' },
      '404': { description: 'Contract obligations not found' },
    },
  },
};

spec.paths['/api/v1/managed-defense/service-obligations/{contractId}/verify-claim'] = {
  get: {
    tags: ['MdrServiceObligations'],
    summary: 'Verify whether 24/7 SOC claim is permitted under Rule SVC-01',
    security: [],
    parameters: [
      { name: 'contractId', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      '200': { description: 'Claim verification status' },
    },
  },
};

spec.paths['/api/v1/managed-defense/service-obligations/register'] = {
  post: {
    tags: ['MdrServiceObligations'],
    summary: 'Register or update contractual MDR service obligations',
    security: [],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['contractId', 'tenantId', 'coverageTier', 'staffingSchedule'],
            properties: {
              contractId: { type: 'string' },
              tenantId: { type: 'string' },
              coverageTier: { type: 'string' },
              staffingSchedule: { type: 'object' },
            },
          },
        },
      },
    },
    responses: {
      '201': { description: 'Service obligation registered' },
      '400': { description: 'Invalid payload' },
    },
  },
};

spec.paths['/api/v1/managed-defense/service-obligations/verify-readiness'] = {
  post: {
    tags: ['MdrServiceObligations'],
    summary: 'Verify and attest operational readiness proof under Rule SVC-01',
    security: [],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['contractId', 'auditorId', 'proofDocumentRef', 'passed24x7ShiftAudit'],
            properties: {
              contractId: { type: 'string' },
              auditorId: { type: 'string' },
              proofDocumentRef: { type: 'string' },
              passed24x7ShiftAudit: { type: 'boolean' },
            },
          },
        },
      },
    },
    responses: {
      '200': { description: 'Operational readiness updated' },
      '404': { description: 'Contract not found' },
    },
  },
};

fs.writeFileSync(swaggerPath, yaml.dump(spec, { noRefs: true, lineWidth: -1 }));
console.log('Successfully updated docs/swagger.yaml with 13 new endpoints and schema models.');

// Update check-swagger-coverage.js approvedPublicOperations
let checkScript = fs.readFileSync(checkScriptPath, 'utf8');
const newApprovedOperations = [
  'get:/api/v1/commercial/capabilities/public-services',
  'get:/api/v1/commercial/capabilities/public-services/{serviceId}',
  'get:/api/v1/commercial/capabilities/domains',
  'get:/api/v1/commercial/capabilities/all',
  'get:/api/v1/commercial/capabilities/check/{capabilityId}',
  'get:/api/v1/commercial/capabilities/evaluators/check',
  'get:/api/v1/commercial/plans',
  'get:/api/v1/commercial/plans/{planKey}',
  'post:/api/v1/commercial/plans/recommend',
  'get:/api/v1/managed-defense/service-obligations/{contractId}',
  'get:/api/v1/managed-defense/service-obligations/{contractId}/verify-claim',
  'post:/api/v1/managed-defense/service-obligations/register',
  'post:/api/v1/managed-defense/service-obligations/verify-readiness',
];

for (const op of newApprovedOperations) {
  if (!checkScript.includes(`'${op}',`)) {
    checkScript = checkScript.replace(
      'const approvedPublicOperations = new Set([',
      `const approvedPublicOperations = new Set([\n  '${op}',`,
    );
  }
}

fs.writeFileSync(checkScriptPath, checkScript);
console.log('Successfully updated approved public operations in check-swagger-coverage.js.');
