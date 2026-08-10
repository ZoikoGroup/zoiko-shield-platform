import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ShieldAnchorModule } from './shield-anchor.module';

async function bootstrap() {
  const app = await NestFactory.create(ShieldAnchorModule);
  await app.listen(process.env.SHIELD_ANCHOR_PORT ?? 3005);
}
bootstrap().catch((err) => {
  console.error('Error starting shield-anchor:', err);
  process.exit(1);
});
