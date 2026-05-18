import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import RegisterSW from "@/components/RegisterSW";
import SyncManager from "@/components/SyncManager";
import Settings from "@/components/Settings";

export const metadata: Metadata = {
  title: "LibStack",
  description: "Reading viewer for the knowledge vault",
  manifest: "/manifest.webmanifest",
  applicationName: "LibStack",
  appleWebApp: {
    capable: true,
    title: "LibStack",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#15140f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased min-h-screen">
        <RegisterSW />
        <SyncManager />
        <header className="border-b border-black/10 dark:border-white/10">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-baseline justify-between">
            <Link href="/" className="text-lg font-semibold tracking-tight">LibStack</Link>
            <Settings />
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
