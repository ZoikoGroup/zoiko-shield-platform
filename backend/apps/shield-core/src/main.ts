import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { load as loadYaml } from 'js-yaml';
import * as swaggerUi from 'swagger-ui-express';
import { ShieldCoreModule } from './shield-core.module';

async function bootstrap() {
  const app = await NestFactory.create(ShieldCoreModule);

  app.use(cookieParser());
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const candidatePaths = [
    resolve(process.cwd(), '..', 'docs', 'swagger.yaml'),
    resolve(process.cwd(), 'docs', 'swagger.yaml'),
    resolve(__dirname, '..', '..', '..', 'docs', 'swagger.yaml'),
    resolve('/app', 'docs', 'swagger.yaml'),
  ];
  const swaggerDocPath = candidatePaths.find((p) => existsSync(p));
  if (swaggerDocPath) {
    const swaggerDocument = loadYaml(
      readFileSync(swaggerDocPath, 'utf8'),
    ) as Record<string, unknown>;
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  }

  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}
bootstrap();
