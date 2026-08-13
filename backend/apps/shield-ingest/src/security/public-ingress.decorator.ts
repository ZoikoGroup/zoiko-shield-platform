import { SetMetadata } from '@nestjs/common';

export const PUBLIC_INGRESS_KEY = 'publicIngress';
export const PublicIngress = () => SetMetadata(PUBLIC_INGRESS_KEY, true);
