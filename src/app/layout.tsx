import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "LibStack",
  description: "Reading viewer for the knowledge vault",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased min-h-screen">
        <header className="border-b border-black/10 dark:border-white/10">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-baseline justify-between">
            <Link href="/" className="text-lg font-semibold tracking-tight">LibStack</Link>
            <span className="text-xs text-muted">reading.itamih</span>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
        <footer className="max-w-4xl mx-auto px-6 py-12 text-xs text-muted">
          Built from the knowledge vault.
        </footer>
      </body>
    </html>
  );
}
