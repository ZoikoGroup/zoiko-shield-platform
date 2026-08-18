import { PartialType } from '@nestjs/mapped-types';
import { CreateIdentityProviderDto } from './create-identity-provider.dto';

export class UpdateIdentityProviderDto extends PartialType(
  CreateIdentityProviderDto,
) {}
