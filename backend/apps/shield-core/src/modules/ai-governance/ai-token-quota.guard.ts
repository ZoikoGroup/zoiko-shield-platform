import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AiBudgetService } from './ai-budget.service';
import { requireTenantId } from '../../tenant-context';

@Injectable()
export class AiTokenQuotaGuard implements CanActivate {
  constructor(private readonly aiBudgetService: AiBudgetService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const headerTenantId = request.headers['x-tenant-id'];
    const queryTenantId = request.query?.tenantId;

    let tenantId: string;
    try {
      tenantId = requireTenantId(headerTenantId, queryTenantId);
    } catch {
      // If no tenant context, cannot check AI budget - fail closed
      throw new ForbiddenException('Tenant context required for AI execution');
    }

    const environmentId =
      request.headers['x-environment-id'] ||
      request.query?.environmentId ||
      'default';

    const isOver = await this.aiBudgetService.isOverBudget(
      tenantId,
      String(environmentId),
    );

    if (isOver) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'AI_TOKEN_QUOTA_EXHAUSTED',
        message:
          'AI execution blocked: Tenant AI token budget/capacity is exhausted or unconfigured',
      });
    }

    return true;
  }
}
