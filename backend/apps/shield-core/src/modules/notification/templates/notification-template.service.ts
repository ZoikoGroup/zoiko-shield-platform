import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CreateTemplateInput {
  key: string;
  channel: string;
  locale?: string;
  version: number;
  subjectTemplate?: string;
  bodyTemplate: string;
}

/** Published templates are immutable — same publish-once convention as DetectionVersion/PromptProfile. */
@Injectable()
export class NotificationTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateTemplateInput) {
    return this.prisma.notificationTemplate.create({
      data: {
        id: randomUUID(),
        key: input.key,
        channel: input.channel,
        locale: input.locale ?? 'en-US',
        version: input.version,
        subject_template: input.subjectTemplate,
        body_template: input.bodyTemplate,
        status: 'DRAFT',
      },
    });
  }

  async publish(templateId: string) {
    const template = await this.prisma.notificationTemplate.findUniqueOrThrow({
      where: { id: templateId },
    });
    if (template.status === 'PUBLISHED') {
      throw new ConflictException(
        `NotificationTemplate '${templateId}' is already PUBLISHED`,
      );
    }
    return this.prisma.notificationTemplate.update({
      where: { id: templateId },
      data: { status: 'PUBLISHED', published_at: new Date() },
    });
  }

  async getLatestPublished(key: string, channel: string, locale = 'en-US') {
    const template = await this.prisma.notificationTemplate.findFirst({
      where: { key, channel, locale, status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
    });
    if (!template) {
      throw new NotFoundException(
        `No PUBLISHED NotificationTemplate for key='${key}' channel='${channel}' locale='${locale}'`,
      );
    }
    return template;
  }

  /** Never puts secrets/raw restricted telemetry directly into a notification — placeholders resolve to references/links only. */
  render(
    template: { subject_template: string | null; body_template: string },
    context: Record<string, string>,
  ): { subject?: string; body: string } {
    const substitute = (text: string) =>
      text.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] ?? '');
    return {
      subject: template.subject_template
        ? substitute(template.subject_template)
        : undefined,
      body: substitute(template.body_template),
    };
  }
}
