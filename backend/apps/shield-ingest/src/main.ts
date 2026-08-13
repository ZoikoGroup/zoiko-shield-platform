import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
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
  const candidatePaths = [
    resolve(process.cwd(), '..', 'docs', 'swagger.yaml'),
    resolve(process.cwd(), 'docs', 'swagger.yaml'),
    resolve(__dirname, '..', '..', '..', 'docs', 'swagger.yaml'),
    resolve('/app', 'docs', 'swagger.yaml'),
  ];
  const swaggerDocPath = candidatePaths.find((p) => existsSync(p));
  if (swaggerDocPath) {
    try {
      const jsYaml = eval('require')('js-yaml');
      const swaggerUi = eval('require')('swagger-ui-express');
      const swaggerDocument = jsYaml.load(
        readFileSync(swaggerDocPath, 'utf8'),
      ) as Record<string, unknown>;
      app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    } catch (e) {
      // Swagger docs optional if dependency missing in bundle
    }
  }

  await app.listen(process.env.SHIELD_INGEST_PORT ?? 3002, '0.0.0.0');
}
bootstrap().catch((err) => {
  console.error('Error starting shield-ingest:', err);
  process.exit(1);
});
