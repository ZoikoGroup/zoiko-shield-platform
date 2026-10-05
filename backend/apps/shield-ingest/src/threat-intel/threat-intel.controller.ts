import {
  Controller,
  Get,
  Post,
  Body,
  HttpStatus,
  HttpCode,
  Headers,
  Query,
} from '@nestjs/common';
import { StixThreatIntelMatcherService } from './stix-threat-intel-matcher.service';
import { MpcThreatMatcherService } from '../mpc-intel/mpc-threat-matcher.service';
import {
  IngestStixBundleDto,
  MatchObservablesDto,
  MpcBlindEvaluateBatchDto,
} from './dto/threat-intel.dto';

@Controller('api/v1/threat-intel')
export class ThreatIntelController {
  constructor(
    private readonly stixMatcherService: StixThreatIntelMatcherService,
    private readonly mpcMatcherService: MpcThreatMatcherService,
  ) {}

  /**
   * POST /api/v1/threat-intel/stix/bundles
   * Ingests and indexes a STIX 2.1 Threat Intel Bundle.
   */
  @Post('stix/bundles')
  @HttpCode(HttpStatus.OK)
  ingestStixBundle(@Body() body: IngestStixBundleDto) {
    const result = this.stixMatcherService.ingestStixBundle(body as any);
    return {
      status: 'INGESTED',
      bundleId: result.bundleId,
      indexedCount: result.indexedCount,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * POST /api/v1/threat-intel/match
   * Matches telemetry observables against indexed threat intelligence indicators.
   */
  @Post('match')
  @HttpCode(HttpStatus.OK)
  matchObservables(@Body() body: MatchObservablesDto) {
    const matchResult = this.stixMatcherService.matchTelemetryObservables({
      ipAddresses: body.ipAddresses,
      domains: body.domains,
      fileHashes: body.fileHashes,
    });
    return {
      status: 'MATCHED',
      result: matchResult,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * POST /api/v1/threat-intel/mpc/blind-evaluate
   * Evaluates client blinded curve points using the server's RFC 9497 OPRF key.
   */
  @Post('mpc/blind-evaluate')
  @HttpCode(HttpStatus.OK)
  blindEvaluateMpcBatch(@Body() body: MpcBlindEvaluateBatchDto) {
    const evaluatedResults = this.mpcMatcherService.evaluateBlindedQueries(
      body.items,
    );
    const serverDataset = this.mpcMatcherService.getSafeToRevealDataset();

    return {
      status: 'EVALUATED',
      evaluatedResults,
      serverDatasetEntryCount: serverDataset.length,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/threat-intel/mpc/server-dataset
   * Exposes the server's evaluated OPRF dataset for client-side PSI finalization.
   */
  @Get('mpc/server-dataset')
  getServerDataset() {
    return {
      dataset: this.mpcMatcherService.getSafeToRevealDataset(),
      retrievedAt: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/threat-intel/stats
   * Summary metrics on active STIX IOC indexes and MPC privacy feeds.
   */
  @Get('stats')
  getThreatIntelStats() {
    const stixStats = this.stixMatcherService.getStats();
    const serverDataset = this.mpcMatcherService.getSafeToRevealDataset();

    return {
      stix: stixStats,
      mpcPrivacyPreserving: {
        datasetEntriesCount: serverDataset.length,
        oprfCurve: 'P-256 (RFC 9497)',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
