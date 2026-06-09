import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import RegisterSW from "@/components/RegisterSW";
import SyncManager from "@/components/SyncManager";
import Settings from "@/components/Settings";
import CanonicalRedirect from "@/components/CanonicalRedirect";
import ThemeToggle from "@/components/ThemeToggle";

// Runs synchronously before paint so a forced theme doesn't flash the system
// one. Mirrors the logic in ThemeToggle.apply().
const THEME_INIT = `(function(){try{var t=localStorage.getItem('libstack:theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(_){}})();`;

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
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <CanonicalRedirect />
        <RegisterSW />
        <SyncManager />
        <header className="border-b border-black/10 dark:border-white/10">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-baseline justify-between">
            <Link href="/" className="text-lg font-semibold tracking-tight">LibStack</Link>
            <div className="flex items-baseline gap-4">
              <ThemeToggle />
              <Settings />
            </div>
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
