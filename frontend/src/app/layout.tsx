import type { Metadata } from "next";
import "./globals.css";
import { TrustBar } from "@/components/layout/TrustBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { DemoGuideBar } from "@/components/layout/DemoGuideBar";

export const metadata: Metadata = {
  title: "ZoikoShield — Autonomous SecOps & Post-Quantum Defense Platform",
  description: "Enterprise multi-tenant security operations, continuous compliance, and cryptographic audit evidence platform.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#080a0f] text-slate-100 flex flex-col antialiased">
        <TrustBar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-6 md:p-8 pb-28 cyber-grid">
            <div className="max-w-7xl mx-auto space-y-6">{children}</div>
          </main>
        </div>
        <DemoGuideBar />
      </body>
    </html>
  );
}
