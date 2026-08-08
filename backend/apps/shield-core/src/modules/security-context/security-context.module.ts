import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SecurityContextController } from './security-context.controller';
import { IdentityEntityService } from './identities/identity-entity.service';
import { IdentityResolutionService } from './identities/identity-resolution.service';
import { IdentityRepository } from './identities/identity.repository';
import { IdentityDirectorySyncConsumer } from './identities/identity-directory-sync.consumer';
import { AssetService } from './assets/asset.service';
import { AssetResolutionService } from './assets/asset-resolution.service';
import { AssetRepository } from './assets/asset.repository';
import { RelationshipService } from './relationship/relationship.service';
import { ContextResolutionService } from './context/context-resolution.service';
import { ContextSnapshotService } from './context/context-snapshot.service';
import { OutboxService } from '../../outbox/outbox.service';

@Module({
  imports: [PrismaModule],
  controllers: [SecurityContextController],
  providers: [
    IdentityEntityService,
    IdentityResolutionService,
    IdentityRepository,
    IdentityDirectorySyncConsumer,
    AssetService,
    AssetResolutionService,
    AssetRepository,
    RelationshipService,
    ContextResolutionService,
    ContextSnapshotService,
    OutboxService,
  ],
  exports: [ContextResolutionService, IdentityResolutionService, AssetResolutionService],
})
export class SecurityContextModule {}
