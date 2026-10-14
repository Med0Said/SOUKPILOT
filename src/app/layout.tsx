import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { DEFAULT_LOCALE, localeDirection } from "@/i18n/config";
import { fr } from "@/i18n/fr";
import { THEME_COOKIE, parseTheme } from "@/lib/ui/preferences";
import "./globals.css";

// Self-hosted at build time by next/font: no request to Google at runtime,
// compatible with `font-src 'self'`.
const inter = Inter({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: fr.app.name, template: `%s · ${fr.app.name}` },
  description: fr.app.tagline,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1e5ba8" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Render every page per request so Next.js can attach the CSP nonce set by
  // src/proxy.ts (a prerendered page would carry no nonce and be blocked).
  await connection();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang={DEFAULT_LOCALE} dir={localeDirection(DEFAULT_LOCALE)} data-theme={theme} className={inter.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
