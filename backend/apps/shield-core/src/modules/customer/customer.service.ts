import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Customer } from './customer.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForTenant(tenantId: string): Promise<Customer[]> {
    return (await this.prisma.customer.findMany({
      where: { tenantId },
    })) as Customer[];
  }

  async findOne(tenantId: string, id: string): Promise<Customer> {
    const item = await this.prisma.customer.findFirst({
      where: { id, tenantId },
    });
    if (!item) {
      throw new NotFoundException(
        `Customer ${id} not found for tenant ${tenantId}`,
      );
    }
    return item as Customer;
  }

  async create(tenantId: string, dto: CreateCustomerDto): Promise<Customer> {
    return (await this.prisma.customer.create({
      data: {
        tenantId,
        partyId: dto.partyId,
        customerType: dto.customerType,
        segment: dto.segment,
      },
    })) as Customer;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<Customer> {
    const item = await this.findOne(tenantId, id);
    return (await this.prisma.customer.update({
      where: { id: item.id },
      data: {
        partyId: dto.partyId,
        customerType: dto.customerType,
        lifecycleStatus: dto.lifecycleStatus,
        kycStatus: dto.kycStatus,
        segment: dto.segment,
      },
    })) as Customer;
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const item = await this.findOne(tenantId, id);
    await this.prisma.customer.deleteMany({
      where: { id: item.id, tenantId },
    });
  }
}
