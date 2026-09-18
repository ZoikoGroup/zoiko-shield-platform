import { Global, Module } from '@nestjs/common';
import { DistributedOutboxRelayService } from './distributed-outbox-relay.service';
import { OutboxEventDispatcherService } from './outbox-event-dispatcher.service';

@Global()
@Module({
  providers: [DistributedOutboxRelayService, OutboxEventDispatcherService],
  exports: [DistributedOutboxRelayService, OutboxEventDispatcherService],
})
export class OutboxModule {}
