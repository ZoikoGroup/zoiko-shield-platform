import { Module } from '@nestjs/common';
import { PaillierHomomorphicAggregatorService } from './paillier-homomorphic-aggregator.service';

@Module({
  providers: [PaillierHomomorphicAggregatorService],
  exports: [PaillierHomomorphicAggregatorService],
})
export class HomomorphicModule {}
