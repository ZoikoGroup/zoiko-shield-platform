import { Injectable } from '@nestjs/common';

@Injectable()
export class ShieldCoreService {
  getHello(): string {
    return 'Hello World!';
  }
}
