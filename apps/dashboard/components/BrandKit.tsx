"use client";

import { useState } from "react";
import Link from "next/link";
import CommandIcon from "./CommandIcon";

const colors = [
  { name: "Void", hex: "#080909", use: "Primary page background" },
  { name: "Obsidian", hex: "#0D0F10", use: "Elevated background" },
  { name: "Gunmetal", hex: "#171A1D", use: "Cards and controls" },
  { name: "BOM Gold", hex: "#D6A83A", use: "Primary brand accent" },
  { name: "Bright Gold", hex: "#F0CC6B", use: "Highlights and selected states" },
  { name: "Warm White", hex: "#F5F3EA", use: "Primary text" },
  { name: "Fog", hex: "#96968D", use: "Secondary text" },
  { name: "Danger", hex: "#C65A54", use: "Destructive and critical states" },
];
const moduleColors = [
  { name: "Music", hex: "#9B4DFF", note: "Contextual only; artwork may override it." },
  { name: "Sentinel", hex: "#D6A83A", note: "Gold/amber for audit and recovery surfaces." },
  { name: "Healthy", hex: "#6FB46D", note: "Operational and confirmed states." },
  { name: "Information", hex: "#5B8DEF", note: "Neutral informational emphasis." },
];

export default function BrandKit() {
  const [copied, setCopied] = useState("");
  async function copy(v: string) {
    await navigator.clipboard?.writeText(v);
    setCopied(v);
    setTimeout(() => setCopied(""), 1200);
  }
  return (
    <div className="brandKitPage">
      <header className="top pageHeading brandKitHeading">
        <div>
          <span className="eyebrow">ADMIN · BRAND KIT</span>
          <h2>BOM visual system</h2>
          <p>
            The shared design language for the dashboard: colors, typography, surfaces, buttons, iconography
            and usage rules.
          </p>
        </div>
        <Link className="outlineButton" href="/dashboard/admin">
          ← Back to Admin
        </Link>
      </header>

      <section className="brandHero panel">
        <div className="brandHeroMark">
          <img src="/branding/defaults/worker-1-avatar.png" alt="Band of Misfits shield" />
        </div>
        <div>
          <span className="eyebrow">BAND OF MISFITS</span>
          <h1>Bold, disciplined, unmistakably BOM.</h1>
          <p>
            The dashboard should feel like a premium gaming command interface: dark naval surfaces, warm
            metallic gold, restrained accent colors, strong hierarchy and minimal implementation jargon.
          </p>
          <div className="brandPrinciples">
            <span>Black first</span>
            <span>Gold with purpose</span>
            <span>Human language</span>
            <span>Visual hierarchy</span>
          </div>
        </div>
      </section>

      <section className="brandSection">
        <div className="sectionIntro">
          <span className="eyebrow">01 · CORE PALETTE</span>
          <h3>Brand colors</h3>
          <p>
            Core colors stay stable across Dashboard, Sentinel and Admin. Module colors support context; they
            never replace BOM gold as the primary identity.
          </p>
        </div>
        <div className="swatchGrid">
          {colors.map((c) => (
            <button
              key={c.hex}
              className="colorSwatch"
              onClick={() => void copy(c.hex)}
              title={`Copy ${c.hex}`}
            >
              <i style={{ background: c.hex }} />
              <span>
                <b>{c.name}</b>
                <code>{c.hex}</code>
                <small>{c.use}</small>
              </span>
              <em>{copied === c.hex ? "Copied" : "Copy"}</em>
            </button>
          ))}
        </div>
      </section>

      <section className="brandSection">
        <div className="sectionIntro">
          <span className="eyebrow">02 · MODULE ACCENTS</span>
          <h3>Functional color</h3>
          <p>
            Accents are supporting signals. Large surfaces remain neutral so artwork, content and status have
            room to breathe.
          </p>
        </div>
        <div className="moduleSwatches">
          {moduleColors.map((c) => (
            <article key={c.name}>
              <span style={{ background: c.hex }} />
              <div>
                <b>{c.name}</b>
                <code>{c.hex}</code>
                <p>{c.note}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="brandSection typeSpec">
        <div className="sectionIntro">
          <span className="eyebrow">03 · TYPOGRAPHY</span>
          <h3>Type hierarchy</h3>
          <p>
            Use modern system sans-serif typography. Personality comes from scale, weight, spacing and the BOM
            artwork—not novelty pirate fonts.
          </p>
        </div>
        <div className="typeSamples">
          <article>
            <small>DISPLAY / 48–64</small>
            <strong>Command the fleet.</strong>
          </article>
          <article>
            <small>PAGE TITLE / 30–38</small>
            <h2>Sentinel Event History</h2>
          </article>
          <article>
            <small>SECTION / 18–22</small>
            <h3>Channel Health</h3>
          </article>
          <article>
            <small>BODY / 14–16</small>
            <p>Explain actions in plain language and keep technical identifiers secondary.</p>
          </article>
          <article>
            <small>LABEL / 10–12</small>
            <span className="eyebrow">BAND OF MISFITS</span>
          </article>
        </div>
      </section>

      <section className="brandSection">
        <div className="sectionIntro">
          <span className="eyebrow">04 · COMPONENTS</span>
          <h3>Buttons and status</h3>
          <p>
            One strong action per area. Secondary controls should be quieter, and tertiary actions should look
            like links instead of competing buttons.
          </p>
        </div>
        <div className="componentShowcase">
          <article>
            <small>PRIMARY</small>
            <button className="goldButton">Save changes</button>
          </article>
          <article>
            <small>SECONDARY</small>
            <button className="outlineButton">Preview rollback</button>
          </article>
          <article>
            <small>TERTIARY</small>
            <button className="brandTextButton">
              View details <CommandIcon name="arrow" size={15} />
            </button>
          </article>
          <article>
            <small>STATUS</small>
            <span className="statusPill healthy">
              <i /> Healthy
            </span>
          </article>
        </div>
      </section>

      <section className="brandSection">
        <div className="sectionIntro">
          <span className="eyebrow">05 · ICONOGRAPHY</span>
          <h3>Simple, consistent line icons</h3>
          <p>
            Icons communicate navigation and actions. Avoid mixing emoji, filled clip-art and unrelated icon
            styles in the same interface.
          </p>
        </div>
        <div className="iconSpec">
          {(["home", "music", "sentinel", "admin", "search", "backup", "health", "database"] as const).map(
            (name) => (
              <div key={name}>
                <span>
                  <CommandIcon name={name} size={24} />
                </span>
                <small>{name}</small>
              </div>
            ),
          )}
        </div>
      </section>

      <section className="brandSection logoRules">
        <div className="sectionIntro">
          <span className="eyebrow">06 · LOGO</span>
          <h3>Shield usage</h3>
          <p>
            Use the shield as a brand anchor, not decoration on every card. It should have enough breathing
            room and should never compete with page content.
          </p>
        </div>
        <div className="logoExamples">
          <article className="logoDark">
            <img src="/branding/defaults/worker-1-avatar.png" alt="BOM shield on dark background" />
            <b>Preferred</b>
            <small>Dark neutral surface</small>
          </article>
          <article className="logoCompact">
            <img src="/branding/defaults/worker-1-avatar.png" alt="BOM compact mark" />
            <b>Compact</b>
            <small>Sidebar / small brand position</small>
          </article>
          <article className="logoAvoid">
            <img src="/branding/defaults/worker-1-avatar.png" alt="BOM shield example" />
            <b>Avoid</b>
            <small>Busy cards, repeated watermarks, heavy glow</small>
          </article>
        </div>
      </section>

      <section className="brandSection brandRules">
        <div className="sectionIntro">
          <span className="eyebrow">07 · UI RULES</span>
          <h3>Design guardrails</h3>
        </div>
        <div className="ruleCards">
          <article>
            <b>Human first</b>
            <p>Display member names, channel names and actions before IDs or backend terminology.</p>
          </article>
          <article>
            <b>Progressive disclosure</b>
            <p>Keep advanced diagnostics and raw JSON available, but behind expandable technical details.</p>
          </article>
          <article>
            <b>Fewer borders</b>
            <p>Use space, scale and surface tone before adding another gold outline.</p>
          </article>
          <article>
            <b>Artwork with purpose</b>
            <p>
              Album art and BOM imagery can lead a page. Decorative imagery should never reduce readability.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
