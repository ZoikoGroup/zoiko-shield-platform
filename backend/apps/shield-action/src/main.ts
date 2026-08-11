import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ShieldActionModule } from './shield-action.module';
import { TraceIdMiddleware } from './observability/trace-id.middleware';
import { HttpLoggingInterceptor } from './observability/http-logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(ShieldActionModule);
  app.use(new TraceIdMiddleware().use.bind(new TraceIdMiddleware()));
  app.useGlobalInterceptors(new HttpLoggingInterceptor('shield-action'));
  await app.listen(process.env.SHIELD_ACTION_PORT ?? 3004);
}
bootstrap().catch((err) => {
  console.error('Error starting shield-action:', err);
  process.exit(1);
});
