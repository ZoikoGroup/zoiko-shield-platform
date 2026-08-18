import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

const TOKEN_TTL_MS = 15 * 60 * 1000;
const DOWNLOAD_SIGNING_SECRET =
  process.env.EXPORT_DOWNLOAD_SIGNING_SECRET || randomBytes(32).toString('hex');

/**
 * Never expose object-storage buckets directly (spec §62) — issues a
 * short-lived signed token instead. No real S3 presigned-URL flow is
 * wired this pass (same object-storage limitation as elsewhere); this is
 * a locally-verified signed reference with the same access-expiring
 * property the spec requires.
 */
@Injectable()
export class ExportDownloadService {
  constructor(private readonly prisma: PrismaService) {}

  async issueDownloadToken(
    tenantId: string,
    exportJobId: string,
  ): Promise<{ token: string; expiresAt: string }> {
    const job = await this.prisma.exportJob.findFirst({
      where: { id: exportJobId, tenant_id: tenantId },
    });
    if (!job) {
      throw new NotFoundException(`ExportJob '${exportJobId}' not found`);
    }
    if (job.status !== 'READY' && job.status !== 'PARTIAL') {
      throw new ForbiddenException(
        `ExportJob '${exportJobId}' is not downloadable (status ${job.status})`,
      );
    }

    const expiresAt = Date.now() + TOKEN_TTL_MS;
    const material = `${exportJobId}.${tenantId}.${expiresAt}`;
    const signature = createHmac('sha256', DOWNLOAD_SIGNING_SECRET)
      .update(material)
      .digest('hex');
    return {
      token: `${expiresAt}.${signature}`,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  verifyDownloadToken(
    tenantId: string,
    exportJobId: string,
    token: string,
  ): boolean {
    const [expiresAtStr, signature] = token.split('.');
    const expiresAt = Number(expiresAtStr);
    if (!expiresAt || Date.now() > expiresAt) return false;

    const material = `${exportJobId}.${tenantId}.${expiresAt}`;
    const expected = createHmac('sha256', DOWNLOAD_SIGNING_SECRET)
      .update(material)
      .digest('hex');
    return expected === signature;
  }
}
