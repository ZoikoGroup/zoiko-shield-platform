import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();
    const idempotencyKey = req.headers['idempotency-key'];

    if (!idempotencyKey) {
      throw new BadRequestException("Header 'idempotency-key' is required for commercial mutation endpoints");
    }

    const existingEvent = await this.prisma.commercialEvent.findUnique({
      where: { idempotency_key: idempotencyKey },
    });

    if (existingEvent) {
      try {
        const cachedResult = JSON.parse(existingEvent.payload);
        return of(cachedResult);
      } catch {
        return of({ statusCode: 200, message: 'Replayed commercial mutation', data: existingEvent.payload });
      }
    }

    return next.handle().pipe(
      tap(async (result) => {
        try {
          await this.prisma.commercialEvent.create({
            data: {
              event_type: req.route ? req.route.path : 'commercial.mutation',
              actor: (req.headers['x-actor-id'] as string) || 'system',
              tenant_id: (req.headers['x-tenant-id'] as string) || undefined,
              payload: JSON.stringify(result),
              idempotency_key: idempotencyKey,
            },
          });
        } catch {
          // Ignore unique constraint collision during race conditions
        }
      }),
    );
  }
}
