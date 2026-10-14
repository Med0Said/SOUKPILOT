import type { MetadataRoute } from "next";
import { fr } from "@/i18n/fr";

/**
 * Installable web app (home screen / desktop). Deliberately no service worker:
 * an offline cache could show stale stock or prices and cannot record sales
 * safely; the app needs the network, like the database it relies on.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: fr.app.name,
    short_name: fr.app.name,
    description: fr.app.tagline,
    lang: "fr",
    dir: "ltr",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f5f7fa",
    theme_color: "#1e5ba8",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: fr.sales.list.newSale, url: "/app/sales/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: fr.nav.stock, url: "/app/stock", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
