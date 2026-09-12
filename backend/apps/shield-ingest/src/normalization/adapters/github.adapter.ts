/**
 * GitHub Webhook (push event) OCSF-style Normalization Adapter
 * Maps GitHub's push payload (`pusher`/`repository`/`commits`, no
 * `actorUserId`/`sourceIp`/etc. generic-webhook fields) into the flat
 * NormalizedEvent columns the ingestion pipeline stores. Applies to
 * connectors created with provider 'generic-webhook' that happen to be
 * fed GitHub deliveries - there is no dedicated 'github' provider type,
 * so detection also falls back to payload shape (pusher+repository+commits).
 */
import { NormalizedOcsfEvent } from './entra.adapter';

export class GithubOcsfAdapter {
  static normalize(payload: Record<string, any>): NormalizedOcsfEvent {
    const commits: any[] = Array.isArray(payload.commits)
      ? payload.commits
      : [];
    const repoFullName = payload.repository?.full_name;
    const pusherLogin = payload.sender?.login || payload.pusher?.name;
    const pusherEmail =
      payload.pusher?.email ||
      (pusherLogin
        ? `${pusherLogin}@users.noreply.github.com`
        : undefined);

    let action = 'GIT_PUSH_COMMIT';
    let severity = 'INFORMATIONAL';
    if (payload.deleted) {
      action = 'GIT_BRANCH_DELETED';
      severity = 'MEDIUM';
    } else if (payload.created) {
      action = 'GIT_BRANCH_CREATED';
    } else if (payload.forced) {
      action = 'GIT_FORCE_PUSH';
      severity = 'MEDIUM';
    }

    return {
      eventClass: 'SOURCE_CONTROL_AUDIT',
      eventCategory: 'SOURCE_CONTROL',
      eventActivity: commits.length > 0 ? 'GIT_PUSH' : 'REPOSITORY_EVENT',
      severity,
      actorUserId: pusherLogin,
      actorEmail: pusherEmail,
      sourceIp: undefined,
      destinationIp: undefined,
      resourceId: repoFullName,
      resourceType: 'GIT_REPOSITORY',
      action,
      outcome: 'SUCCESS',
      rawPayload: payload,
      unmappedPayload: {
        ref: payload.ref,
        before: payload.before,
        after: payload.after,
        commitCount: commits.length,
        headCommitMessage: payload.head_commit?.message,
      },
    };
  }
}
