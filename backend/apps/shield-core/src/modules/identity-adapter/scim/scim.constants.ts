export const SCIM_SCHEMAS = {
  USER: 'urn:ietf:params:scim:schemas:core:2.0:User',
  GROUP: 'urn:ietf:params:scim:schemas:core:2.0:Group',
  SERVICE_PROVIDER_CONFIG:
    'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
  RESOURCE_TYPE: 'urn:ietf:params:scim:schemas:core:2.0:ResourceType',
  SCHEMA: 'urn:ietf:params:scim:schemas:core:2.0:Schema',
  LIST_RESPONSE: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
  ERROR: 'urn:ietf:params:scim:api:messages:2.0:ErrorResponse',
  BULK_REQUEST: 'urn:ietf:params:scim:api:messages:2.0:BulkRequest',
  BULK_RESPONSE: 'urn:ietf:params:scim:api:messages:2.0:BulkResponse',
  PATCH_OP: 'urn:ietf:params:scim:api:messages:2.0:PatchOp',
};

export const SCIM_SERVICE_PROVIDER_CONFIG = {
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
  documentationUri: 'https://tools.ietf.org/html/rfc7644',
  patch: {
    supported: true,
  },
  bulk: {
    supported: false,
    maxOperations: 0,
    maxPayloadSize: 0,
  },
  filter: {
    supported: true,
    maxResults: 100,
  },
  changePassword: {
    supported: false,
  },
  sort: {
    supported: false,
  },
  etag: {
    supported: false,
  },
  authenticationSchemes: [
    {
      name: 'OAuth Bearer Token',
      description: 'Authentication Scheme using OAuth Bearer Token',
      specUri: 'https://tools.ietf.org/html/rfc6750',
      type: 'oauthbearertoken',
      primary: true,
    },
  ],
};
