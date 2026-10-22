import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "ZoikoShield — Autonomous SecOps & Defense Platform",
  description: "Enterprise multi-tenant security operations, continuous compliance, and cryptographic audit evidence platform.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined') {
                window.addEventListener('error', function(e) {
                  var msg = (e && (e.message || (e.error && e.error.message))) || '';
                  if (msg.indexOf('Loading chunk') !== -1 || msg.indexOf('ChunkLoadError') !== -1) {
                    var k = 'zoiko_chunk_retry';
                    var last = sessionStorage.getItem(k);
                    var now = Date.now();
                    if (!last || now - parseInt(last, 10) > 10000) {
                      sessionStorage.setItem(k, now.toString());
                      window.location.reload();
                    }
                  }
                });
              }
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-[#060911] text-slate-100 flex flex-col antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
