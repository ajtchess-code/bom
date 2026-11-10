"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import CommandIcon from "./CommandIcon";

type Category = "all" | "operations" | "wosb" | "community" | "administration";
type Module = {
  href: string;
  title: string;
  description: string;
  category: Exclude<Category, "all">;
  icon: any;
  badge?: string;
  status?: string;
  statusTone?: "good" | "warn" | "neutral";
};

const CATEGORY_LABELS: Record<Category, string> = {
  all: "All modules",
  operations: "WoSB Port Battle Management",
  wosb: "World of Sea Battles",
  community: "Community",
  administration: "Administration",
};

export default function DashboardModules({
  admin,
  musicActive,
  musicQueue,
  sentinelEvents,
  healthOverall,
}: {
  admin: boolean;
  musicActive: boolean;
  musicQueue: number;
  sentinelEvents: number;
  healthOverall?: string | null;
}) {
  const [category, setCategory] = useState<Category>("all");
  const modules = useMemo<Module[]>(
    () => [
      {
        href: "/dashboard/port-battles",
        title: "Port Battles",
        description: "Schedule battles, manage signups, confirm fleets and plan officer assignments.",
        category: "operations",
        icon: "battle",
        badge: "Fleet Ops",
        status: "Ready",
        statusTone: "good",
      },
      {
        href: "/dashboard/battle-review",
        title: "Battle Review",
        description: "Review Battle Videos And VODs.",
        category: "operations",
        icon: "activity",
        badge: "VOD",
        status: "Ready",
        statusTone: "good",
      },
      {
        href: "/dashboard/after-action-reports",
        title: "After Action Reports",
        description: "Battle History, Signups And Statistics.",
        category: "operations",
        icon: "battle",
        badge: "History",
        status: "Ready",
        statusTone: "good",
      },
      {
        href: "/dashboard/battle-prep",
        title: "Battle Prep",
        description: "Prepare tactical plans, review VODs and keep battle prep in one workspace.",
        category: "operations",
        icon: "activity",
        badge: "Tactics",
        status: "Ready",
        statusTone: "good",
      },
      {
        href: "/dashboard/ships",
        title: "Ships",
        description: "Browse ship statistics, roles, history and visual references.",
        category: "wosb",
        icon: "ship",
        badge: "Reference",
        status: "Available",
        statusTone: "neutral",
      },
      {
        href: "/dashboard/ship-builder",
        title: "Build Library",
        description: "Create, compare, save and share fleet loadouts with the guild.",
        category: "wosb",
        icon: "hammer",
        badge: "Builder",
        status: "Available",
        statusTone: "neutral",
      },
      {
        href: "/dashboard/map",
        title: "Map",
        description: "Explore ports, resources, landmarks and current operational overlays.",
        category: "wosb",
        icon: "map",
        badge: "World",
        status: "Available",
        statusTone: "neutral",
      },
      {
        href: "/dashboard/wiki",
        title: "Wiki",
        description: "Ask questions naturally or browse organized World of Sea Battles knowledge.",
        category: "wosb",
        icon: "book",
        badge: "Knowledge",
        status: "Available",
        statusTone: "neutral",
      },
      {
        href: "/dashboard/members",
        title: "Members",
        description: "Browse the guild roster, update your captain profile and manage membership tools.",
        category: "community",
        icon: "user",
        badge: "Guild",
        status: "Ready",
        statusTone: "good",
      },
      {
        href: "/dashboard/recruitment",
        title: "Recruitment",
        description: "Track applications, interviews, trials and final guild decisions.",
        category: "community",
        icon: "users",
        badge: "Guild",
        status: "Open",
        statusTone: "neutral",
      },
      {
        href: "/dashboard/music",
        title: "Music",
        description: "Control playback, queue music, discover tracks and manage listening rooms.",
        category: "community",
        icon: "music",
        badge: "Community",
        status: musicActive ? `${musicQueue} queued` : "Ready",
        statusTone: "good",
      },
      {
        href: "/dashboard/feedback",
        title: "Feedback",
        description: "Report problems, suggest improvements and review dashboard releases.",
        category: "community",
        icon: "feedback",
        badge: "Community",
        status: "Open",
        statusTone: "neutral",
      },
      ...(admin
        ? [
            {
              href: "/dashboard/sentinel",
              title: "Sentinel",
              description: "Search server history, review audit activity, backups and recovery tools.",
              category: "administration" as const,
              icon: "sentinel",
              badge: "Admin",
              status: `${sentinelEvents.toLocaleString()} events`,
              statusTone: "neutral" as const,
            },
            {
              href: "/dashboard/admin/membership",
              title: "Membership & Welcome",
              description:
                "Configure Welcome, the Discord Control Desk, Leave, roster, Custom Roles, Guild Prefixes and Role Connections.",
              category: "administration" as const,
              icon: "users",
              badge: "Admin",
              status: "Configure",
              statusTone: "neutral" as const,
            },
            {
              href: "/dashboard/admin",
              title: "Administration",
              description: "Configure the bot, permissions, integrations, branding and diagnostics.",
              category: "administration" as const,
              icon: "admin",
              badge: "Admin",
              status: healthOverall === "healthy" ? "Healthy" : healthOverall ? "Needs attention" : "Ready",
              statusTone:
                healthOverall === "healthy"
                  ? ("good" as const)
                  : healthOverall
                    ? ("warn" as const)
                    : ("neutral" as const),
            },
          ]
        : []),
    ],
    [admin, musicActive, musicQueue, sentinelEvents, healthOverall],
  );
  const filtered = category === "all" ? modules : modules.filter((x) => x.category === category);
  const categories = (Object.keys(CATEGORY_LABELS) as Category[]).filter(
    (x) => x !== "administration" || admin,
  );

  return (
    <section className="moduleDirectory" aria-labelledby="module-directory-title">
      <div className="moduleDirectoryHead">
        <div>
          <h2 id="module-directory-title">Modules</h2>
          <p>Everything connected to the Band of Misfits portal.</p>
        </div>
        <span>
          {filtered.length} {filtered.length === 1 ? "module" : "modules"}
        </span>
      </div>
      <div className="moduleTabs" role="tablist" aria-label="Module categories">
        {categories.map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={category === key}
            className={category === key ? "active" : ""}
            onClick={() => setCategory(key)}
          >
            {CATEGORY_LABELS[key]}
          </button>
        ))}
      </div>
      <div className="moduleGrid">
        {filtered.map((mod) => (
          <article className="moduleCard" key={mod.href}>
            <div className="moduleCardIcon">
              <CommandIcon name={mod.icon} size={24} />
            </div>
            <div className="moduleCardBadges">
              <span>{mod.badge}</span>
              <i className={`moduleState ${mod.statusTone ?? "neutral"}`}>{mod.status}</i>
            </div>
            <div className="moduleCardCopy">
              <h3>{mod.title}</h3>
              <p>{mod.description}</p>
            </div>
            <Link className="moduleOpen" href={mod.href}>
              <span>Open</span>
              <CommandIcon name="arrow" size={15} />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
