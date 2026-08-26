import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { HumanAuthorityGuard } from './human-authority.guard';
import { HumanAuthorityService } from './human-authority.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [HumanAuthorityService, HumanAuthorityGuard],
  exports: [HumanAuthorityService, HumanAuthorityGuard],
})
export class HumanAuthorityModule {}
