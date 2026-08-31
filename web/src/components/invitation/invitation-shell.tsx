import { LockKeyhole, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./invitation.module.css";

export function InvitationShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <ShieldCheck size={23} strokeWidth={2.2} />
          </span>
          ZoikoShield
        </div>
        <section className={styles.frame}>
          <header className={styles.header}>
            <div>
              <div className={styles.eyebrow}>
                <ShieldCheck size={15} /> Tenant onboarding
              </div>
              <h1 className={styles.title}>{title}</h1>
              <p className={styles.subtitle}>{subtitle}</p>
            </div>
            <div className={styles.secureBadge}>
              <LockKeyhole size={15} /> Secure ZoikoID flow
            </div>
          </header>
          {children}
        </section>
        <p className={styles.footer}>
          Invitation tokens are single-use and are never stored in browser
          storage.
        </p>
      </div>
    </div>
  );
}

export { styles };
