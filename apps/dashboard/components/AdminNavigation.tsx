"use client";
// Admin navigation: sections grouped by what they're for, and a search that
// matches the settings inside each section, not just its name.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Section = { key: string; title: string; description: string; group: string; keywords: string[] };

export const ADMIN_GROUPS = [
  "Members & community",
  "Bot features",
  "Port Battles",
  "Server & platform",
] as const;

export const ADMIN_SECTION_LIST: Section[] = [
  {
    key: "membership",
    title: "Membership & Welcome",
    description: "Onboarding, roles, roster, prefixes and custom requests",
    group: "Members & community",
    keywords: [
      "welcome channel",
      "member role",
      "afk role",
      "officer roles",
      "prefix",
      "nickname",
      "custom role",
      "leave",
      "diplomacy",
      "trade role",
      "console channel",
    ],
  },
  {
    key: "recruitment",
    title: "Recruitment",
    description: "Applications, trials, recruiter roles and templates",
    group: "Members & community",
    keywords: [
      "application",
      "trial",
      "recruiter roles",
      "ticket category",
      "interview",
      "reapply cooldown",
      "screenshot",
      "voting",
    ],
  },
  {
    key: "permission-presets",
    title: "Permission Presets",
    description: "Save channel permission layouts and apply them",
    group: "Members & community",
    keywords: ["channel permissions", "overwrites", "copy permissions"],
  },
  {
    key: "sentinel",
    title: "Sentinel",
    description: "Audit archive, retention and recovery",
    group: "Members & community",
    keywords: ["audit log", "backup", "restore", "retention", "deleted messages", "recovery"],
  },
  {
    key: "music",
    title: "Music",
    description: "Permissions, playback defaults and DJ roles",
    group: "Bot features",
    keywords: [
      "dj role",
      "skip mode",
      "vote skip",
      "autoplay",
      "language",
      "bitrate",
      "radio",
      "permissions",
    ],
  },
  {
    key: "ask-rules",
    title: "Ask & Rules",
    description: "Ask channel, assistance, corrections and server rules",
    group: "Bot features",
    keywords: ["ask channel", "rules", "trade rules", "corrections", "assistant"],
  },
  {
    key: "banter",
    title: "BOM Banter",
    description: "Personality, channels, cooldowns and reply limits",
    group: "Bot features",
    keywords: ["roast", "personality", "cooldown", "spontaneous", "reply limit"],
  },
  {
    key: "ai-providers",
    title: "AI",
    description: "Providers, per-feature routing, budgets and the OpenAI key",
    group: "Bot features",
    keywords: ["openai", "groq", "gemini", "api key", "budget", "model"],
  },
  {
    key: "wiki",
    title: "Wiki & Knowledge",
    description: "Articles, sources, corrections and language",
    group: "Bot features",
    keywords: ["articles", "sources", "corrections", "translations", "knowledge"],
  },
  {
    key: "automations",
    title: "Automations & Social",
    description: "Voice rooms, threads, reactions and social feeds",
    group: "Bot features",
    keywords: [
      "join to create",
      "temporary voice",
      "threads",
      "reactions",
      "twitch",
      "youtube",
      "social feeds",
    ],
  },
  {
    key: "port-battles",
    title: "Port Battles",
    description: "Officer access, signup roles, ships and fleet defaults",
    group: "Port Battles",
    keywords: ["signup channel", "roster channel", "manager role", "ships", "fleet", "doctrine", "guilds"],
  },
  {
    key: "brand-kit",
    title: "Branding",
    description: "Bot identity, welcome art, logos and visuals",
    group: "Server & platform",
    keywords: ["logo", "avatar", "colors", "welcome art", "bot name"],
  },
  {
    key: "platform",
    title: "Platform & Access",
    description: "Feature flags, setup and dashboard permissions",
    group: "Server & platform",
    keywords: ["feature flags", "modules", "dashboard admin", "access", "setup"],
  },
  {
    key: "diagnostics",
    title: "Diagnostics",
    description: "Services, music bots and performance",
    group: "Server & platform",
    keywords: ["health", "workers", "errors", "latency", "jobs"],
  },
];

// Kept for older imports: [key, title, description] tuples.
export const ADMIN_SECTIONS = ADMIN_SECTION_LIST.map((s) => [s.key, s.title, s.description] as const);

export const adminSectionTitle = (key: string) =>
  ADMIN_SECTION_LIST.find((s) => s.key === key)?.title ?? null;

function useMatches(query: string) {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return ADMIN_SECTION_LIST.map((s) => {
      const hit = s.keywords.find((k) => k.includes(q));
      const score = s.title.toLowerCase().includes(q)
        ? 2
        : hit || s.description.toLowerCase().includes(q)
          ? 1
          : 0;
      return { s, hit, score };
    })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [query]);
}

export default function AdminNavigation() {
  const path = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const matches = useMatches(query);
  const current = path.split("/")[3] ?? "";
  const link = (s: Section, hint?: string) => (
    <Link
      key={s.key}
      href={"/dashboard/admin/" + s.key}
      aria-current={current === s.key ? "page" : undefined}
      className={current === s.key ? "active" : ""}
      onClick={() => setQuery("")}
    >
      {s.title}
      {hint && <small>matches “{hint}”</small>}
    </Link>
  );
  return (
    <aside className="adminNav">
      <input
        className="adminNavSearch"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches?.[0]) router.push("/dashboard/admin/" + matches[0].s.key);
        }}
        placeholder="Find a setting…"
        aria-label="Find a setting"
      />
      <label className="adminNavMobile">
        <span className="uiHidden">Admin section</span>
        <select
          value={current || "admin"}
          onChange={(e) =>
            router.push(
              e.target.value === "admin" ? "/dashboard/admin" : "/dashboard/admin/" + e.target.value,
            )
          }
        >
          <option value="admin">Admin overview</option>
          {ADMIN_GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {ADMIN_SECTION_LIST.filter((s) => s.group === g).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <nav aria-label="Admin sections">
        <Link
          href="/dashboard/admin"
          className={path === "/dashboard/admin" ? "active" : ""}
          aria-current={path === "/dashboard/admin" ? "page" : undefined}
        >
          Overview
        </Link>
        {matches ? (
          matches.length ? (
            <div className="adminNavGroup">
              <h4>Results</h4>
              {matches.map(({ s, hit }) => link(s, hit))}
            </div>
          ) : (
            <p className="adminNavEmpty">No setting matches “{query}”.</p>
          )
        ) : (
          ADMIN_GROUPS.map((g) => (
            <div className="adminNavGroup" key={g}>
              <h4>{g}</h4>
              {ADMIN_SECTION_LIST.filter((s) => s.group === g).map((s) => link(s))}
            </div>
          ))
        )}
      </nav>
    </aside>
  );
}

export function AdminDirectory() {
  return (
    <div className="adminOverview">
      <header className="pageHeading">
        <div>
          <h1>Admin</h1>
          <p>Every server setting, grouped by what it's for. Use “Find a setting” to jump straight to one.</p>
        </div>
      </header>
      {ADMIN_GROUPS.map((g) => (
        <section key={g} className="adminOverviewGroup">
          <h2>{g}</h2>
          <div className="adminOverviewGrid">
            {ADMIN_SECTION_LIST.filter((s) => s.group === g).map((s) => (
              <Link key={s.key} href={"/dashboard/admin/" + s.key} className="adminOverviewCard">
                <b>{s.title}</b>
                <small>{s.description}</small>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
