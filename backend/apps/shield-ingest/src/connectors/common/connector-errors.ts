export class ConnectorError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly isRetryable: boolean = false,
  ) {
    super(message);
    this.name = 'ConnectorError';
  }
}

export class ConnectorAuthenticationError extends ConnectorError {
  constructor(message: string = 'Authentication with the provider failed') {
    super('AUTH_FAILED', message, false);
    this.name = 'ConnectorAuthenticationError';
  }
}

export class ConnectorRateLimitError extends ConnectorError {
  constructor(
    public readonly retryAfterSeconds: number = 60,
    message: string = 'Rate limit exceeded',
  ) {
    super('RATE_LIMITED', message, true);
    this.name = 'ConnectorRateLimitError';
  }
}

export class ConnectorPermissionError extends ConnectorError {
  constructor(
    message: string = 'Required permissions were revoked or missing',
  ) {
    super('PERMISSION_REVOKED', message, false);
    this.name = 'ConnectorPermissionError';
  }
}
