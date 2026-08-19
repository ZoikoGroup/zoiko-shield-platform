import { SCIM_SERVICE_PROVIDER_CONFIG, SCIM_SCHEMAS } from './scim.constants';
import { ScimService } from './scim.service';

describe('ScimService', () => {
  let service: ScimService;

  beforeEach(() => {
    service = new ScimService();
  });

  it('should expose SCIM constants', () => {
    expect(SCIM_SCHEMAS.USER).toBeDefined();
    expect(SCIM_SERVICE_PROVIDER_CONFIG.schemas).toBeDefined();
  });

  it('should return service provider configuration', () => {
    const config = service.getServiceProviderConfig();
    expect(config).toBe(SCIM_SERVICE_PROVIDER_CONFIG);
  });
});
