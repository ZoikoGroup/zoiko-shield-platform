import { Injectable, Logger } from '@nestjs/common';
import crypto from 'crypto';
import {
  CloudTrailRawRecord,
  CloudTrailNormalizedEvent,
} from './aws-cloudtrail.types';

@Injectable()
export class AwsCloudTrailNormalizerService {
  private readonly logger = new Logger(AwsCloudTrailNormalizerService.name);

  normalizeRecord(
    record: CloudTrailRawRecord,
    tenantId: string,
    environmentId: string,
    region: string,
  ): CloudTrailNormalizedEvent {
    const rawPayloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(record))
      .digest('hex');

    const mfaAuthenticated =
      record.userIdentity?.sessionContext?.attributes?.mfaAuthenticated ===
      'true';

    const status: CloudTrailNormalizedEvent['status'] =
      record.errorCode || record.errorMessage ? 'FAILED' : 'SUCCESS';

    let eventType = `aws.${record.eventSource?.replace('.amazonaws.com', '')}.${record.eventName}`;
    if (
      record.eventName?.startsWith('Create') ||
      record.eventName?.startsWith('Put')
    ) {
      eventType = `aws.mutation.${record.eventName}`;
    } else if (
      record.eventName?.startsWith('Delete') ||
      record.eventName?.startsWith('Revoke')
    ) {
      eventType = `aws.destructive.${record.eventName}`;
    }

    return {
      tenant_id: tenantId,
      environment_id: environmentId,
      region,
      provider: 'aws-cloudtrail',
      event_type: eventType,
      source_event_id: record.eventID || `ct-${crypto.randomUUID()}`,
      event_timestamp: record.eventTime || new Date().toISOString(),
      processing_timestamp: new Date().toISOString(),
      correlation_id: record.requestID || record.eventID,

      actor: {
        principal_id: record.userIdentity?.principalId,
        account_id: record.userIdentity?.accountId || record.recipientAccountId,
        user_name: record.userIdentity?.userName,
        arn: record.userIdentity?.arn,
        type: record.userIdentity?.type || 'Unknown',
        mfa_authenticated: mfaAuthenticated,
      },

      target: {
        service: record.eventSource || 'aws.generic',
        action: record.eventName || 'UnknownAction',
        region: record.awsRegion || region,
        resource_arn:
          (record.requestParameters?.roleArn as string) ||
          (record.requestParameters?.bucketName as string),
      },

      network: {
        source_ip: record.sourceIPAddress || '0.0.0.0',
        user_agent: record.userAgent || 'Unknown',
      },

      status,
      error_code: record.errorCode,
      error_message: record.errorMessage,
      is_management_event: record.managementEvent ?? true,
      is_read_only: record.readOnly ?? false,
      raw_payload_hash: rawPayloadHash,
    };
  }
}
