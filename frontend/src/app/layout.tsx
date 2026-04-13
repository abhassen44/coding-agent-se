import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout";

export const metadata: Metadata = {
  title: "Intelligent Coding Agent",
  description: "AI-powered coding assistant with RAG, code execution, and automation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="font-sans antialiased bg-[#0B0F0E] text-[#E6F1EC] overflow-x-hidden">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
