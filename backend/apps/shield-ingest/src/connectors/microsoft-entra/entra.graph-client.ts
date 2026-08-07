import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';

@Injectable()
export class EntraGraphClient {
  private readonly logger = new Logger(EntraGraphClient.name);
  private readonly baseUrl = 'https://graph.microsoft.com/v1.0';

  /**
   * Performs an authenticated request to the Microsoft Graph API.
   * Includes automatic retry logic for 429 (Too Many Requests).
   */
  async request(
    endpoint: string,
    accessToken: string,
    options: RequestInit = {},
  ): Promise<any> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${this.baseUrl}${endpoint}`;

    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal', // For performance on delta queries
          },
        });

        if (response.ok) {
          return await response.json();
        }

        // Handle Throttling
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After') || '2';
          const waitMs = parseInt(retryAfter, 10) * 1000;
          this.logger.warn(
            `Rate limited by Microsoft Graph. Retrying after ${waitMs}ms...`,
          );

          await new Promise((res) => setTimeout(res, waitMs));
          attempt++;
          continue;
        }

        const errorBody = await response.text();
        throw new HttpException(
          `Microsoft Graph Error: ${response.status} - ${errorBody}`,
          HttpStatus.BAD_GATEWAY,
        );
      } catch (err) {
        if (err instanceof HttpException) throw err;
        this.logger.error(`Network error reaching Graph API: ${err}`);
        throw new HttpException(
          'Network Error',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }

    throw new HttpException(
      'Max retries exceeded for Graph API',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
