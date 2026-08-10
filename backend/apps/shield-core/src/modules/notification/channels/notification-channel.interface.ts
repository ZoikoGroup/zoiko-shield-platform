export interface SendResult {
  delivered: boolean;
  errorCode?: string;
}

/** IN_APP and EMAIL only this pass — no SMS/push/vendor channels without separate approval (spec §16). */
export interface NotificationChannel {
  readonly channelType: string;
  send(params: { recipientPrincipalId: string; subject?: string; body: string }): Promise<SendResult>;
}
