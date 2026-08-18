import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
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
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new HttpLoggingInterceptor('shield-core'));

  const candidatePaths = [
    resolve(process.cwd(), '..', 'docs', 'swagger.yaml'),
    resolve(process.cwd(), 'docs', 'swagger.yaml'),
    resolve(__dirname, '..', '..', '..', 'docs', 'swagger.yaml'),
    resolve('/app', 'docs', 'swagger.yaml'),
  ];
  const swaggerDocPath = candidatePaths.find((p) => existsSync(p));
  if (swaggerDocPath) {
    try {
      const jsYaml = eval('require')('js-yaml');
      const swaggerUi = eval('require')('swagger-ui-express');
      const swaggerDocument = jsYaml.load(
        readFileSync(swaggerDocPath, 'utf8'),
      ) as Record<string, unknown>;
      app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    } catch (e) {
      // Swagger docs optional if dependency missing in bundle
    }
  }

  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}
bootstrap();
