import { NestFactory } from '@nestjs/core';
import { ShieldCoreModule } from './shield-core.module';

async function bootstrap() {
  const app = await NestFactory.create(ShieldCoreModule);
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
