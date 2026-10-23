import * as fs from 'fs';
import {
  EMAIL_TEMPLATE_DOMAINS,
  ProductionEmailTemplateEngine,
} from './production-email-template.engine';

/**
 * Catalogue-coverage guard for ZS-EML-TPL-001 v2.0.
 *
 * The reference document defines 226 event contracts across 16 domains. This
 * spec pins the per-domain counts so a template that is dropped, duplicated or
 * mis-filed fails CI instead of silently shipping a generic fallback email.
 */
describe('Production email template catalogue coverage', () => {
  const engine = new ProductionEmailTemplateEngine();
  const all = engine.listTemplates();

  it('registers the documented per-domain template counts', () => {
    for (const domain of EMAIL_TEMPLATE_DOMAINS) {
      const registered = all.filter((t) => t.category === domain.code).length;
      expect({ domain: domain.code, registered }).toEqual({
        domain: domain.code,
        registered: domain.count,
      });
    }
  });

  it('uses unique ZS-EML-<DOMAIN>-NNN ids that match their category', () => {
    const seen = new Set<string>();
    for (const t of all) {
      expect(t.id).toMatch(/^ZS-EML-[A-Z]+-\d{3}$/);
      expect(t.id.split('-')[2]).toBe(t.category);
      expect(seen.has(t.id)).toBe(false);
      seen.add(t.id);
    }
  });

  it('dumps inventory when ZS_DUMP_EMAIL_INVENTORY is set', () => {
    const target = process.env.ZS_DUMP_EMAIL_INVENTORY;
    if (!target) return;
    fs.writeFileSync(
      target,
      JSON.stringify(
        all.map((t) => ({
          id: t.id,
          category: t.category,
          name: t.name,
          gate: t.gate,
          senderClass: t.senderClass,
          subject: t.subject,
          buttonText: t.buttonText,
        })),
        null,
        1,
      ),
    );
  });
});
