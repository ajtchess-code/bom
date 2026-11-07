"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./CommunityOperations.css";
export default function AllianceDashboardShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="allianceShell">
      <header>
        <Link href="/dashboard/port-battles">
          <b>Band of Misfits · Alliance Dashboard</b>
        </Link>
        <nav aria-label="Alliance navigation">
          {[
            ["/dashboard/music", "Music"],
            ["/dashboard/port-battles", "Port Battles"],
            ["/dashboard/diplomacy", "Guilds & Alliances"],
          ].map(([href, label]) => (
            <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
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
