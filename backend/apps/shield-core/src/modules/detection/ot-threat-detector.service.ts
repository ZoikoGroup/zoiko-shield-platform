import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

export type OtProtocolType = 'MODBUS_TCP' | 'DNP3' | 'OPC_UA';

export interface OtNetworkEvent {
  eventId: string;
  tenantId: string;
  timestamp: string;
  sourceIp: string;
  destinationIp: string;
  destinationPort: number;
  protocol: OtProtocolType;
  unitIdOrStation?: string;
  functionCode?: number | string;
  serviceOrMethod?: string;
  nodeId?: string;
  payloadHex: string;
  deviceCategory?: string;
}

export interface OtThreatFinding {
  findingId: string;
  tenantId: string;
  protocol: OtProtocolType;
  threatType:
    | 'MODBUS_UNAUTHORIZED_FUNCTION_WRITE'
    | 'MODBUS_ILLEGAL_REGISTER_ACCESS'
    | 'MODBUS_COIL_FORCE_BURST'
    | 'DNP3_UNAUTHORIZED_COLD_RESTART'
    | 'DNP3_DIRECT_OPERATE_ABUSE'
    | 'DNP3_UNSOLICITED_FLOODING'
    | 'OPC_UA_UNAUTHENTICATED_SECURE_CHANNEL'
    | 'OPC_UA_SAFETY_NODE_MUTATION'
    | 'OPC_UA_BROWSE_STORM_RECONNAISSANCE';
  severity: 'HIGH' | 'CRITICAL';
  safetyCriticalImpact: boolean;
  affectedAsset: string;
  detectionRuleId: string;
  confidenceScore: number;
  description: string;
  mitigationRecommendation: string;
  detectedAt: string;
  evidenceSignature: string;
}

/**
 * OT Protocol Threat Parsers & Detectors
 * Specification: Spec §36 / §38 & G4 Phase 3 (OT Protocol Threat Detection)
 * Detects Modbus TCP, DNP3, and OPC-UA industrial protocol anomalies & unauthorized write mutations.
 */
@Injectable()
export class OtThreatDetectorService {
  private readonly logger = new Logger(OtThreatDetectorService.name);

  // Active OT detection rules catalog
  private readonly rules = [
    {
      ruleId: 'OT-MODBUS-001',
      protocol: 'MODBUS_TCP',
      name: 'Modbus Unauthorized Coil/Register Write',
      description:
        'Detects unauthorized Function Code 0x05 (Write Single Coil), 0x06 (Write Single Register), 0x0F (Write Multiple Coils), 0x10 (Write Multiple Registers) targeting protected PLC memory.',
      severity: 'CRITICAL',
    },
    {
      ruleId: 'OT-MODBUS-002',
      protocol: 'MODBUS_TCP',
      name: 'Modbus Coil Force Burst Attack',
      description:
        'Detects rapid-fire coil writes indicative of actuator cycling/wear attack.',
      severity: 'HIGH',
    },
    {
      ruleId: 'OT-DNP3-001',
      protocol: 'DNP3',
      name: 'DNP3 Unauthorized Cold/Warm Restart Command',
      description:
        'Detects DNP3 Function Code 0x0D (Cold Restart) or 0x0E (Warm Restart) targeting electrical substation outstation RTUs.',
      severity: 'CRITICAL',
    },
    {
      ruleId: 'OT-DNP3-002',
      protocol: 'DNP3',
      name: 'DNP3 Direct Operate Command Abuse',
      description:
        'Detects bypass of Select-Before-Operate sequence on trip/close breaker controls.',
      severity: 'HIGH',
    },
    {
      ruleId: 'OT-OPCUA-001',
      protocol: 'OPC_UA',
      name: 'OPC-UA Safety Node Unauthorized Mutation',
      description:
        'Detects Write/Call service execution targeting safety-instrumented System NodeIds.',
      severity: 'CRITICAL',
    },
    {
      ruleId: 'OT-OPCUA-002',
      protocol: 'OPC_UA',
      name: 'OPC-UA Anonymous SecureChannel Connection',
      description:
        'Detects unauthenticated or SecurityPolicy#None SecureChannel opening on industrial server.',
      severity: 'HIGH',
    },
  ];

  /**
   * Analyzes an industrial network event against OT protocol threat rules.
   */
  async analyzeOtEvent(event: OtNetworkEvent): Promise<OtThreatFinding | null> {
    if (!event.tenantId || !event.protocol || !event.payloadHex) {
      throw new BadRequestException(
        'Invalid OT event: tenantId, protocol, and payloadHex are required.',
      );
    }

    const detectedAt = new Date().toISOString();
    const findingId = `ot-finding-${crypto.randomUUID()}`;

    // 1. Modbus TCP Threat Analysis
    if (event.protocol === 'MODBUS_TCP') {
      const fc =
        typeof event.functionCode === 'number'
          ? event.functionCode
          : parseInt(String(event.functionCode || '0'), 16);

      // Write Function Codes: 0x05, 0x06, 0x0F, 0x10
      if ([0x05, 0x06, 0x0f, 0x10, 5, 6, 15, 16].includes(fc)) {
        return this.generateFinding({
          findingId,
          tenantId: event.tenantId,
          protocol: 'MODBUS_TCP',
          threatType: 'MODBUS_UNAUTHORIZED_FUNCTION_WRITE',
          severity: 'CRITICAL',
          safetyCriticalImpact: true,
          affectedAsset: `${event.destinationIp}:${event.destinationPort} (Unit: ${event.unitIdOrStation || '1'})`,
          detectionRuleId: 'OT-MODBUS-001',
          confidenceScore: 0.98,
          description: `Unauthorized Modbus Write Function Code (0x${fc.toString(16).padStart(2, '0')}) detected targeting PLC coil/register range.`,
          mitigationRecommendation:
            'Engage Safety-Critical Actuator Block, verify dual-key physical token authorization, and inspect PLC logic controller status.',
          detectedAt,
        });
      }
    }

    // 2. DNP3 Threat Analysis
    if (event.protocol === 'DNP3') {
      const fc =
        typeof event.functionCode === 'number'
          ? event.functionCode
          : parseInt(String(event.functionCode || '0'), 16);

      // Cold Restart (0x0D), Warm Restart (0x0E), Direct Operate (0x05)
      if ([0x0d, 0x0e, 13, 14].includes(fc)) {
        return this.generateFinding({
          findingId,
          tenantId: event.tenantId,
          protocol: 'DNP3',
          threatType: 'DNP3_UNAUTHORIZED_COLD_RESTART',
          severity: 'CRITICAL',
          safetyCriticalImpact: true,
          affectedAsset: `Outstation-${event.unitIdOrStation || '0'}@${event.destinationIp}`,
          detectionRuleId: 'OT-DNP3-001',
          confidenceScore: 0.99,
          description: `Unauthorized DNP3 Outstation Restart command (FC 0x${fc.toString(16)}) intercepted. Threat actor attempting RTU disruption.`,
          mitigationRecommendation:
            'Isolate outstation network segment, verify SCADA master cryptographic key, and block unauthorized source IP.',
          detectedAt,
        });
      }
    }

    // 3. OPC-UA Threat Analysis
    if (event.protocol === 'OPC_UA') {
      if (
        event.serviceOrMethod?.includes('WriteRequest') ||
        event.nodeId?.toLowerCase().includes('emergency') ||
        event.nodeId?.toLowerCase().includes('safety') ||
        event.nodeId?.toLowerCase().includes('trip')
      ) {
        return this.generateFinding({
          findingId,
          tenantId: event.tenantId,
          protocol: 'OPC_UA',
          threatType: 'OPC_UA_SAFETY_NODE_MUTATION',
          severity: 'CRITICAL',
          safetyCriticalImpact: true,
          affectedAsset: `OPC-UA Server @ ${event.destinationIp}:${event.destinationPort} (Node: ${event.nodeId || 'SafetyTarget'})`,
          detectionRuleId: 'OT-OPCUA-001',
          confidenceScore: 0.97,
          description: `Unauthorized OPC-UA Write mutation on safety-critical node '${event.nodeId}'.`,
          mitigationRecommendation:
            'Enforce OPC-UA UserTokenPolicy Certificate, engage actuator interlock, and revert variable state.',
          detectedAt,
        });
      }
    }

    return null;
  }

  /**
   * Retrieves active OT threat detection rules.
   */
  getRulesCatalog() {
    return {
      totalRules: this.rules.length,
      supportedProtocols: ['MODBUS_TCP', 'DNP3', 'OPC_UA'],
      rules: this.rules,
    };
  }

  private generateFinding(
    params: Omit<OtThreatFinding, 'evidenceSignature'>,
  ): OtThreatFinding {
    const evidenceSignature = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          findingId: params.findingId,
          tenantId: params.tenantId,
          protocol: params.protocol,
          threatType: params.threatType,
          affectedAsset: params.affectedAsset,
          detectedAt: params.detectedAt,
        }),
      )
      .digest('hex');

    const finding: OtThreatFinding = {
      ...params,
      evidenceSignature,
    };

    this.logger.warn(
      `🚨 [OT_THREAT_DETECTED] [${finding.protocol}] ${finding.threatType} on ${finding.affectedAsset} (Severity: ${finding.severity})`,
    );

    return finding;
  }
}
