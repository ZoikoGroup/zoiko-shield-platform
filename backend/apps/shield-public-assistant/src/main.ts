import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { ApiEnvelopeInterceptor } from './common/api-envelope.interceptor';
import { ErrorEnvelopeFilter } from './common/error-envelope.filter';
import { ShieldPublicAssistantModule } from './app.module';

const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://www.zoikoshield.com',
  'https://zoikoshield.com',
];

async function bootstrap() {
  const app = await NestFactory.create(ShieldPublicAssistantModule);

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalFilters(new ErrorEnvelopeFilter());
  app.useGlobalInterceptors(new ApiEnvelopeInterceptor());

  const origins = (process.env.PUBLIC_ASSISTANT_ALLOWED_ORIGINS ?? DEFAULT_ORIGINS.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-zs-assistant', 'x-correlation-id', 'x-requested-with'],
    exposedHeaders: ['x-correlation-id', 'retry-after'],
  });

  const port = Number(process.env.PUBLIC_ASSISTANT_PORT ?? 3006);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`ZoikoShield public assistant listening on ${port}`);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Unable to start shield-public-assistant', error);
  process.exit(1);
});
