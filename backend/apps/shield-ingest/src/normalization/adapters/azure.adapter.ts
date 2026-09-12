/**
 * Azure Monitor Activity Log OCSF Normalization Adapter
 * Maps Azure's Activity Log event shape (`operationName`/`caller`/`status`,
 * not CloudTrail's `eventName`/`userIdentity`) into the flat NormalizedEvent
 * columns the ingestion pipeline stores.
 */
import { NormalizedOcsfEvent } from './entra.adapter';

export class AzureOcsfAdapter {
  static normalize(payload: Record<string, any>): NormalizedOcsfEvent {
    const level = String(payload.level || 'Informational');
    const severity =
      level === 'Critical'
        ? 'CRITICAL'
        : level === 'Error'
          ? 'HIGH'
          : level === 'Warning'
            ? 'MEDIUM'
            : 'INFORMATIONAL';

    const operationName =
      payload.operationName?.value || payload.operationName || 'AZURE_ACTIVITY';
    const statusValue = payload.status?.value || payload.status;
    const outcome = statusValue === 'Succeeded' ? 'SUCCESS' : 'FAILED';

    return {
      eventClass: 'CLOUD_AUDIT',
      eventCategory: 'CLOUD_INFRASTRUCTURE',
      eventActivity: operationName,
      severity,
      actorUserId: payload.caller || undefined,
      actorEmail: payload.caller || undefined,
      sourceIp: payload.claims?.ipaddr || undefined,
      destinationIp: undefined,
      resourceId: payload.resourceId || payload.subscriptionId || undefined,
      resourceType: payload.resourceId ? 'AZURE_RESOURCE' : 'AZURE_SUBSCRIPTION',
      action: operationName,
      outcome,
      rawPayload: payload,
      unmappedPayload: {
        subscriptionId: payload.subscriptionId,
        resourceGroupName: payload.resourceGroupName,
        category: payload.category?.value || payload.category,
        correlationId: payload.correlationId,
      },
    };
  }
}
