import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DEFAULT_LOCALE, localeDirection } from "@/i18n/config";
import { fr } from "@/i18n/fr";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: fr.app.name, template: `%s · ${fr.app.name}` },
  description: fr.app.tagline,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={DEFAULT_LOCALE} dir={localeDirection(DEFAULT_LOCALE)}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
