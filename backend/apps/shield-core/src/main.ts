import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { gzipSync } from 'zlib';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { Request, Response, NextFunction } from 'express';
import { ShieldCoreModule } from './shield-core.module';
import { TraceIdMiddleware } from './observability/trace-id.middleware';
import { HttpLoggingInterceptor } from './observability/http-logging.interceptor';

export function parseTrustProxy(raw?: string): boolean | number | string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return 'loopback, linklocal, uniquelocal';
  }
  if (trimmed.toLowerCase() === 'true') {
    return true;
  }
  if (trimmed.toLowerCase() === 'false') {
    return false;
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed;
}

export function gzipCompressionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  if (!/\bgzip\b/i.test(acceptEncoding)) {
    return next();
  }
  const origSend = res.send.bind(res);
  res.send = ((body?: any) => {
    const contentType = String(res.getHeader('content-type') || '');
    if (
      res.getHeader('content-encoding') ||
      contentType.includes('text/event-stream') ||
      body === undefined ||
      body === null
    ) {
      return origSend(body);
    }
    const buf = Buffer.isBuffer(body)
      ? body
      : typeof body === 'string'
        ? Buffer.from(body, 'utf8')
        : Buffer.from(JSON.stringify(body), 'utf8');
    if (buf.length < 64) {
      return origSend(body);
    }
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.removeHeader('Content-Length');
    return origSend(gzipSync(buf));
  }) as any;
  next();
}

export function validateRequiredEnvironmentVariables(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const requiredAlways = ['DATABASE_URL', 'JWT_SECRET'];
  const requiredInProduction = ['JWT_REFRESH_SECRET', 'CORS_ORIGIN'];
  const missing: string[] = [];
  for (const key of requiredAlways) {
    if (!process.env[key]) missing.push(key);
  }
  if (isProd) {
    for (const key of requiredInProduction) {
      if (!process.env[key]) missing.push(key);
    }
  }
  if (missing.length > 0) {
    const errorMsg = `[FATAL] Missing required environment variable(s) for startup: ${missing.join(', ')}. Process terminating.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

async function bootstrap() {
  validateRequiredEnvironmentVariables();
  const app = await NestFactory.create(ShieldCoreModule, { rawBody: true });

  // Browser traffic reaches shield-core through the frontend's /api/v1 proxy,
  // so without this every user shares the proxy's IP and one rate-limit
  // bucket (login included). Trust X-Forwarded-For only from private-network
  // hops such as that proxy; a client connecting directly from a public
  // address cannot spoof it. TRUST_PROXY overrides (Express trust proxy syntax).
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
  app.use(cookieParser());
  app.use(gzipCompressionMiddleware);
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
if (require.main === module) {
  bootstrap();
}
