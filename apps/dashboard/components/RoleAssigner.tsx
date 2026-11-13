"use client";
// Admin: find a member and add or remove their Discord roles.
import { useEffect, useMemo, useState } from "react";

type Role = {
  id: string;
  name: string;
  color: string | null;
  assignable: boolean;
  why: string | null;
  powerful: boolean;
};
type Member = {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  bot: boolean;
  roles: string[];
};

async function call(path: string, method = "GET") {
  const r = await fetch(`/api/internal/admin/roles${path}`, { method, cache: "no-store" });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.message || "That didn't work. Try again.");
  return b;
}

export default function RoleAssigner({
  initialRoles,
  loadError,
}: {
  initialRoles: Role[];
  loadError: string;
}) {
  const [roles] = useState<Role[]>(initialRoles),
    [q, setQ] = useState(""),
    [results, setResults] = useState<Member[] | null>(null),
    [member, setMember] = useState<Member | null>(null),
    [filter, setFilter] = useState(""),
    [busy, setBusy] = useState(""),
    [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Search as you type, with a short pause.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => {
      call(`/members?q=${encodeURIComponent(term)}`)
        .then((b) => setResults(b.members))
        .catch((e) => setMsg({ ok: false, text: e.message }));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const byId = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const toggle = async (role: Role, has: boolean) => {
    if (!member) return;
    if (
      !has &&
      role.powerful &&
      !confirm(`“${role.name}” has admin-level permissions. Give it to ${member.name}?`)
    )
      return;
    setBusy(role.id);
    setMsg(null);
    try {
      const b = await call(`/members/${member.id}/roles/${role.id}`, has ? "DELETE" : "PUT");
      setMember(b.member);
      setResults((rs) => rs?.map((m) => (m.id === b.member.id ? b.member : m)) ?? rs);
      setMsg({
        ok: true,
        text: `${has ? "Removed" : "Added"} ${role.name} ${has ? "from" : "to"} ${member.name}.`,
      });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy("");
    }
  };
  const term = filter.trim().toLowerCase();
  const shown = roles.filter((r) => !term || r.name.toLowerCase().includes(term));

  return (
    <section className="panel raPanel">
      <h2>Assign roles</h2>
      <p>Find a member, then tick or untick roles. Changes apply in Discord straight away and are logged.</p>
      {loadError && (
        <p role="alert" className="raError">
          {loadError}
        </p>
      )}

      <label className="raSearch">
        Member
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, username or Discord ID"
          autoComplete="off"
        />
      </label>
      {results && !member && (
        <ul className="raResults">
          {results.length ? (
            results.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => setMember(m)}>
                  {m.avatar ? (
                    <img src={m.avatar} alt="" />
                  ) : (
                    <span className="raAvatar">{m.name.slice(0, 1)}</span>
                  )}
                  <b>{m.name}</b>
                  <small>@{m.username}</small>
                </button>
              </li>
            ))
          ) : (
            <li className="raEmpty">No members found.</li>
          )}
        </ul>
      )}

      {member && (
        <div className="raMember">
          <header>
            {member.avatar ? (
              <img src={member.avatar} alt="" />
            ) : (
              <span className="raAvatar">{member.name.slice(0, 1)}</span>
            )}
            <div>
              <b>{member.name}</b>
              <small>
                @{member.username} · {member.roles.length} role{member.roles.length === 1 ? "" : "s"}
              </small>
            </div>
            <button
              type="button"
              className="outlineButton"
              onClick={() => {
                setMember(null);
                setMsg(null);
              }}
            >
              Choose someone else
            </button>
          </header>
          <div className="raCurrent">
            {member.roles
              .map((id) => byId.get(id))
              .filter(Boolean)
              .map((r) => (
                <span key={r!.id} style={{ borderColor: r!.color ?? undefined }}>
                  <i style={{ background: r!.color ?? "var(--cc-muted)" }} />
                  {r!.name}
                </span>
              ))}
          </div>
          {msg && (
            <p role="status" className={msg.ok ? "raOk" : "raError"}>
              {msg.text}
            </p>
          )}
          <input
            className="raFilter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter roles…"
            aria-label="Filter roles"
          />
          <ul className="raRoles">
            {shown.map((r) => {
              const has = member.roles.includes(r.id);
              return (
                <li key={r.id} className={r.assignable ? "" : "locked"}>
                  <label title={r.why ?? undefined}>
                    <input
                      type="checkbox"
                      checked={has}
                      disabled={!r.assignable || busy !== ""}
                      onChange={() => toggle(r, has)}
                    />
                    <i style={{ background: r.color ?? "var(--cc-muted)" }} />
                    <span>{r.name}</span>
                    {busy === r.id && <small>saving…</small>}
                    {r.powerful && <small className="raWarn">admin powers</small>}
                    {!r.assignable && <small>{r.why}</small>}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
