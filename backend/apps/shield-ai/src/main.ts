import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ShieldAiModule } from './shield-ai.module';
import { TraceIdMiddleware } from './observability/trace-id.middleware';
import { HttpLoggingInterceptor } from './observability/http-logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(ShieldAiModule);
  app.use(new TraceIdMiddleware().use.bind(new TraceIdMiddleware()));
  app.useGlobalInterceptors(new HttpLoggingInterceptor('shield-ai'));
  await app.listen(process.env.SHIELD_AI_PORT ?? 3003);
}
bootstrap().catch((err) => {
  console.error('Error starting shield-ai:', err);
  process.exit(1);
});
