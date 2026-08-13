import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './customer.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
  ) {}

  findAllForTenant(tenantId: string): Promise<Customer[]> {
    return this.customerRepository.find({ where: { tenantId } });
  }

  async findOne(tenantId: string, id: string): Promise<Customer> {
    const item = await this.customerRepository.findOne({
      where: { id, tenantId },
    });
    if (!item) {
      throw new NotFoundException(
        `Customer ${id} not found for tenant ${tenantId}`,
      );
    }
    return item;
  }

  create(tenantId: string, dto: CreateCustomerDto): Promise<Customer> {
    return this.customerRepository.save(
      this.customerRepository.create({ tenantId, ...dto }),
    );
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<Customer> {
    const item = await this.findOne(tenantId, id);
    Object.assign(item, dto);
    return this.customerRepository.save(item);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const item = await this.findOne(tenantId, id);
    await this.customerRepository.remove(item);
  }
}
