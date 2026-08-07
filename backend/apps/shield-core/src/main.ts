import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ShieldCoreModule } from './shield-core.module';

async function bootstrap() {
  const app = await NestFactory.create(ShieldCoreModule);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
