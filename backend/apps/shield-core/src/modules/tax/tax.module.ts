import { Module } from '@nestjs/common';
import { TaxRuleController } from './tax-rule.controller';
import { TaxRuleService } from './tax-rule.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TaxRuleController],
  providers: [TaxRuleService],
  exports: [TaxRuleService],
})
export class TaxModule {}
