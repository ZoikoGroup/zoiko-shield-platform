import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { ingestError } from './shield-ingest.client';

describe('ingestError', () => {
  it("passes on a validation or residency rejection with ingest's own status and message", () => {
    const err = ingestError(
      400,
      JSON.stringify({ message: "Source region 'us-east-1' violates the tenant's committed data-residency region 'eu-west-1'" }),
    );
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(400);
    expect((err.getResponse() as any).message).toMatch(/data-residency region 'eu-west-1'/);
  });

  it('passes on not-found and policy decisions', () => {
    expect(ingestError(404, '{"message":"Connector not found"}').getStatus()).toBe(404);
    expect(ingestError(403, '{"message":"Policy denied"}').getStatus()).toBe(403);
  });

  it('treats refused service credentials and ingest failures as ingest being unavailable', () => {
    expect(ingestError(401, '{"message":"Invalid or expired workload identity"}')).toBeInstanceOf(ServiceUnavailableException);
    expect(ingestError(500, 'boom')).toBeInstanceOf(ServiceUnavailableException);
    expect(ingestError(502, '')).toBeInstanceOf(ServiceUnavailableException);
  });

  it('keeps a non-JSON body as the message', () => {
    expect((ingestError(422, 'plain text reason').getResponse() as any).message).toBe('plain text reason');
  });
});
