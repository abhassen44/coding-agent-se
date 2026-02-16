import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TopNav, Sidebar } from "@/components/layout";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

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
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased bg-[#0B0F0E] text-[#E6F1EC] overflow-x-hidden`}
      >
        <TopNav />
        <Sidebar />
        {/* Main content - responsive margin for sidebar */}
        <main className="ml-0 md:ml-56 mt-14 min-h-[calc(100vh-3.5rem)] overflow-x-hidden">
          {children}
        </main>
      </body>
    </html>
  );
}
