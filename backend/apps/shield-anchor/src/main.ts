import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ShieldAnchorModule } from './shield-anchor.module';
import { TraceIdMiddleware } from './observability/trace-id.middleware';
import { HttpLoggingInterceptor } from './observability/http-logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(ShieldAnchorModule);
  app.use(new TraceIdMiddleware().use.bind(new TraceIdMiddleware()));
  app.useGlobalInterceptors(new HttpLoggingInterceptor('shield-anchor'));
  await app.listen(process.env.SHIELD_ANCHOR_PORT ?? 3005);
}
bootstrap().catch((err) => {
  console.error('Error starting shield-anchor:', err);
  process.exit(1);
});
