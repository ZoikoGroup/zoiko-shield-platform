import { Controller, Get } from '@nestjs/common';
import { PublicEndpoint } from '../common/public-endpoint.decorator';
import { AssistantConfigService } from './assistant-config.service';

@Controller('api/public/chat/v1')
@PublicEndpoint()
export class ConfigController {
  constructor(private readonly config: AssistantConfigService) {}

  @Get('config')
  getConfig() {
    return this.config.snapshot();
  }

  @Get('status')
  getStatus() {
    const flags = this.config.flags();
    const status = flags.assistant_kill
      ? 'disabled'
      : flags.assistant_ai_answers
        ? 'enabled'
        : 'degraded';
    return {
      status,
      mode: flags.assistant_kill ? 'disabled' : flags.assistant_ai_answers ? 'ai' : 'static',
      ai_answers: flags.assistant_ai_answers && !flags.assistant_kill,
      fallback_links: {
        help: this.config.snapshot().routes.WEB_CAPABILITIES,
        support: this.config.snapshot().routes.WEB_SUPPORT,
        privacy: this.config.snapshot().routes.WEB_PRIVACY,
      },
      checked_at: new Date().toISOString(),
    };
  }
}

