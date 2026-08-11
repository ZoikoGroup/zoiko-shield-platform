import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ShieldIngestModule } from './shield-ingest.module';
import { TraceIdMiddleware } from './observability/trace-id.middleware';
import { HttpLoggingInterceptor } from './observability/http-logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(ShieldIngestModule);
  app.use(new TraceIdMiddleware().use.bind(new TraceIdMiddleware()));
  app.useGlobalInterceptors(new HttpLoggingInterceptor('shield-ingest'));
  await app.listen(process.env.SHIELD_INGEST_PORT ?? 3002, '0.0.0.0');
}
bootstrap().catch((err) => {
  console.error('Error starting shield-ingest:', err);
  process.exit(1);
});
