// Single source of truth for dashboard navigation.
// The sidebar shows one entry per section; a section's tabs render as a tab bar
// at the top of every page in that section. Links a viewer cannot use are hidden.

import type { IconName } from "@/components/CommandIcon";

export type Feature = "portBattles" | "wiki" | "recruitment" | "music" | "membership";
export type Requirement = "admin" | "pbManager";

export type NavTab = {
  href: string;
  label: string;
  exact?: boolean;
  feature?: Feature;
  requires?: Requirement;
  /** Extra path prefixes that belong to this tab (e.g. legacy aliases). */
  match?: string[];
};

export type NavSection = {
  key: string;
  label: string;
  icon: IconName;
  tabs: NavTab[];
  requires?: Requirement;
  /** Seasonal sections are shown only while an event is running. */
  seasonal?: boolean;
};

export const NAV_SECTIONS: NavSection[] = [
  { key: "home", label: "Home", icon: "home", tabs: [{ href: "/dashboard", label: "Home", exact: true }] },
  {
    key: "battles",
    label: "Port Battles",
    icon: "battle",
    tabs: [
      {
        href: "/dashboard/port-battles",
        label: "Battles",
        feature: "portBattles",
        match: ["/dashboard/port-dossier"],
      },
      {
        href: "/dashboard/battle-prep",
        label: "Prep",
        feature: "portBattles",
        match: ["/dashboard/prep-review"],
      },
      { href: "/dashboard/battle-review", label: "Review", feature: "portBattles" },
      { href: "/dashboard/after-action-reports", label: "Reports", feature: "portBattles" },
      {
        href: "/dashboard/admin/port-battles",
        label: "Setup",
        feature: "portBattles",
        requires: "pbManager",
      },
    ],
  },
  {
    key: "fleet",
    label: "Fleet & Wiki",
    icon: "ship",
    tabs: [
      { href: "/dashboard/ships", label: "Ships" },
      { href: "/dashboard/ship-builder", label: "Ship Builder" },
      { href: "/dashboard/map", label: "Map" },
      { href: "/dashboard/wiki", label: "Wiki", feature: "wiki" },
    ],
  },
  {
    key: "community",
    label: "Community",
    icon: "users",
    tabs: [
      { href: "/dashboard/members", label: "Members", exact: true, feature: "membership" },
      { href: "/dashboard/members/leave", label: "Leave of Absence", feature: "membership" },
      { href: "/dashboard/recruitment", label: "Recruitment", feature: "recruitment" },
      { href: "/dashboard/diplomacy", label: "Guilds & Alliances" },
      { href: "/dashboard/guild-ledger", label: "Guild Ledger" },
      { href: "/dashboard/feedback", label: "Feedback" },
    ],
  },
  {
    key: "games",
    label: "Games",
    icon: "map",
    tabs: [
      { href: "/dashboard/minecraft", label: "Minecraft" },
      { href: "/dashboard/clash", label: "Clash of Clans" },
    ],
  },
  {
    key: "music",
    label: "Music",
    icon: "music",
    tabs: [{ href: "/dashboard/music", label: "Music", feature: "music" }],
  },
  {
    key: "events",
    label: "Events",
    icon: "activity",
    seasonal: true,
    tabs: [{ href: "/dashboard/events", label: "Event" }],
  },
  {
    key: "admin",
    label: "Admin",
    icon: "admin",
    requires: "admin",
    // Admin has its own section list (AdminNavigation), so no tab bar here.
    tabs: [{ href: "/dashboard/admin", label: "Admin", match: ["/dashboard/sentinel"] }],
  },
];

export type Viewer = {
  admin: boolean;
  pbManager: boolean;
  featureFlags: Record<string, boolean | undefined>;
  /** Seasonal event label, or null when no event should be shown. */
  event: string | null;
};

const allowed = (requires: Requirement | undefined, v: Viewer) =>
  !requires || (requires === "admin" ? v.admin : v.pbManager || v.admin);

export function tabMatches(tab: NavTab, pathname: string) {
  const prefixes = [tab.href, ...(tab.match ?? [])];
  return prefixes.some((p) =>
    tab.exact && p === tab.href ? pathname === p : pathname === p || pathname.startsWith(p + "/"),
  );
}

/** Sections and tabs this viewer can actually use. */
export function visibleSections(v: Viewer): NavSection[] {
  return NAV_SECTIONS.filter((s) => allowed(s.requires, v) && (!s.seasonal || v.event))
    .map((s) => ({
      ...s,
      label: s.seasonal && v.event ? v.event : s.label,
      tabs: s.tabs.filter(
        (t) => allowed(t.requires, v) && (!t.feature || v.featureFlags[t.feature] !== false),
      ),
    }))
    .filter((s) => s.tabs.length > 0);
}

/** The section and tab for a path, preferring the most specific match. */
export function locate(sections: NavSection[], pathname: string) {
  let best: { section: NavSection; tab: NavTab; len: number } | null = null;
  for (const section of sections)
    for (const tab of section.tabs)
      if (tabMatches(tab, pathname)) {
        const len = Math.max(
          ...[tab.href, ...(tab.match ?? [])].filter((p) => pathname.startsWith(p)).map((p) => p.length),
        );
        if (!best || len > best.len) best = { section, tab, len };
      }
  return best ? { section: best.section, tab: best.tab } : null;
}

/** Where a sidebar entry should go: the first tab of the section. */
export const sectionHref = (s: NavSection) => s.tabs[0].href;

/** Feature flag that gates a route, used to show the "module disabled" state. */
export function routeFeature(pathname: string): Feature | null {
  for (const s of NAV_SECTIONS)
    for (const t of s.tabs) if (t.feature && tabMatches(t, pathname)) return t.feature;
  if (pathname.startsWith("/dashboard/admin/membership")) return "membership";
  return null;
}

/**
 * Whether to show the seasonal Events entry. Leaders always see it so they can
 * set up the next event; members see it while an event runs and for two weeks
 * after it ends (prize draws, results).
 */
export function eventLabel(
  status: { active?: boolean; name?: string | null; endsAt?: string | null; canManage?: boolean } | null,
  now = Date.now(),
) {
  if (!status) return null;
  const grace = 14 * 24 * 60 * 60 * 1000;
  const running = Boolean(status.active) && (!status.endsAt || now < Date.parse(status.endsAt) + grace);
  if (running) return status.name?.trim() || "Events";
  return status.canManage ? "Events" : null;
}
