const fs = require('fs');
const path = require('path');
const yaml = require('../node_modules/js-yaml');

const swaggerPath = path.join(__dirname, '..', '..', 'docs', 'swagger.yaml');
console.log('Reading swagger spec from:', swaggerPath);
const spec = yaml.load(fs.readFileSync(swaggerPath, 'utf8'));

// 1. Add Component Schemas
if (!spec.components) spec.components = {};
if (!spec.components.schemas) spec.components.schemas = {};

spec.components.schemas.RegisterDto = {
  type: 'object',
  required: ['organizationName', 'email', 'password'],
  properties: {
    organizationName: { type: 'string', example: 'CyberGuard Defense Labs' },
    slug: { type: 'string', example: 'cyberguard-labs' },
    fullName: { type: 'string', example: 'Alex Morgan' },
    email: { type: 'string', format: 'email', example: 'alex.morgan@cyberguard.io' },
    password: { type: 'string', format: 'password', example: 'Shield@Enterprise2026!' },
    planTier: {
      type: 'string',
      enum: ['FREE_TRIAL', 'PROFESSIONAL', 'BUSINESS', 'ENTERPRISE', 'ENTERPRISE_PLUS'],
      default: 'FREE_TRIAL',
    },
  },
};

spec.components.schemas.RegisterResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    token: { type: 'string', example: 'jwt-eval-session-token' },
    session: { type: 'object' },
    tenant: { type: 'object' },
    verificationRequired: { type: 'boolean', example: true },
  },
};

spec.components.schemas.VerifyEmailDto = {
  type: 'object',
  required: ['email', 'code'],
  properties: {
    email: { type: 'string', format: 'email', example: 'alex.morgan@cyberguard.io' },
    code: { type: 'string', example: '123456' },
  },
};

spec.components.schemas.ResendVerificationDto = {
  type: 'object',
  required: ['email'],
  properties: {
    email: { type: 'string', format: 'email', example: 'alex.morgan@cyberguard.io' },
  },
};

spec.components.schemas.CreateCheckoutSessionDto = {
  type: 'object',
  required: ['planTier'],
  properties: {
    planTier: { type: 'string', example: 'PROFESSIONAL' },
    billingCycle: { type: 'string', enum: ['monthly', 'annual'], default: 'annual' },
    tenantId: { type: 'string' },
    userEmail: { type: 'string', format: 'email' },
    successUrl: { type: 'string' },
    cancelUrl: { type: 'string' },
  },
};

// 2. Add Paths
spec.paths['/api/v1/auth/register'] = {
  post: {
    tags: ['Auth'],
    summary: 'Register organization and administrator',
    description: 'Registers a new organization, provisioning a tenant, administrator principal, and initial membership. Dispatches verification challenge email.',
    operationId: 'postAuthRegister',
    security: [],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/RegisterDto' },
        },
      },
    },
    responses: {
      '201': {
        description: 'Registration and tenant provisioning successful.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/RegisterResponse' },
          },
        },
      },
      '400': {
        description: 'Bad request or validation error.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      '409': {
        description: 'Email or tenant slug already exists.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

spec.paths['/api/v1/auth/register-org'] = {
  post: {
    tags: ['Auth'],
    summary: 'Register organization (alias)',
    description: 'Alias for /api/v1/auth/register.',
    operationId: 'postAuthRegisterOrg',
    security: [],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/RegisterDto' },
        },
      },
    },
    responses: {
      '201': {
        description: 'Registration successful.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/RegisterResponse' },
          },
        },
      },
      '400': {
        description: 'Bad request.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

spec.paths['/api/v1/auth/verify-email'] = {
  post: {
    tags: ['Auth'],
    summary: 'Verify email address with 6-digit challenge OTP',
    description: 'Verifies the email verification challenge code sent during organization registration or email update.',
    operationId: 'postAuthVerifyEmail',
    security: [],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/VerifyEmailDto' },
        },
      },
    },
    responses: {
      '200': {
        description: 'Email successfully verified.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      '400': {
        description: 'Invalid or expired challenge code.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

spec.paths['/api/v1/auth/email-verification/verify'] = {
  post: {
    tags: ['Auth'],
    summary: 'Verify email address (alias)',
    description: 'Alias for /api/v1/auth/verify-email.',
    operationId: 'postAuthEmailVerificationVerify',
    security: [],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/VerifyEmailDto' },
        },
      },
    },
    responses: {
      '200': {
        description: 'Email verified.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      '400': {
        description: 'Invalid code.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

spec.paths['/api/v1/auth/resend-verification'] = {
  post: {
    tags: ['Auth'],
    summary: 'Resend verification email',
    description: 'Dispatches a new email verification challenge OTP to the registered account email.',
    operationId: 'postAuthResendVerification',
    security: [],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ResendVerificationDto' },
        },
      },
    },
    responses: {
      '200': {
        description: 'Verification email dispatched.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      '400': {
        description: 'Account already verified or not found.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

spec.paths['/api/v1/auth/email-verification/resend'] = {
  post: {
    tags: ['Auth'],
    summary: 'Resend verification email (alias)',
    description: 'Alias for /api/v1/auth/resend-verification.',
    operationId: 'postAuthEmailVerificationResend',
    security: [],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ResendVerificationDto' },
        },
      },
    },
    responses: {
      '200': {
        description: 'Verification dispatched.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      '400': {
        description: 'Account already verified.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

spec.paths['/api/v1/payments/checkout-session'] = {
  post: {
    tags: ['Payments'],
    summary: 'Create Stripe checkout session',
    description: 'Creates an authoritative Stripe checkout session for a commercial subscription tier per ZS-COM-BILL-001.',
    operationId: 'postPaymentsCheckoutSession',
    security: [],
    parameters: [
      { $ref: '#/components/parameters/TenantIdHeader' },
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CreateCheckoutSessionDto' },
        },
      },
    },
    responses: {
      '201': {
        description: 'Checkout session created successfully.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                statusCode: { type: 'number', example: 201 },
                data: {
                  type: 'object',
                  properties: {
                    sessionId: { type: 'string' },
                    checkoutUrl: { type: 'string' },
                    planTier: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      '400': {
        description: 'Invalid plan tier or contract required.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      '401': {
        description: 'Unauthorized.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

spec.paths['/api/v1/payments/session/{sessionId}/status'] = {
  get: {
    tags: ['Payments'],
    summary: 'Get checkout session status',
    description: 'Retrieves the current fulfillment and payment status of a Stripe checkout session.',
    operationId: 'getPaymentsSessionStatus',
    security: [],
    parameters: [
      {
        name: 'sessionId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Stripe or local session identifier',
      },
    ],
    responses: {
      '200': {
        description: 'Checkout session status retrieved.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                statusCode: { type: 'number', example: 200 },
                data: {
                  type: 'object',
                  properties: {
                    sessionId: { type: 'string' },
                    status: { type: 'string' },
                    customerEmail: { type: 'string' },
                    amountTotal: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
      '404': {
        description: 'Session not found.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

spec.paths['/api/v1/payments/checkout-session/{sessionId}/status'] = {
  get: {
    tags: ['Payments'],
    summary: 'Get checkout session status (alias)',
    description: 'Alias for /api/v1/payments/session/{sessionId}/status.',
    operationId: 'getPaymentsCheckoutSessionStatus',
    security: [],
    parameters: [
      {
        name: 'sessionId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      },
    ],
    responses: {
      '200': {
        description: 'Session status retrieved.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                statusCode: { type: 'number', example: 200 },
                data: {
                  type: 'object',
                },
              },
            },
          },
        },
      },
      '404': {
        description: 'Session not found.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

spec.paths['/api/v1/payments/stripe/webhook'] = {
  post: {
    tags: ['Payments'],
    summary: 'Stripe webhook ingestion endpoint',
    description: 'Ingests asynchronous Stripe webhook events verified via HMAC-SHA256 stripe-signature header.',
    operationId: 'postPaymentsStripeWebhook',
    security: [],
    parameters: [
      {
        name: 'stripe-signature',
        in: 'header',
        required: true,
        schema: { type: 'string' },
        description: 'Cryptographic signature header provided by Stripe',
      },
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { type: 'object' },
        },
      },
    },
    responses: {
      '200': {
        description: 'Webhook event processed and acknowledged.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                received: { type: 'boolean', example: true },
              },
            },
          },
        },
      },
      '400': {
        description: 'Invalid signature or unrecognized event payload.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

console.log('Writing updated swagger spec...');
fs.writeFileSync(swaggerPath, yaml.dump(spec, { noRefs: true, lineWidth: 120 }), 'utf8');
console.log('Successfully updated docs/swagger.yaml');
