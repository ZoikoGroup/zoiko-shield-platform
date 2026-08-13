import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ShieldIngestModule } from './shield-ingest.module';
import { TraceIdMiddleware } from './observability/trace-id.middleware';
import { HttpLoggingInterceptor } from './observability/http-logging.interceptor';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(ShieldIngestModule, { rawBody: true });
  app.use(new TraceIdMiddleware().use.bind(new TraceIdMiddleware()));
  app.useGlobalInterceptors(new HttpLoggingInterceptor('shield-ingest'));
  // Connector payloads intentionally contain provider-specific fields, so
  // global whitelisting would silently destroy valid telemetry. DTO-level
  // validators still run and unknown non-object bodies are rejected.
  app.useGlobalPipes(new ValidationPipe({ transform: true, forbidUnknownValues: true }));
  await app.listen(process.env.SHIELD_INGEST_PORT ?? 3002, '0.0.0.0');
}
bootstrap().catch((err) => {
  console.error('Error starting shield-ingest:', err);
  process.exit(1);
});
