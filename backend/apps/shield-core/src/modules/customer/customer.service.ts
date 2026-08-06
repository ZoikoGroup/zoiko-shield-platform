import { Injectable, NotFoundException } from '@nestjs/common';
import { Customer } from './customer.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import * as crypto from 'crypto';

@Injectable()
export class CustomerService {
  private customers: Customer[] = [];

  findAll(): Customer[] {
    return this.customers;
  }

  findOne(id: string): Customer {
    const customer = this.customers.find((c) => c.id === id);
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }
    return customer;
  }

  create(createCustomerDto: CreateCustomerDto): Customer {
    const newCustomer: Customer = {
      id: crypto.randomUUID(),
      party_id: createCustomerDto.party_id,
      customer_type: createCustomerDto.customer_type,
      segment: createCustomerDto.segment,
      lifecycle_status: 'ACTIVE',
      kyc_status: 'PENDING',
      context: {
        tenantId: 'default-tenant',
        legalEntityId: 'default-entity',
        environmentId: 'dev',
        region: 'us-east-1',
        correlationId: crypto.randomUUID(),
        traceId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        purpose: 'customer-creation',
        dataClass: 'restricted',
        policyVersion: '1.0',
        contractId: 'customer-api',
        contractVersion: '1.0',
        recordedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    this.customers.push(newCustomer);
    return newCustomer;
  }

  update(id: string, updateCustomerDto: UpdateCustomerDto): Customer {
    const customer = this.findOne(id);
    const updatedCustomer = {
      ...customer,
      ...updateCustomerDto,
      updatedAt: new Date().toISOString(),
    };
    this.customers = this.customers.map((c) => (c.id === id ? updatedCustomer : c));
    return updatedCustomer;
  }

  remove(id: string): void {
    const customer = this.findOne(id);
    this.customers = this.customers.filter((c) => c.id !== id);
  }
}
