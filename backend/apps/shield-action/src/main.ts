import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ShieldActionModule } from './shield-action.module';

async function bootstrap() {
  const app = await NestFactory.create(ShieldActionModule);
  await app.listen(process.env.SHIELD_ACTION_PORT ?? 3004);
}
bootstrap().catch((err) => {
  console.error('Error starting shield-action:', err);
  process.exit(1);
});
