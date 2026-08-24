import {
  Controller,
  Get,
  Headers,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { requireTenantId } from '../../tenant-context';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * ZS-COM-BILL-001 §21 Q2: Customer Commercial Portal Controller.
 * Provides aggregated, read-only commercial truth for tenant administrators:
 * - Contracted offers, quantities, entitlements, and region
 * - Accepted vs. Billable Telemetry Meter and usage forecast
 * - Evidenced service obligations and consumption
 * - Immutable invoices, payments, and service credits
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/commercial/portal')
export class CommercialPortalController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /api/v1/commercial/portal/summary
   * Full commercial dashboard overview for tenant
   */
  @Get('summary')
  async getPortalSummary(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);

    // 1. Fetch Entitlements
    const entitlements = await this.prisma.entitlement.findMany({
      where: { tenant_id: tenantId },
      include: { commercialAccount: true },
      orderBy: { created_at: 'desc' },
    });

    // 2. Fetch Protected Resource Observations
    const resourceCounts = await this.prisma.protectedResource.groupBy({
      by: ['resource_type', 'coverage_state'],
      where: { tenant_id: tenantId },
      _count: { id: true },
    });

    // 3. Fetch Service Obligations
    const obligations = await this.prisma.serviceObligation.findMany({
      where: { tenant_id: tenantId },
      orderBy: { due_at: 'asc' },
      take: 10,
    });

    // 4. Fetch Invoices & Payments
    const invoices = await this.prisma.commercialInvoice.findMany({
      where: { tenant_id: tenantId },
      include: { payments: true, serviceCredits: true },
      orderBy: { created_at: 'desc' },
      take: 10,
    });

    // 5. Fetch Telemetry Ingestion Meter Summaries
    const telemetryMeters = await this.prisma.meterReading.findMany({
      where: { tenant_id: tenantId },
      orderBy: { window_start: 'desc' },
      take: 14,
    });

    return {
      statusCode: HttpStatus.OK,
      data: {
        tenantId,
        entitlementsSummary: {
          total: entitlements.length,
          activeCount: entitlements.filter((e) => e.status === 'ACTIVE').length,
          entitlements,
        },
        protectedResourcesSummary: resourceCounts,
        serviceObligationsSummary: {
          total: obligations.length,
          pending: obligations.filter((o) => ['NOT_DUE', 'SCHEDULED', 'IN_PROGRESS'].includes(o.status)).length,
          delivered: obligations.filter((o) => o.status === 'DELIVERED').length,
          recentObligations: obligations,
        },
        invoicesSummary: {
          totalInvoices: invoices.length,
          recentInvoices: invoices,
        },
        telemetryUsage: {
          readings: telemetryMeters,
          forecastWarningThreshold: 0.85,
        },
      },
    };
  }

  /**
   * GET /api/v1/commercial/portal/usage
   * Detailed telemetry meter breakdown (Accepted vs Billable vs Quarantined)
   */
  @Get('usage')
  async getPortalUsage(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);

    const readings = await this.prisma.meterReading.findMany({
      where: { tenant_id: tenantId },
      orderBy: { window_start: 'desc' },
      take: 30,
    });

    return {
      statusCode: HttpStatus.OK,
      data: {
        tenantId,
        history: readings,
        meterPolicy: {
          acceptedVsBillableSeparation: true,
          antiPerverseIncentiveRule: 'Alert storms and incidents do not increase recurring charges',
          deduplicationActive: true,
        },
      },
    };
  }
}
