import { headers } from "next/headers";
import { getSession } from "@/lib/session";
import { requestHost } from "@/lib/publicHost";
import Link from "next/link";
import styles from "./login.module.css";
export default async function Home() {
  const session = await getSession();
  const h = await headers();
  const currentHost = requestHost(h);
  const dashUrl = (process.env.PUBLIC_DASHBOARD_URL ?? "").trim().replace(/\/$/, "");
  let crossOriginDash = "";
  if (dashUrl) {
    try {
      const u = new URL(dashUrl);
      if (currentHost && u.hostname.toLowerCase() !== currentHost) crossOriginDash = u.origin;
    } catch {}
  }
  const loginHref = `${crossOriginDash}/api/auth/discord/start`;
  const dashboardHref = `${crossOriginDash}/dashboard`;
  return (
    <main className={styles.deck}>
      <div className={styles.backdrop} />
      <header className={styles.header}>
        <a href="/" aria-label="Band of Misfits">
          <img src="/branding/defaults/bom-logo.png" alt="" />
          <span>Band of Misfits</span>
        </a>
      </header>
      <section className={styles.content}>
        <div className={styles.card}>
          <span className={styles.eyebrow}>BAND OF MISFITS</span>
          <h1>Welcome Aboard.</h1>
          <p>Your Crew. Your Dashboard.</p>
          {session ? (
            crossOriginDash ? (
              <a className={styles.signIn} href={dashboardHref}>
                Open Dashboard <span aria-hidden="true">→</span>
              </a>
            ) : (
              <Link className={styles.signIn} href="/dashboard">
                Open Dashboard <span aria-hidden="true">→</span>
              </Link>
            )
          ) : (
            <a className={styles.signIn} href={loginHref}>
              <svg width="24" height="20" viewBox="0 0 24 20" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M20 2a19 19 0 0 0-5-2l-.6 1.3a18 18 0 0 0-4.8 0L9 0a19 19 0 0 0-5 2C1 7 0 12 1 17a20 20 0 0 0 6 3l1-2-2-1 1-.5a16 16 0 0 0 10 0l1 .5-2 1 1 2a20 20 0 0 0 6-3c1-5 0-10-3-15ZM8 13c-1 0-2-1-2-2s1-2 2-2 2 1 2 2-1 2-2 2Zm8 0c-1 0-2-1-2-2s1-2 2-2 2 1 2 2-1 2-2 2Z"
                />
              </svg>
              Continue With Discord <span aria-hidden="true">→</span>
            </a>
          )}
          <small>Secure Discord Sign-In</small>
          <a className={styles.wikiLink} href={(process.env.PUBLIC_WIKI_REDIRECT ?? "").trim() || "/wiki"}>
            Open the WoSB Wiki <span aria-hidden="true">→</span>
          </a>
        </div>
      </section>
      <footer className={styles.footer}>© Band of Misfits</footer>
    </main>
  );
}
