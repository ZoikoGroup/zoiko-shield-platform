import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { ShieldCoreModule } from './shield-core.module';
import { TraceIdMiddleware } from './observability/trace-id.middleware';
import { HttpLoggingInterceptor } from './observability/http-logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(ShieldCoreModule);

  app.use(cookieParser());
  app.use(new TraceIdMiddleware().use.bind(new TraceIdMiddleware()));
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.useGlobalInterceptors(new HttpLoggingInterceptor('shield-core'));

  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}
bootstrap();
