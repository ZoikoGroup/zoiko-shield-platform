import { Injectable } from '@nestjs/common';

@Injectable()
export class ShieldIngestService {
  getHello(): string {
    return 'Hello World!';
  }
}
