"use client";
// Header, footer, ads and donate button for the public wiki (no login).
import { useEffect, useState, type ReactNode } from "react";

type Settings = {
  adClient: string;
  adSlots: { top: string; bottom: string };
  donateUrl: string;
  loginUrl: string;
  discordUrl: string;
};

/** One AdSense unit. Renders nothing until AdSense is configured with a slot. */
export function AdSlot({
  client,
  slot,
  label = "Advertisement",
}: {
  client: string;
  slot: string;
  label?: string;
}) {
  useEffect(() => {
    if (!client || !slot) return;
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch {}
  }, [client, slot]);
  if (!client || !slot) return null;
  return (
    <aside className="pwAd" aria-label={label}>
      <small>{label}</small>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<string>("dark");
  useEffect(() => setTheme(document.documentElement.dataset.theme || "dark"), []);
  const flip = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem("bom:theme", next);
    } catch {}
    setTheme(next);
  };
  return (
    <button
      type="button"
      className="pwIconBtn"
      onClick={flip}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {theme === "light" ? "☾" : "☀"}
    </button>
  );
}

export default function PublicShell({ settings, children }: { settings: Settings; children: ReactNode }) {
  const [home, setHome] = useState("/wiki");
  const [prep, setPrep] = useState("/wiki/prep");
  useEffect(() => {
    const h = window.location.hostname.toLowerCase();
    if (h.startsWith("wiki.") || h === "bandofmisfits.org" || h === "www.bandofmisfits.org") {
      setHome("/");
      setPrep("/prep");
    }
  }, []);
  return (
    <div className="pwShell">
      <header className="pwBar">
        <a className="pwBrand" href={home}>
          <img src="/branding/defaults/bom-logo.png" alt="" width={34} height={34} />
          <span>
            <b>BOM Wiki</b>
            <small>World of Sea Battle</small>
          </span>
        </a>
        <nav aria-label="Site">
          <a href={home}>Wiki</a>
          <a href={`${home}?tool=guides&guide=new-player-welcome`}>New Player Guide</a>
          <a href={prep}>Battle Prep</a>
          {settings.discordUrl && (
            <a href={settings.discordUrl} target="_blank" rel="noreferrer">
              Join BOM
            </a>
          )}
        </nav>
        <div className="pwBarEnd">
          <ThemeToggle />
          <a className="pwLogin" href={settings.loginUrl}>
            Member Login
          </a>
        </div>
      </header>
      <AdSlot client={settings.adClient} slot={settings.adSlots.top} />
      <div className="pwContent">{children}</div>
      <AdSlot client={settings.adClient} slot={settings.adSlots.bottom} />
      <footer className="pwFooter">
        <div>
          <b>Enjoying the wiki?</b>
          <p>It's free and run by Band of Misfits. Donations help keep it online and up to date.</p>
        </div>
        {settings.donateUrl && (
          <a className="pwDonate" href={settings.donateUrl} target="_blank" rel="noreferrer noopener">
            ♥ Donate with PayPal
          </a>
        )}
        <small>
          A fan site by the Band of Misfits guild. Not affiliated with or endorsed by the makers of World of
          Sea Battle. Game names and images belong to their owners.
        </small>
      </footer>
    </div>
  );
}
