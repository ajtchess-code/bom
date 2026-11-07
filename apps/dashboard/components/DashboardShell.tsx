"use client";

import DashboardAccessibility from "./DashboardAccessibility";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import CommandIcon from "./CommandIcon";
import { adminSectionTitle } from "./AdminNavigation";
import {
  visibleSections,
  locate,
  sectionHref,
  routeFeature as featureForRoute,
  eventLabel,
  type NavSection,
} from "@/lib/navigation";

type NavItem = { href: string; label: string; icon: any; exact?: boolean; group: string };
type Experience = {
  preferences: any;
  favorites: any[];
  recents: any[];
  notifications: any[];
  unread: number;
};
type Toast = {
  id: number;
  message: string;
  tone: string;
  actionLabel?: string;
  action?: () => void;
  duration?: number;
};

const EMPTY: Experience = { preferences: {}, favorites: [], recents: [], notifications: [], unread: 0 };
async function platformApi(path: string, init: RequestInit = {}) {
  const h = new Headers(init.headers);
  if (init.body && !h.has("content-type")) h.set("content-type", "application/json");
  const r = await fetch(`/api/internal/platform${path}`, { ...init, headers: h, cache: "no-store" });
  const text = await r.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text };
  }
  if (!r.ok) throw new Error(body?.message ?? body?.error ?? `Request failed (${r.status})`);
  return body;
}
async function experienceApi(path: string, init: RequestInit = {}) {
  const h = new Headers(init.headers);
  if (init.body && !h.has("content-type")) h.set("content-type", "application/json");
  const r = await fetch(`/api/internal/feedback${path}`, { ...init, headers: h, cache: "no-store" });
  const text = await r.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text };
  }
  if (!r.ok) throw new Error(body?.message ?? body?.error ?? `Request failed (${r.status})`);
  return body;
}
function sectionFor(pathname: string) {
  if (pathname.startsWith("/dashboard/sentinel"))
    return { title: "Sentinel", subtitle: "Audit, recovery and server history" };
  if (pathname.startsWith("/dashboard/recruitment"))
    return { title: "Recruitment", subtitle: "Applications, interviews, trials and final review" };
  if (pathname.startsWith("/dashboard/diplomacy"))
    return { title: "Guilds & Alliances", subtitle: "Selected guilds and alliance relationships" };
  if (pathname.startsWith("/dashboard/guild-ledger"))
    return { title: "Guild Ledger", subtitle: "Donations, chests and treasury" };
  if (pathname.startsWith("/dashboard/admin/permission-presets"))
    return { title: "Permission Presets", subtitle: "Copy and apply channel permission layouts" };
  if (pathname.startsWith("/dashboard/members/leave"))
    return { title: "Leave of Absence", subtitle: "Away records, check-ins and returning members" };
  if (pathname.startsWith("/dashboard/members"))
    return { title: "Members", subtitle: "Guild roster, profiles and membership" };
  if (pathname.startsWith("/dashboard/music"))
    return { title: "Music", subtitle: "Playback, queues and listening" };
  if (pathname.startsWith("/dashboard/wiki"))
    return { title: "Wiki", subtitle: "World of Sea Battles knowledge, guides and calculators" };
  if (pathname.startsWith("/dashboard/ship-builder"))
    return { title: "Ship Builder", subtitle: "Private fleet fitting and build repository" };
  if (pathname.startsWith("/dashboard/ships"))
    return { title: "Ships", subtitle: "Fleet reference and comparison" };
  if (pathname.startsWith("/dashboard/map"))
    return { title: "Map", subtitle: "World locations and operational overlays" };
  if (pathname.startsWith("/dashboard/port-battles"))
    return { title: "Port Battles", subtitle: "Signups, roster planning and fleet readiness" };
  if (pathname.startsWith("/dashboard/battle-prep"))
    return { title: "Battle Prep", subtitle: "Tactical Planning" };
  if (pathname.startsWith("/dashboard/battle-review"))
    return { title: "Battle Review", subtitle: "Video and VOD Analysis" };
  if (pathname.startsWith("/dashboard/after-action-reports"))
    return { title: "After Action Reports", subtitle: "Battle History and Fleet Statistics" };
  if (pathname.startsWith("/dashboard/prep-review"))
    return { title: "Prep & Review", subtitle: "Tactical planning and VOD analysis" };
  if (pathname.startsWith("/dashboard/feedback"))
    return { title: "Feedback", subtitle: "Bug reports, suggestions and releases" };
  if (pathname.startsWith("/dashboard/admin/ai-providers"))
    return { title: "AI Providers", subtitle: "Groq, Gemini and feature-level routing" };
  if (pathname.startsWith("/dashboard/admin/banter"))
    return { title: "BOM Banter", subtitle: "Guild jokes and personality" };
  if (pathname.startsWith("/dashboard/admin/membership"))
    return { title: "Membership & Welcome", subtitle: "Onboarding, roles and member automation" };
  if (pathname.startsWith("/dashboard/admin/brand-kit"))
    return { title: "Brand Kit", subtitle: "BOM visual system" };
  if (pathname.startsWith("/dashboard/admin/port-battles"))
    return { title: "Port Battle Setup", subtitle: "Fleet catalogue, guilds and default doctrine" };
  if (pathname.startsWith("/dashboard/admin"))
    return { title: "Administration", subtitle: "Configuration and diagnostics" };
  return { title: "Dashboard", subtitle: "Band of Misfits dashboard" };
}
function prettySegment(v: string) {
  try {
    v = decodeURIComponent(v);
  } catch {}
  return v.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function relativeTime(v: any) {
  const ms = Date.now() - +new Date(v);
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(v).toLocaleDateString();
}

export default function DashboardShell({
  children,
  session,
  admin,
}: {
  children: React.ReactNode;
  session: any;
  admin: boolean;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false),
    [paletteOpen, setPaletteOpen] = useState(false),
    [noticeOpen, setNoticeOpen] = useState(false),
    [accountOpen, setAccountOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [quickCreateOpen, setQuickCreateOpen] = useState(false),
    [pageDirty, setPageDirty] = useState(false);
  const [experience, setExperience] = useState<Experience>(EMPTY),
    [search, setSearch] = useState(""),
    [searchResults, setSearchResults] = useState<any[]>([]),
    [searching, setSearching] = useState(false),
    [toasts, setToasts] = useState<Toast[]>([]),
    [inspector, setInspector] = useState<any>(null),
    [online, setOnline] = useState(true),
    [lastSync, setLastSync] = useState<number | null>(null),
    [noticeFilter, setNoticeFilter] = useState<"all" | "unread">("all"),
    [noticeCategory, setNoticeCategory] = useState<"all" | "feedback" | "updates" | "battles">("all");
  const [theme, setTheme] = useState<"dark" | "light">("dark"),
    [platform, setPlatform] = useState<any>({ featureFlags: {} }),
    [notificationPrefs, setNotificationPrefs] = useState<any>(null),
    [whatsNewOpen, setWhatsNewOpen] = useState(false),
    [memberMe, setMemberMe] = useState<any>(null),
    [actionUsage, setActionUsage] = useState<any[]>([]);
  const [searchNotice, setSearchNotice] = useState("");
  const [eventStatus, setEventStatus] = useState<any>(null);
  const searchRef = useRef<HTMLInputElement | null>(null),
    toastId = useRef(0),
    browserShown = useRef<Set<string>>(new Set());
  const section = sectionFor(pathname);
  const pbManager = Boolean(memberMe?.capabilities?.pbManager ?? admin);
  const sections: NavSection[] = useMemo(
    () =>
      visibleSections({
        admin,
        pbManager,
        featureFlags: platform?.featureFlags ?? {},
        event: eventLabel(eventStatus),
      }),
    [admin, pbManager, platform, eventStatus],
  );
  // Flat list of every link the viewer can open (search palette, breadcrumbs, mobile dock).
  const nav: NavItem[] = sections.flatMap((s) =>
    s.tabs.map((t) => ({
      href: t.href,
      label: s.tabs.length > 1 ? t.label : s.label,
      icon: s.icon,
      exact: t.exact,
      group: s.label,
    })),
  );
  const here = locate(sections, pathname),
    activeSection = here?.section ?? null;
  const deepPage = Boolean(here && pathname !== here.tab.href && !here.tab.exact);
  const pageTitle = deepPage
    ? ((pathname.startsWith("/dashboard/admin/") ? adminSectionTitle(pathname.split("/")[3] ?? "") : null) ??
      (() => {
        const last = pathname.split("/").filter(Boolean).at(-1) ?? "";
        return /^[0-9a-f-]{16,}$|^\d+$/i.test(last) ? section.title : prettySegment(last);
      })())
    : (here?.section.label ?? section.title);
  const routeFeature = featureForRoute(pathname);
  const disabledFeature =
    routeFeature && platform?.featureFlags?.[routeFeature] === false ? routeFeature : null;
  const active = (item: NavItem) => (item.exact ? pathname === item.href : pathname.startsWith(item.href));
  const avatar =
      memberMe?.avatar ??
      (session.avatar
        ? `https://cdn.discordapp.com/avatars/${session.id}/${session.avatar}.png?size=128`
        : null),
    display = memberMe?.displayName ?? session.globalName ?? session.username;
  const prefs = experience.preferences ?? {};
  const defaultDock = ["/dashboard", "/dashboard/port-battles", "/dashboard/ship-builder", "/dashboard/wiki"];
  const mobileDock = (Array.isArray(prefs.mobileDock) ? prefs.mobileDock : defaultDock)
    .filter((href: string) => nav.some((x) => x.href === href))
    .slice(0, 4);
  const defaultHomeOrder = ["recents", "attention", "history"];
  const homeOrder = (Array.isArray(prefs.homeOrder) ? prefs.homeOrder : defaultHomeOrder).filter(
    (x: string) => defaultHomeOrder.includes(x),
  );
  for (const x of defaultHomeOrder) if (!homeOrder.includes(x)) homeOrder.push(x);
  const currentFavorite = experience.favorites.some((x: any) => x.kind === "page" && x.item_key === pathname);
  const crumbs = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean).slice(1);
    let href = "/dashboard";
    const out = [{ label: "Dashboard", href: "/dashboard" }];
    for (const part of parts) {
      href += `/${part}`;
      if (href === "/dashboard") continue;
      const found = nav.find((x) => x.href === href);
      out.push({ label: found?.label ?? prettySegment(part), href });
    }
    return out.slice(-4);
  }, [pathname]);

  async function refreshExperience() {
    try {
      const fresh = await experienceApi("/experience");
      setExperience(fresh);
      try {
        localStorage.setItem(
          `bom:last-experience:${session.id}`,
          JSON.stringify({ at: Date.now(), value: fresh }),
        );
      } catch {}
      setOnline(true);
      setLastSync(Date.now());
    } catch {
      setOnline(false);
      try {
        const raw = localStorage.getItem(`bom:last-experience:${session.id}`);
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached?.value) setExperience(cached.value);
          if (cached?.at) setLastSync(Number(cached.at));
        }
      } catch {}
    }
  }
  async function savePreferences(next: any) {
    const merged = { ...prefs, ...next };
    setExperience((x) => ({ ...x, preferences: merged }));
    try {
      await experienceApi("/experience/preferences", {
        method: "PUT",
        body: JSON.stringify({ preferences: merged }),
      });
    } catch {}
  }
  function addToast(detail: any) {
    const id = ++toastId.current,
      t: Toast = {
        id,
        message: String(detail?.message ?? detail ?? ""),
        tone: detail?.tone ?? "info",
        actionLabel: detail?.actionLabel,
        action: detail?.action,
        duration: Number(detail?.duration ?? 4500),
      };
    setToasts((x) => [...x.slice(-3), t]);
    window.setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.duration);
  }
  async function recordRecent(detail: any) {
    try {
      await experienceApi("/experience/recent", { method: "POST", body: JSON.stringify(detail) });
    } catch {}
  }
  async function markRead(keys?: string[]) {
    try {
      await experienceApi("/experience/notifications/read", {
        method: "POST",
        body: JSON.stringify(keys ? { keys } : { all: true }),
      });
      setExperience((x) => ({
        ...x,
        notifications: x.notifications.map((n: any) =>
          !keys || keys.includes(n.key) ? { ...n, read: true } : n,
        ),
        unread: keys
          ? Math.max(
              0,
              x.unread - keys.filter((k) => x.notifications.some((n: any) => n.key === k && !n.read)).length,
            )
          : 0,
      }));
    } catch {}
  }
  async function saveNotificationPrefs(next: any) {
    const merged = { ...(notificationPrefs ?? {}), ...next };
    setNotificationPrefs(merged);
    try {
      await platformApi("/notification-preferences", {
        method: "PUT",
        body: JSON.stringify({
          dashboardEnabled: merged.dashboard_enabled ?? merged.dashboardEnabled ?? true,
          discordDmEnabled: merged.discord_dm_enabled ?? merged.discordDmEnabled ?? true,
          browserEnabled: merged.browser_enabled ?? merged.browserEnabled ?? false,
          categories: merged.categories ?? {},
          quietHours: merged.quiet_hours ?? merged.quietHours ?? {},
        }),
      });
      addToast({ message: "Notification preferences saved.", tone: "success" });
    } catch {
      addToast({ message: "Could not save notification preferences.", tone: "error" });
    }
  }

  useEffect(() => {
    void refreshExperience();
    void platformApi("/features")
      .then(setPlatform)
      .catch(() => {});
    void platformApi("/me")
      .then(setMemberMe)
      .catch(() => {});
    // The seasonal Events section is retired until the next event.
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshExperience();
        void platformApi("/me")
          .then(setMemberMe)
          .catch(() => {});
      }
    }, 60000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let next: unknown = prefs.theme;
    try {
      if (next !== "dark" && next !== "light") next = localStorage.getItem("bom:theme");
      if (next !== "dark" && next !== "light")
        next = window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
    } catch {
      next = "dark";
    }
    const resolved = next === "light" ? "light" : "dark";
    setTheme(resolved);
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }, [prefs.theme]);
  useEffect(() => {
    let cls = 0,
      maxInteraction = 0;
    const observers: PerformanceObserver[] = [];
    const report = (metric: string, value: number, rating?: string) => {
      if (!Number.isFinite(value) || value < 0) return;
      void experienceApi("/experience/performance", {
        method: "POST",
        body: JSON.stringify({ metric, route: pathname, value, rating }),
      }).catch(() => {});
    };
    try {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (nav && pathname === "/dashboard") report("NAVIGATION", nav.duration);
      const lcp = new PerformanceObserver((list) => {
        const e = list.getEntries().at(-1) as any;
        if (e)
          report(
            "LCP",
            Number(e.startTime ?? 0),
            Number(e.startTime ?? 0) <= 2500
              ? "good"
              : Number(e.startTime ?? 0) <= 4000
                ? "needs-improvement"
                : "poor",
          );
      });
      lcp.observe({ type: "largest-contentful-paint", buffered: true } as any);
      observers.push(lcp);
      const shift = new PerformanceObserver((list) => {
        for (const e of list.getEntries() as any) if (!e.hadRecentInput) cls += Number(e.value ?? 0);
      });
      shift.observe({ type: "layout-shift", buffered: true } as any);
      observers.push(shift);
      const events = new PerformanceObserver((list) => {
        for (const e of list.getEntries() as any)
          maxInteraction = Math.max(maxInteraction, Number(e.duration ?? 0));
      });
      events.observe({ type: "event", buffered: true, durationThreshold: 40 } as any);
      observers.push(events);
    } catch {}
    const timer = window.setTimeout(() => {
      if (cls > 0) report("CLS", cls, cls <= 0.1 ? "good" : cls <= 0.25 ? "needs-improvement" : "poor");
      if (maxInteraction > 0)
        report(
          "INP",
          maxInteraction,
          maxInteraction <= 200 ? "good" : maxInteraction <= 500 ? "needs-improvement" : "poor",
        );
    }, 10000);
    return () => {
      window.clearTimeout(timer);
      for (const o of observers)
        try {
          o.disconnect();
        } catch {}
    };
  }, [pathname]);
  useEffect(() => {
    setMobileMenuOpen(false);
    setPaletteOpen(false);
    setNoticeOpen(false);
    setAccountOpen(false);
    setPageDirty(false);
    void recordRecent({
      kind: "page",
      key: pathname,
      label: section.title,
      href: pathname,
      metadata: { subtitle: section.subtitle },
    });
  }, [pathname]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const typing =
        ["input", "textarea", "select"].includes(tag) ||
        Boolean((e.target as HTMLElement)?.isContentEditable);
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
        setNoticeOpen(false);
        setAccountOpen(false);
        setSettingsOpen(false);
        setQuickCreateOpen(false);
        setMobileMenuOpen(false);
        setInspector(null);
      }
    };
    const toast = (e: any) => addToast(e.detail);
    const recent = (e: any) => recordRecent(e.detail);
    const dirty = (e: any) => setPageDirty(Boolean(e.detail?.dirty));
    const inspect = (e: any) => setInspector(e.detail);
    const wentOnline = () => {
      setOnline(true);
      void refreshExperience();
    };
    const wentOffline = () => setOnline(false);
    window.addEventListener("keydown", key);
    window.addEventListener("bom:toast", toast);
    window.addEventListener("bom:recent", recent);
    window.addEventListener("bom:dirty", dirty);
    window.addEventListener("bom:inspect", inspect);
    window.addEventListener("online", wentOnline);
    window.addEventListener("offline", wentOffline);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("bom:toast", toast);
      window.removeEventListener("bom:recent", recent);
      window.removeEventListener("bom:dirty", dirty);
      window.removeEventListener("bom:inspect", inspect);
      window.removeEventListener("online", wentOnline);
      window.removeEventListener("offline", wentOffline);
    };
  }, []);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (!pageDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const capture = (e: MouseEvent) => {
      if (
        !pageDirty ||
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const target = (e.target as HTMLElement)?.closest?.("a") as HTMLAnchorElement | null;
      if (!target) return;
      const href = target.getAttribute("href") ?? "";
      if (!href.startsWith("/dashboard") || href === pathname) return;
      if (!window.confirm("You have unsaved changes. Leave this page and discard them?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", capture, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", capture, true);
    };
  }, [pageDirty, pathname]);
  useEffect(() => {
    if (paletteOpen) setTimeout(() => searchRef.current?.focus(), 20);
  }, [paletteOpen]);
  useEffect(() => {
    if (!paletteOpen) {
      setSearch("");
      setSearchResults([]);
      setSearching(false);
      setSearchNotice("");
      return;
    }
    if (search.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    setSearchNotice("");
    const id = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/internal/search?q=${encodeURIComponent(search.trim())}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw Error("Search unavailable");
        const r = await response.json();
        if (!controller.signal.aborted) {
          setSearchResults(r.results ?? []);
          if (r.unavailable?.length)
            setSearchNotice(`Some search sources are unavailable: ${r.unavailable.join(", ")}`);
        }
      } catch (e: any) {
        if (!controller.signal.aborted) {
          setSearchResults([]);
          setSearchNotice("Search could not complete. Please try again.");
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(id);
      controller.abort();
    };
  }, [search, paletteOpen]);

  const canPB = Boolean(memberMe?.capabilities?.pbManager ?? admin),
    canRecruit = Boolean(memberMe?.capabilities?.recruitmentStaff ?? admin);
  const commandActions = [
    ...(canPB
      ? [
          {
            kind: "Action",
            label: "Schedule A Port Battle",
            detail: "Open Port Battles and start a new battle",
            href: "/dashboard/port-battles?new=1",
            key: "create-pb",
          },
        ]
      : []),
    {
      kind: "Action",
      label: "Create A Ship Build",
      detail: "Open the Ship Builder",
      href: "/dashboard/ship-builder?new=1",
      key: "create-build",
    },
    {
      kind: "Action",
      label: "Ask The Wiki",
      detail: "Jump to natural-language Wiki search",
      href: "/dashboard/wiki#ask",
      key: "ask-wiki",
    },
    {
      kind: "Action",
      label: "Open My Profile",
      detail: "Update your captain profile and ships",
      href: "/dashboard/members?view=profile",
      key: "profile",
    },
    ...(canRecruit
      ? [
          {
            kind: "Action",
            label: "Open Recruitment Pipeline",
            detail: "Review applications, interviews, and trials",
            href: "/dashboard/recruitment",
            key: "recruitment",
          },
        ]
      : []),
    {
      kind: "Action",
      label: "Request A Custom Role",
      detail: "Request or update your personal Discord role",
      href: "/dashboard/members?view=role",
      key: "custom-role",
    },
    {
      kind: "Action",
      label: "Report An Issue",
      detail: "Create a bug report or support request",
      href: "/dashboard/feedback?new=bug",
      key: "report-bug",
    },
    {
      kind: "Action",
      label: "Suggest An Improvement",
      detail: "Send a dashboard suggestion",
      href: "/dashboard/feedback?new=suggestion",
      key: "suggest",
    },
    ...(admin
      ? [
          {
            kind: "Action",
            label: "Ask Sentinel",
            detail: "Investigate server history in natural language",
            href: "/dashboard/sentinel?tab=ask",
            key: "ask-sentinel",
          },
          {
            kind: "Action",
            label: "Open System Health",
            detail: "Review services, workers and performance",
            href: "/dashboard/admin?view=diagnostics",
            key: "health",
          },
        ]
      : []),
  ];
  const usageMap = new Map(actionUsage.map((x: any) => [String(x.action_key), Number(x.use_count ?? 0)]));
  const rankedActions = [...commandActions].sort(
    (a, b) => (usageMap.get(b.key) ?? 0) - (usageMap.get(a.key) ?? 0) || a.label.localeCompare(b.label),
  );
  async function recordActionUse(key: string) {
    setActionUsage((rows: any[]) => {
      const found = rows.find((x) => x.action_key === key);
      return found
        ? rows.map((x) =>
            x.action_key === key
              ? { ...x, use_count: Number(x.use_count ?? 0) + 1, last_used_at: new Date().toISOString() }
              : x,
          )
        : [...rows, { action_key: key, use_count: 1, last_used_at: new Date().toISOString() }];
    });
    try {
      await platformApi("/actions/use", { method: "POST", body: JSON.stringify({ key }) });
    } catch {}
  }
  const needle = search.toLowerCase();
  const staticResults = nav
    .filter((x) => !search || x.label.toLowerCase().includes(needle))
    .map((x) => ({ kind: "Page", label: x.label, detail: x.group, href: x.href, key: x.href }));
  const actionResults = rankedActions.filter(
    (x) => !search || `${x.label} ${x.detail}`.toLowerCase().includes(needle),
  );
  const paletteResults =
    search.trim().length >= 2 ? [...actionResults, ...staticResults, ...searchResults].slice(0, 28) : [];
  const snoozes = prefs.notificationSnoozes ?? {};
  const noticeCategoryOf = (n: any) =>
    n.kind === "release" ? "updates" : n.kind === "battle" ? "battles" : "feedback";
  const shownNotifications = experience.notifications
    .filter((n: any) => Number(snoozes[n.key] ?? 0) <= Date.now())
    .filter((n: any) => noticeFilter === "all" || !n.read)
    .filter((n: any) => noticeCategory === "all" || noticeCategoryOf(n) === noticeCategory);
  const unreadShown = shownNotifications.filter((n: any) => !n.read).length;
  async function snoozeNotification(key: string) {
    await savePreferences({ notificationSnoozes: { ...snoozes, [key]: Date.now() + 60 * 60 * 1000 } });
    addToast({ message: "Notification snoozed for 1 hour.", tone: "success" });
  }
  async function chooseTheme(next: "dark" | "light") {
    setTheme(next);
    try {
      localStorage.setItem("bom:theme", next);
    } catch {}
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    await savePreferences({ theme: next });
  }

  const latestUnreadRelease = experience.notifications.find((n: any) => n.kind === "release" && !n.read);
  const shellClass = `commandDeck shell ${prefs.sidebarCollapsed ? "sidebarCollapsed" : ""} ${prefs.density === "compact" ? "densityCompact" : ""} ${prefs.reducedMotion ? "reducedMotion" : ""}`;

  return (
    <div className={shellClass} data-theme={theme}>
      <aside className="sidebar commandSidebar">
        <Link
          href="/dashboard"
          className="brand commandBrand floatingBrand"
          aria-label="Band of Misfits dashboard"
        >
          <span className="brandCrest">
            <img src="/branding/defaults/bom-logo.png" alt="BOM" />
          </span>
          <span className="brandWords">
            <b>Band of Misfits</b>
          </span>
        </Link>
        <nav className="commandNav" aria-label="Primary navigation">
          <div className="commandNavGroup">
            {sections.map((section) => {
              const on = activeSection?.key === section.key;
              return (
                <Link
                  key={section.key}
                  href={sectionHref(section)}
                  className={on ? "active" : ""}
                  aria-current={on ? "page" : undefined}
                  title={prefs.sidebarCollapsed ? section.label : undefined}
                >
                  <span className="navIcon">
                    <CommandIcon name={section.icon} size={18} />
                  </span>
                  <span className="navText">{section.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
        <button
          className="sidebarCollapse"
          type="button"
          onClick={() => savePreferences({ sidebarCollapsed: !prefs.sidebarCollapsed })}
          aria-label={prefs.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {prefs.sidebarCollapsed ? "›" : "‹"}
          <span>{prefs.sidebarCollapsed ? "" : "Collapse"}</span>
        </button>
        <div className={`sidebarSignal ${online ? "" : "degraded"}`}>
          <span className="signalDot" />
          <div>
            <b>BOM systems</b>
            <small>
              {online ? (lastSync ? `Updated ${relativeTime(lastSync)}` : "Connected") : "Reconnecting…"}
            </small>
          </div>
        </div>
        <div className="sidebarFooter">
          <button className="account commandAccount accountButton" onClick={() => setAccountOpen((v) => !v)}>
            <div className="avatar">
              {avatar ? <img src={avatar} alt="" /> : display.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <b>{display}</b>
              <small>@{session.username}</small>
            </div>
            <span>⌄</span>
          </button>
        </div>
      </aside>
      <div className="commandWorkspace">
        <a className="bomSkipLink" href="#dashboard-content">
          Skip to content
        </a>
        <header className="commandTopbar">
          <div className="topbarContext">
            {deepPage && here && (
              <nav className="dashboardBreadcrumbs" aria-label="Breadcrumb">
                <span>
                  <Link href={here.tab.href}>
                    {here.section.tabs.length > 1 ? here.tab.label : here.section.label}
                  </Link>
                  <i>/</i>
                </span>
              </nav>
            )}
            <p className="topbarTitle">{pageTitle}</p>
          </div>
          <div className="topbarActions">
            <button
              type="button"
              className="topbarSearch"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search (Ctrl+K)"
            >
              <CommandIcon name="search" size={16} />
              <span>Search</span>
              <kbd>Ctrl K</kbd>
            </button>
            <button
              type="button"
              className={`iconTopButton noticeButton ${noticeOpen ? "active" : ""}`}
              aria-label={`Notifications${experience.unread ? `, ${experience.unread} unread` : ""}`}
              aria-expanded={noticeOpen}
              onClick={() => {
                setNoticeOpen((v) => !v);
                setAccountOpen(false);
              }}
            >
              <CommandIcon name="bell" size={18} />
              {experience.unread > 0 && <b>{experience.unread > 9 ? "9+" : experience.unread}</b>}
            </button>
            <button
              className="iconTopButton themeToggle"
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              onClick={() => void chooseTheme(theme === "dark" ? "light" : "dark")}
            >
              <CommandIcon name={theme === "dark" ? "sun" : "moon"} size={18} />
            </button>
            <span
              className={`topbarStatus ${online ? "" : "degraded"}`}
              title={
                lastSync ? `Last synced ${new Date(lastSync).toLocaleTimeString()}` : "Waiting for first sync"
              }
            >
              <i /> {online ? "Live" : "Reconnecting"}
            </span>
            <button
              className="topbarUser"
              onClick={() => {
                setAccountOpen((v) => !v);
                setNoticeOpen(false);
              }}
            >
              <span>
                <b>{display}</b>
                <small>@{session.username}</small>
              </span>
              {avatar ? <img src={avatar} alt="" /> : <i>{display.slice(0, 1).toUpperCase()}</i>}
            </button>
            <button
              className="mobileMenuButton"
              type="button"
              aria-label="Open navigation"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
            >
              <CommandIcon name="menu" size={20} />
            </button>
          </div>
          {noticeOpen && (
            <aside className="topbarPopover noticePopover" aria-label="Notifications">
              <header>
                <div>
                  <b>Notifications</b>
                  <small>{unreadShown ? `${unreadShown} unread` : "You're all caught up"}</small>
                </div>
                {unreadShown > 0 && (
                  <button type="button" onClick={() => void markRead()}>
                    Mark all read
                  </button>
                )}
              </header>
              <div className="notificationList">
                {shownNotifications.slice(0, 20).map((n: any) => (
                  <Link
                    key={n.key}
                    href={n.href ?? "/dashboard"}
                    className={n.read ? "" : "unread"}
                    onClick={() => {
                      setNoticeOpen(false);
                      if (!n.read) void markRead([n.key]);
                    }}
                  >
                    <span className="noticeKind">
                      <CommandIcon
                        name={n.kind === "battle" ? "battle" : n.kind === "release" ? "activity" : "feedback"}
                        size={15}
                      />
                    </span>
                    <span>
                      <b>{n.title}</b>
                      <small>{n.body}</small>
                      <em>{n.createdAt ? relativeTime(n.createdAt) : ""}</em>
                    </span>
                  </Link>
                ))}
                {!shownNotifications.length && <p className="emptyPopover">No notifications yet.</p>}
              </div>
            </aside>
          )}
          {accountOpen && (
            <aside className="topbarPopover accountPopover">
              <div className="accountPopoverIdentity">
                <div className="avatar">
                  {avatar ? <img src={avatar} alt="" /> : display.slice(0, 1).toUpperCase()}
                </div>
                <span>
                  <b>{display}</b>
                  <small>@{session.username}</small>
                </span>
              </div>
              <Link href="/dashboard/ship-builder">My Builds</Link>
              <Link href="/dashboard/port-battles">My PB Preferences</Link>
              <Link href="/dashboard/feedback?tab=mine">My Feedback</Link>
              <button
                onClick={() => {
                  setSettingsOpen(true);
                  setAccountOpen(false);
                }}
              >
                <CommandIcon name="settings" size={16} /> Customize dashboard
              </button>
              <a href="/api/auth/logout">Sign out ↗</a>
            </aside>
          )}
        </header>
        <main id="dashboard-content" className="content commandContent">
          <DashboardAccessibility />
          {!online && (
            <div className="connectionBanner">
              <b>Connection interrupted.</b>
              <span>Your current screen stays in place while the dashboard reconnects.</span>
              <button onClick={() => void refreshExperience()}>Retry now</button>
            </div>
          )}
          {disabledFeature ? (
            <section className="panel featureDisabledState">
              <span className="eyebrow">MODULE DISABLED</span>
              <h2>{prettySegment(disabledFeature)}</h2>
              <p>
                This BOM module is currently disabled by a server-wide feature flag. Administrators can
                re-enable it from Administration → Modules & rollout controls.
              </p>
              {admin && (
                <Link className="goldButton" href="/dashboard/admin">
                  Open Administration
                </Link>
              )}
            </section>
          ) : (
            <>
              {activeSection && activeSection.tabs.length > 1 && (
                <nav className="sectionTabs" aria-label={`${activeSection.label} pages`}>
                  {activeSection.tabs.map((t) => {
                    const on = here?.tab.href === t.href;
                    return (
                      <Link
                        key={t.href}
                        href={t.href}
                        className={on ? "active" : ""}
                        aria-current={on ? "page" : undefined}
                      >
                        {t.label}
                      </Link>
                    );
                  })}
                </nav>
              )}
              {children}
            </>
          )}
        </main>
      </div>
      <nav className="mobileCommandDock" aria-label="Mobile navigation">
        {mobileDock.map((href: string) => {
          const item = nav.find((x) => x.href === href);
          if (!item) return null;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active(item) ? "active" : ""}
              aria-current={active(item) ? "page" : undefined}
            >
              <CommandIcon name={item.icon} size={19} />
              <span>
                {item.label === "Port Battles"
                  ? "Battles"
                  : item.label === "Ship Builder"
                    ? "Builder"
                    : item.label === "Wiki"
                      ? "Wiki"
                      : item.label}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          className={mobileMenuOpen ? "active" : ""}
          onClick={() => setMobileMenuOpen(true)}
          aria-label="More navigation"
        >
          <span className="mobileDots">•••</span>
          <span>More</span>
        </button>
      </nav>

      {settingsOpen && (
        <div
          className="modalBackdrop"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) setSettingsOpen(false);
          }}
        >
          <section className="modalCard dashboardSettingsModal">
            <div className="modalHead">
              <div>
                <span className="eyebrow">PERSONAL EXPERIENCE</span>
                <h3>Customize dashboard</h3>
              </div>
              <button className="iconCloseButton" onClick={() => setSettingsOpen(false)}>
                ×
              </button>
            </div>
            <div className="dashboardSettingRows">
              <label>
                <span>
                  <b>Appearance</b>
                  <small>
                    Choose a light or dark workspace. Your preference follows you between sessions.
                  </small>
                </span>
                <span className="themeChoice">
                  <button
                    type="button"
                    className={theme === "light" ? "active" : ""}
                    onClick={() => void chooseTheme("light")}
                  >
                    <CommandIcon name="sun" size={16} /> Light
                  </button>
                  <button
                    type="button"
                    className={theme === "dark" ? "active" : ""}
                    onClick={() => void chooseTheme("dark")}
                  >
                    <CommandIcon name="moon" size={16} /> Dark
                  </button>
                </span>
              </label>
              <label>
                <span>
                  <b>Interface density</b>
                  <small>Choose how much information fits on screen.</small>
                </span>
                <select
                  value={prefs.density ?? "comfortable"}
                  onChange={(e) => savePreferences({ density: e.target.value })}
                >
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
              <label>
                <span>
                  <b>Reduced motion</b>
                  <small>Disable decorative transitions and movement.</small>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(prefs.reducedMotion)}
                  onChange={(e) => savePreferences({ reducedMotion: e.target.checked })}
                />
              </label>
              <label>
                <span>
                  <b>Compact desktop sidebar</b>
                  <small>Show an icon rail instead of the expanded navigation.</small>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(prefs.sidebarCollapsed)}
                  onChange={(e) => savePreferences({ sidebarCollapsed: e.target.checked })}
                />
              </label>
            </div>
            <div className="homeCardSettings">
              <h4>Dashboard home</h4>
              <p>
                Choose which home sections you want to see. Role-specific operational cards still appear when
                relevant.
              </p>
              <div>
                {homeOrder.map((key: string) => {
                  const labels: any = {
                      recents: "Continue where you left off",
                      favorites: "Favorites",
                      attention: "Needs your attention",
                      history: "Recently played",
                      quick: "Quick access",
                    },
                    visible = (prefs.homeSections ?? {})[key] !== false,
                    index = homeOrder.indexOf(key);
                  const move = (dir: number) => {
                    const next = [...homeOrder],
                      to = index + dir;
                    if (to < 0 || to >= next.length) return;
                    [next[index], next[to]] = [next[to], next[index]];
                    void savePreferences({ homeOrder: next });
                  };
                  return (
                    <div className="homeCardSettingRow" key={key}>
                      <label>
                        <input
                          type="checkbox"
                          checked={visible}
                          onChange={(e) =>
                            savePreferences({
                              homeSections: { ...(prefs.homeSections ?? {}), [key]: e.target.checked },
                            })
                          }
                        />
                        <span>{labels[key]}</span>
                      </label>
                      <span>
                        <button
                          aria-label={`Move ${labels[key]} up`}
                          disabled={index === 0}
                          onClick={() => move(-1)}
                        >
                          ↑
                        </button>
                        <button
                          aria-label={`Move ${labels[key]} down`}
                          disabled={index === homeOrder.length - 1}
                          onClick={() => move(1)}
                        >
                          ↓
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mobileDockSettings">
              <h4>Mobile Command Dock</h4>
              <p>Pin up to four sections to the bottom of your phone.</p>
              <div>
                {nav
                  .filter((x) => !x.exact || x.href === "/dashboard")
                  .filter((x) => !["/dashboard/sentinel", "/dashboard/admin"].includes(x.href) || admin)
                  .map((item) => {
                    const pinned = mobileDock.includes(item.href);
                    return (
                      <button
                        key={item.href}
                        className={pinned ? "active" : ""}
                        onClick={() => {
                          const current = [...mobileDock];
                          const next = pinned
                            ? current.filter((x) => x !== item.href)
                            : current.length < 4
                              ? [...current, item.href]
                              : current;
                          savePreferences({ mobileDock: next });
                        }}
                      >
                        <CommandIcon name={item.icon} size={17} />
                        {item.label}
                        {pinned && <span>✓</span>}
                      </button>
                    );
                  })}
              </div>
            </div>
            <div className="modalActions">
              <button className="goldButton" onClick={() => setSettingsOpen(false)}>
                Done
              </button>
            </div>
          </section>
        </div>
      )}

      {inspector && (
        <aside className="globalInspector" role="dialog" aria-label={`${inspector.title} details`}>
          <header>
            <div>
              {inspector.kind && <span className="eyebrow">{inspector.kind}</span>}
              <h3>{inspector.title}</h3>
              {inspector.subtitle && <p>{inspector.subtitle}</p>}
            </div>
            <button className="iconCloseButton" onClick={() => setInspector(null)}>
              ×
            </button>
          </header>
          {Array.isArray(inspector.fields) && (
            <dl>
              {inspector.fields.map((f: any) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{String(f.value ?? "—")}</dd>
                </div>
              ))}
            </dl>
          )}
          <footer>
            {(inspector.actions ?? []).map((a: any) => (
              <Link className={a.primary ? "goldButton" : "outlineButton"} href={a.href} key={a.href}>
                {a.label}
              </Link>
            ))}
            {inspector.href && (
              <Link className="goldButton" href={inspector.href}>
                Open full page
              </Link>
            )}
          </footer>
        </aside>
      )}
      {paletteOpen && (
        <div
          className="modalBackdrop commandPaletteBackdrop"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) setPaletteOpen(false);
          }}
        >
          <section
            className="commandPalette"
            role="dialog"
            aria-modal="true"
            aria-label="Search the dashboard"
          >
            <label className="commandPaletteSearch">
              <CommandIcon name="search" size={18} />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search pages, actions, ships, battles, wiki…"
                aria-label="Search"
              />
              <kbd>Esc</kbd>
            </label>
            {searchNotice && <p className="paletteSearching">{searchNotice}</p>}
            {search.trim().length < 2 ? (
              <div className="paletteHome">
                <section className="paletteGroup">
                  <h4>Quick actions</h4>
                  <div>
                    {rankedActions.slice(0, 6).map((a) => (
                      <Link
                        key={a.key}
                        href={a.href}
                        onClick={() => {
                          void recordActionUse(a.key);
                          setPaletteOpen(false);
                        }}
                      >
                        <span className="paletteKind">Action</span>
                        <span>
                          <b>{a.label}</b>
                          <small>{a.detail}</small>
                        </span>
                        <em>→</em>
                      </Link>
                    ))}
                  </div>
                </section>
                {experience.recents.length > 0 && (
                  <PaletteGroup title="Recent" items={experience.recents.slice(0, 6)} />
                )}
              </div>
            ) : (
              <div className="paletteResults">
                {searching && <p className="paletteSearching">Searching…</p>}
                {paletteResults.map((r: any, i: number) => (
                  <Link
                    key={`${r.kind}-${r.key ?? r.href}-${i}`}
                    href={r.href}
                    onClick={() => {
                      if (r.kind === "Action") void recordActionUse(r.key);
                      setPaletteOpen(false);
                    }}
                  >
                    <span className="paletteKind">{r.kind}</span>
                    <span>
                      <b>{r.label ?? r.title}</b>
                      <small>{r.detail ?? r.subtitle ?? r.href}</small>
                    </span>
                    <em>→</em>
                  </Link>
                ))}
                {!searching && !paletteResults.length && (
                  <p className="paletteSearching">No results for “{search}”.</p>
                )}
              </div>
            )}
          </section>
        </div>
      )}
      <div className="toastStack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`dashboardToast ${t.tone}`}>
            <span>
              {t.tone === "success" ? "✓" : t.tone === "error" ? "!" : t.tone === "warning" ? "⚠" : "i"}
            </span>
            <b>{t.message}</b>
            {t.action && (
              <button
                onClick={() => {
                  t.action?.();
                  setToasts((x) => x.filter((y) => y.id !== t.id));
                }}
              >
                {t.actionLabel ?? "Undo"}
              </button>
            )}
            <button
              className="iconCloseButton"
              aria-label="Dismiss"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {mobileMenuOpen && (
        <>
          <button
            className="mobileNavBackdrop"
            aria-label="Close navigation"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="mobileNavSheet" role="dialog" aria-modal="true" aria-label="Dashboard navigation">
            <div className="mobileNavSheetHead">
              <div className="mobileNavIdentity">
                <span className="brandCrest">
                  <img src="/branding/defaults/bom-logo.png" alt="BOM" />
                </span>
                <span>
                  <b>Band of Misfits</b>
                </span>
              </div>
              <button
                className="iconCloseButton"
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation"
              >
                ×
              </button>
            </div>
            <div className="mobileNavSections">
              {sections.map((section) => (
                <section key={section.key}>
                  <h4>
                    <CommandIcon name={section.icon} size={16} /> {section.label}
                  </h4>
                  <div className="mobileNavGrid">
                    {section.tabs.map((t) => {
                      const on = here?.tab.href === t.href;
                      return (
                        <Link
                          key={t.href}
                          href={t.href}
                          className={on ? "active" : ""}
                          aria-current={on ? "page" : undefined}
                        >
                          <span>{section.tabs.length > 1 ? t.label : section.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            <div className="mobileNavAccount">
              <div className="avatar">
                {avatar ? <img src={avatar} alt="" /> : display.slice(0, 1).toUpperCase()}
              </div>
              <span>
                <b>{display}</b>
                <small>@{session.username}</small>
              </span>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setSettingsOpen(true);
                }}
              >
                Customize
              </button>
              <a href="/api/auth/logout">Sign out ↗</a>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function PaletteGroup({ title, items }: { title: string; items: any[] }) {
  return (
    <section className="paletteGroup">
      <h4>{title}</h4>
      {items.length ? (
        <div>
          {items.map((x: any) => (
            <Link key={`${x.kind}-${x.item_key}`} href={x.href}>
              <span className="paletteKind">{prettySegment(x.kind)}</span>
              <span>
                <b>{x.label}</b>
                <small>{x.metadata?.subtitle ?? x.metadata?.detail ?? x.href}</small>
              </span>
              <em>→</em>
            </Link>
          ))}
        </div>
      ) : (
        <p>Nothing here yet.</p>
      )}
    </section>
  );
}
