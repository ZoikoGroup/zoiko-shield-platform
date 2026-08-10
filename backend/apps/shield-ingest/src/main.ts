import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ShieldIngestModule } from './shield-ingest.module';

async function bootstrap() {
  const app = await NestFactory.create(ShieldIngestModule);
  await app.listen(process.env.SHIELD_INGEST_PORT ?? 3002, '0.0.0.0');
}
bootstrap().catch((err) => {
  console.error('Error starting shield-ingest:', err);
  process.exit(1);
});
