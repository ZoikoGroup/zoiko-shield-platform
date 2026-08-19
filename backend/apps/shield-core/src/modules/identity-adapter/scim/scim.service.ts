import { Injectable } from '@nestjs/common';
import { SCIM_SERVICE_PROVIDER_CONFIG } from './scim.constants';

@Injectable()
export class ScimService {
  getServiceProviderConfig() {
    return SCIM_SERVICE_PROVIDER_CONFIG;
  }
}
