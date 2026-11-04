"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./CommunityOperations.css";
export default function AllianceDashboardShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="allianceShell">
      <header>
        <Link href="/dashboard/events">
          <b>Band of Misfits · Alliance Dashboard</b>
        </Link>
        <nav aria-label="Alliance navigation">
          {[
            ["/dashboard/events", "Halloween Event"],
            ["/dashboard/music", "Music"],
            ["/dashboard/port-battles", "Port Battles"],
            ["/dashboard/diplomacy", "Guilds & Alliances"],
          ].map(([href, label]) => (
            <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
              {href === "/dashboard/events" && (
                <img
                  src="/event-guide/branding/halloween-guild-logo.png"
                  width="24"
                  height="24"
                  alt=""
                  className="uiInlineIcon"
                />
              )}
              {label}
            </Link>
          ))}
          <a href="/api/auth/logout">Sign out</a>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
