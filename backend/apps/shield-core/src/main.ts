import { NestFactory } from '@nestjs/core';
import { ShieldCoreModule } from './shield-core.module';

async function bootstrap() {
  const app = await NestFactory.create(ShieldCoreModule);
  await app.listen(process.env.port ?? 3001);
}
bootstrap();
