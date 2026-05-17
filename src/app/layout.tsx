import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "eBon Analyzer",
  description: "REWE eBon Auswertung – Preisentwicklung, Statistiken, Export",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className="antialiased bg-gray-50 min-h-screen">
        <Nav />
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>
        <Toaster />
      </body>
    </html>
  );
}
