import { Global, Module } from '@nestjs/common';
import { DistributedRateLimiterService } from './distributed-rate-limiter.service';

@Global()
@Module({
  providers: [DistributedRateLimiterService],
  exports: [DistributedRateLimiterService],
})
export class RateLimitingModule {}
