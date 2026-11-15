import type { Metadata } from "next";
import PublicShell from "@/components/wiki/PublicShell";
import { publicSettings } from "@/lib/publicApi";
import "../dashboard/wiki/game-wiki.css";

export const metadata: Metadata = {
  title: {
    default: "BOM Wiki · World of Sea Battle Guides, Calculators & Ship Data",
    template: "%s · BOM Wiki",
  },
  description:
    "Free World of Sea Battle wiki by Band of Misfits: plain-English guides, a new player guide, ship profiles, damage and crafting calculators, trade routes and port battle planning.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "BOM Wiki",
    description: "World of Sea Battle guides, calculators and ship data.",
    images: ["/branding/defaults/bom-logo.png"],
  },
};

export default function PublicWikiLayout({ children }: { children: React.ReactNode }) {
  const settings = publicSettings();
  return (
    <>
      {settings.adClient && (
        // React 19 moves this async script into <head>, where AdSense looks for it.
        <script
          async
          crossOrigin="anonymous"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${settings.adClient}`}
        />
      )}
      <PublicShell settings={settings}>{children}</PublicShell>
    </>
  );
}
