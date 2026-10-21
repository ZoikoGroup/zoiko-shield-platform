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
      <body className="min-h-screen bg-[#060911] text-slate-100 flex flex-col antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
