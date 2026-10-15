import type { Metadata } from "next";
import "./globals.css";
import { TopHeader } from "@/components/layout/TopHeader";
import { Sidebar } from "@/components/layout/Sidebar";
import { DemoGuideBar } from "@/components/layout/DemoGuideBar";

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
        <div className="flex flex-1 h-screen overflow-hidden">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <TopHeader />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 cyber-grid">
              <div className="max-w-[1720px] mx-auto space-y-6">{children}</div>
            </main>
          </div>
        </div>
        <DemoGuideBar />
      </body>
    </html>
  );
}
