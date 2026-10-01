import { Global, Module } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import { JitElevationService } from './jit-elevation.service';
import { JitSessionEnforcerService } from './jit-session-enforcer.service';
import { JitSessionWitnessService } from './jit-session-witness.service';
import { AuthorizationController } from './authorization.controller';
import { PolicyLifecycleController } from './policy-lifecycle.controller';
import { PolicyLifecycleService } from './policy-lifecycle.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { PlatformPermissionsGuard } from './guards/platform-permissions.guard';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthorizationDecisionService } from '../authorization-decision/authorization-decision.service';
import { CedarPolicyEvaluatorService } from './cedar-policy-evaluator.service';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AuthorizationController, PolicyLifecycleController],
  providers: [
    AuthorizationService,
    PolicyLifecycleService,
    JitElevationService,
    JitSessionEnforcerService,
    JitSessionWitnessService,
    CedarPolicyEvaluatorService,
    AuthorizationDecisionService,
    PermissionsGuard,
    PlatformPermissionsGuard,
  ],
  exports: [
    AuthorizationService,
    PolicyLifecycleService,
    JitElevationService,
    JitSessionEnforcerService,
    JitSessionWitnessService,
    CedarPolicyEvaluatorService,
    AuthorizationDecisionService,
    PermissionsGuard,
    PlatformPermissionsGuard,
  ],
})
export class AuthorizationModule {}
