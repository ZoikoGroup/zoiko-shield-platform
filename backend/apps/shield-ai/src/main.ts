import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ShieldAiModule } from './shield-ai.module';

async function bootstrap() {
  const app = await NestFactory.create(ShieldAiModule);
  await app.listen(process.env.SHIELD_AI_PORT ?? 3003);
}
bootstrap().catch((err) => {
  console.error('Error starting shield-ai:', err);
  process.exit(1);
});
