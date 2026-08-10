import { Injectable, Logger } from '@nestjs/common';
import { SecurityConnector } from './connector.interface';
import { ConnectorProviderKey } from './connector.types';

/**
 * Key -> provider-adapter map. Providers register themselves on module
 * init; call sites resolve `connectorRegistry.get(definition.provider)`
 * instead of branching on provider name throughout the codebase.
 */
@Injectable()
export class ConnectorRegistry {
  private readonly logger = new Logger(ConnectorRegistry.name);
  private readonly connectors = new Map<ConnectorProviderKey, SecurityConnector>();

  register(key: ConnectorProviderKey, connector: SecurityConnector): void {
    if (this.connectors.has(key)) {
      this.logger.warn(`Connector provider '${key}' registered more than once — overwriting.`);
    }
    this.connectors.set(key, connector);
    this.logger.log(`Registered connector provider '${key}'`);
  }

  get(key: string): SecurityConnector {
    const connector = this.connectors.get(key as ConnectorProviderKey);
    if (!connector) {
      throw new Error(`No connector registered for provider key '${key}'`);
    }
    return connector;
  }

  has(key: string): boolean {
    return this.connectors.has(key as ConnectorProviderKey);
  }
}
