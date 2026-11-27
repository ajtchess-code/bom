"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type RoleItem = { id: string; name: string };
type ChannelItem = { id: string; name: string };

async function ssApi(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await fetch(`/api/internal/secret-santa${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  const text = await res.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text };
  }
  if (!res.ok) throw new Error(body?.message ?? body?.error ?? `Request failed (${res.status})`);
  return body;
}

function fmtDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toDatetimeLocal(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(val: string) {
  if (!val.trim()) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function statusBadgeClass(status?: string) {
  if (status === "SIGNUPS_OPEN") return "ssPill open";
  if (status === "MATCHED") return "ssPill matched";
  if (status === "REVEALED") return "ssPill revealed";
  return "ssPill";
}

function statusLabel(status?: string) {
  switch (status) {
    case "SIGNUPS_OPEN":
      return "Signups Open";
    case "MATCHED":
      return "Matches Drawn";
    case "REVEALED":
      return "Santas Revealed";
    case "DRAFT":
      return "Draft";
    case "ARCHIVED":
      return "Archived";
    default:
      return status ?? "Inactive";
  }
}

export default function SecretSantaDashboard({
  initial,
  isAdmin,
}: {
  initial: any;
  isAdmin: boolean;
}) {
  const [data, setData] = useState<any>(initial);
  const [tab, setTab] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Member wishlist form state
  const [ign, setIgn] = useState(initial?.participant?.ign ?? "");
  const [wishlist, setWishlist] = useState(initial?.participant?.wishlist ?? "");
  const [avoidList, setAvoidList] = useState(initial?.participant?.avoidList ?? "");
  const [notes, setNotes] = useState(initial?.participant?.notes ?? "");
  const [backupElf, setBackupElf] = useState(Boolean(initial?.participant?.backupElf));
  const [giftNote, setGiftNote] = useState(initial?.match?.giftSentNote ?? "");

  // Admin state
  const [adminData, setAdminData] = useState<any>(null);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [roleSearch, setRoleSearch] = useState("");
  const [evTitle, setEvTitle] = useState("BOM Christmas Secret Santa");
  const [evDesc, setEvDesc] = useState(
    "Join the Band of Misfits Christmas Secret Santa! Sign up with your wishlist, get anonymously matched with a crewmate, and spread some holiday loot.",
  );
  const [evBudget, setEvBudget] = useState("");
  const [evStatus, setEvStatus] = useState<"DRAFT" | "SIGNUPS_OPEN" | "ARCHIVED">("SIGNUPS_OPEN");
  const [evRoles, setEvRoles] = useState<string[]>([]);
  const [evChannelId, setEvChannelId] = useState("");
  const [evSignupCloses, setEvSignupCloses] = useState("");
  const [evGiftDeadline, setEvGiftDeadline] = useState("");

  // Exclusions, reassign, emergency inspect
  const [exclA, setExclA] = useState("");
  const [exclB, setExclB] = useState("");
  const [reassignFrom, setReassignFrom] = useState("");
  const [reassignTo, setReassignTo] = useState("");
  const [inspectReason, setInspectReason] = useState("");
  const [inspectedPairings, setInspectedPairings] = useState<any[] | null>(null);

  const showNotice = (kind: "ok" | "err", text: string) => setNotice({ kind, text });

  const syncMemberForm = useCallback((fresh: any) => {
    setIgn(fresh?.participant?.ign ?? "");
    setWishlist(fresh?.participant?.wishlist ?? "");
    setAvoidList(fresh?.participant?.avoidList ?? "");
    setNotes(fresh?.participant?.notes ?? "");
    setBackupElf(Boolean(fresh?.participant?.backupElf));
    setGiftNote(fresh?.match?.giftSentNote ?? "");
  }, []);

  const refreshMember = useCallback(async () => {
    const fresh = await ssApi("/current");
    setData(fresh);
    syncMemberForm(fresh);
  }, [syncMemberForm]);

  const hydrateAdminForm = useCallback((ev: any) => {
    if (!ev) return;
    setEvTitle(ev.title ?? "BOM Christmas Secret Santa");
    setEvDesc(ev.description ?? "");
    setEvBudget(ev.budget_note ?? "");
    setEvStatus(
      ev.status === "DRAFT" || ev.status === "ARCHIVED" ? ev.status : "SIGNUPS_OPEN",
    );
    setEvRoles(Array.isArray(ev.allowed_role_ids) ? ev.allowed_role_ids.map(String) : []);
    setEvChannelId(ev.channel_id ? String(ev.channel_id) : "");
    setEvSignupCloses(toDatetimeLocal(ev.signup_closes_at));
    setEvGiftDeadline(toDatetimeLocal(ev.gift_deadline_at));
  }, []);

  const refreshAdmin = useCallback(
    async (eventId?: string) => {
      if (!isAdmin) return;
      const qs = eventId ? `?eventId=${encodeURIComponent(eventId)}` : "";
      const fresh = await ssApi(`/admin${qs}`);
      setAdminData(fresh);
      const chosenId = fresh.selectedEventId ?? "";
      setSelectedEventId(chosenId);
      setInspectedPairings(null);
      if (chosenId) {
        const found = (fresh.events ?? []).find((e: any) => e.id === chosenId);
        if (found) {
          setCreatingNew(false);
          hydrateAdminForm(found);
        }
      } else {
        setCreatingNew(true);
      }
    },
    [hydrateAdminForm, isAdmin],
  );

  useEffect(() => {
    if (!initial) void refreshMember().catch(() => {});
  }, [initial, refreshMember]);

  useEffect(() => {
    if (tab === "admin" && isAdmin && !adminData) {
      void refreshAdmin().catch((e: any) => showNotice("err", e.message));
    }
  }, [tab, isAdmin, adminData, refreshAdmin]);

  const event = data?.event ?? null;
  const participant = data?.participant ?? null;
  const match = data?.match ?? null;
  const incoming = data?.incoming ?? null;
  const eligible = Boolean(data?.eligible);
  const requiredRoles: RoleItem[] = data?.requiredRoles ?? [];
  const participants: any[] = data?.participants ?? [];
  const reveal: any[] | null = data?.reveal ?? null;

  const selectedAdminEvent = useMemo(
    () => (adminData?.events ?? []).find((e: any) => e.id === selectedEventId) ?? null,
    [adminData, selectedEventId],
  );

  const filteredRoles = useMemo(() => {
    const all: RoleItem[] = adminData?.roles ?? [];
    const q = roleSearch.trim().toLowerCase();
    return q ? all.filter((r) => r.name.toLowerCase().includes(q)) : all;
  }, [adminData, roleSearch]);

  async function handleSaveWishlist(e: React.FormEvent) {
    e.preventDefault();
    if (!event) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await ssApi(`/${event.id}/signup`, {
        method: "POST",
        body: JSON.stringify({ ign, wishlist, avoidList, notes, backupElf }),
      });
      await refreshMember();
      showNotice(
        "ok",
        res.joined
          ? "You're in! Your Secret Santa wishlist has been saved."
          : event.status === "MATCHED"
            ? "Wishlist updated! Your Secret Santa will see your latest changes."
            : "Your Secret Santa wishlist has been updated.",
      );
    } catch (err: any) {
      showNotice("err", err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleWithdraw() {
    if (!event) return;
    if (!window.confirm("Withdraw from this Secret Santa exchange?")) return;
    setBusy(true);
    setNotice(null);
    try {
      await ssApi(`/${event.id}/signup`, { method: "DELETE" });
      await refreshMember();
      showNotice("ok", "You have withdrawn from this Secret Santa.");
    } catch (err: any) {
      showNotice("err", err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkSent(e: React.FormEvent) {
    e.preventDefault();
    if (!event) return;
    setBusy(true);
    setNotice(null);
    try {
      await ssApi(`/${event.id}/gift-sent`, {
        method: "POST",
        body: JSON.stringify({ note: giftNote }),
      });
      await refreshMember();
      showNotice("ok", "Marked as sent! Your recipient has been notified anonymously.");
    } catch (err: any) {
      showNotice("err", err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkReceived() {
    if (!event) return;
    setBusy(true);
    setNotice(null);
    try {
      await ssApi(`/${event.id}/gift-received`, { method: "POST", body: JSON.stringify({}) });
      await refreshMember();
      showNotice("ok", "Gift confirmed! Your Secret Santa has been thanked anonymously.");
    } catch (err: any) {
      showNotice("err", err.message);
    } finally {
      setBusy(false);
    }
  }

  function startNewEvent() {
    setCreatingNew(true);
    setEvTitle("BOM Christmas Secret Santa");
    setEvDesc(
      "Join the Band of Misfits Christmas Secret Santa! Sign up with your wishlist, get anonymously matched with a crewmate, and spread some holiday loot.",
    );
    setEvBudget("");
    setEvStatus("SIGNUPS_OPEN");
    setEvRoles([]);
    setEvChannelId("");
    setEvSignupCloses("");
    setEvGiftDeadline("");
    setInspectedPairings(null);
  }

  function toggleRole(id: string) {
    setEvRoles((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSaveEvent(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const payload = {
      title: evTitle,
      description: evDesc,
      budgetNote: evBudget,
      allowedRoleIds: evRoles,
      channelId: evChannelId || null,
      signupClosesAt: fromDatetimeLocal(evSignupCloses),
      giftDeadlineAt: fromDatetimeLocal(evGiftDeadline),
      status: evStatus,
    };
    try {
      if (creatingNew || !selectedEventId) {
        const created = await ssApi("/admin/events", {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            status: evStatus === "DRAFT" ? "DRAFT" : "SIGNUPS_OPEN",
          }),
        });
        await Promise.all([refreshAdmin(created.id), refreshMember()]);
        showNotice("ok", "Secret Santa event created!");
      } else {
        await ssApi(`/admin/events/${selectedEventId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        await Promise.all([refreshAdmin(selectedEventId), refreshMember()]);
        showNotice("ok", "Event settings saved.");
      }
    } catch (err: any) {
      showNotice("err", err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAdminAction(action: "publish" | "match" | "remind" | "reveal") {
    if (!selectedEventId) return;
    if (
      action === "match" &&
      !window.confirm(
        "Draw anonymous Secret Santa matches now and DM everyone their match + wishlist? Signups will close.",
      )
    ) {
      return;
    }
    if (
      action === "reveal" &&
      !window.confirm(
        "Reveal all Secret Santas now? This will announce the full reveal in Discord and on the Dashboard.",
      )
    ) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await ssApi(`/admin/events/${selectedEventId}/${action}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await Promise.all([refreshAdmin(selectedEventId), refreshMember()]);
      if (action === "publish") showNotice("ok", "Discord Secret Santa card queued for publishing.");
      else if (action === "match")
        showNotice("ok", `Matched ${res.matched} participants! DMs are being delivered by Jolly Misfit.`);
      else if (action === "remind")
        showNotice("ok", "Gift reminders queued for Santas who haven't marked their gift sent.");
      else showNotice("ok", "Secret Santas revealed!");
    } catch (err: any) {
      showNotice("err", err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddExclusion(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEventId || !exclA || !exclB) return;
    setBusy(true);
    setNotice(null);
    try {
      await ssApi(`/admin/events/${selectedEventId}/exclusions`, {
        method: "POST",
        body: JSON.stringify({ userA: exclA, userB: exclB }),
      });
      setExclA("");
      setExclB("");
      await refreshAdmin(selectedEventId);
      showNotice("ok", "Exclusion pair added.");
    } catch (err: any) {
      showNotice("err", err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveExclusion(userA: string, userB: string) {
    if (!selectedEventId) return;
    setBusy(true);
    setNotice(null);
    try {
      await ssApi(`/admin/events/${selectedEventId}/exclusions`, {
        method: "DELETE",
        body: JSON.stringify({ userA, userB }),
      });
      await refreshAdmin(selectedEventId);
      showNotice("ok", "Exclusion removed.");
    } catch (err: any) {
      showNotice("err", err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReassign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEventId || !reassignFrom || !reassignTo.trim()) return;
    if (!window.confirm("Reassign this Secret Santa match to the replacement Backup Elf?")) return;
    setBusy(true);
    setNotice(null);
    try {
      await ssApi(`/admin/events/${selectedEventId}/reassign`, {
        method: "POST",
        body: JSON.stringify({ fromGiverId: reassignFrom, toGiverId: reassignTo.trim() }),
      });
      setReassignFrom("");
      setReassignTo("");
      await refreshAdmin(selectedEventId);
      showNotice("ok", "Match reassigned! Jolly Misfit is DMing the Backup Elf their new recipient.");
    } catch (err: any) {
      showNotice("err", err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleEmergencyInspect(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEventId || inspectReason.trim().length < 4) return;
    if (
      !window.confirm(
        "Emergency Inspect reveals live Secret Santa pairings and logs your name and reason in Sentinel. Continue?",
      )
    ) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await ssApi(`/admin/events/${selectedEventId}/emergency-inspect`, {
        method: "POST",
        body: JSON.stringify({ reason: inspectReason.trim() }),
      });
      setInspectedPairings(res.pairings ?? []);
      setInspectReason("");
      showNotice("ok", "Emergency inspection recorded in Sentinel.");
    } catch (err: any) {
      showNotice("err", err.message);
    } finally {
      setBusy(false);
    }
  }

  const canEditWishlist =
    event &&
    ((event.status === "SIGNUPS_OPEN" && (eligible || Boolean(participant))) ||
      (event.status === "MATCHED" && Boolean(participant)));

  return (
    <div className="ssPage">
      <section className="ssHero">
        <img
          className="ssHeroAvatar"
          src="/branding/christmas/jolly-misfit-avatar.png"
          alt="Jolly Misfit"
          width={82}
          height={82}
        />
        <div className="ssHeroInfo">
          <span className="eyebrow">JOLLY MISFIT · CHRISTMAS EXCHANGE</span>
          <h1>{event ? event.title : "BOM Secret Santa"}</h1>
          <p>
            {event?.description ||
              "Anonymous guild Secret Santa powered by Jolly Misfit. Share your wishlist privately with your Secret Santa — on Discord or right here on the Dashboard."}
          </p>
          <div className="ssMetaRow">
            {event && <span className={statusBadgeClass(event.status)}>{statusLabel(event.status)}</span>}
            {event && <span className="ssPill">{event.participantCount} Signed Up</span>}
            {event?.budgetNote && <span className="ssPill">Budget: {event.budgetNote}</span>}
            {event?.signupClosesAt && (
              <span className="ssPill">Signups Close: {fmtDate(event.signupClosesAt)}</span>
            )}
            {event?.giftDeadlineAt && (
              <span className="ssPill">Gift Deadline: {fmtDate(event.giftDeadlineAt)}</span>
            )}
          </div>
          {requiredRoles.length > 0 && (
            <div className="ssMetaRow">
              <span className="uiMuted" style={{ fontSize: "0.76rem", alignSelf: "center" }}>
                Open to Discord roles:
              </span>
              {requiredRoles.map((r) => (
                <span key={r.id} className="ssPill">
                  @{r.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {isAdmin && (
        <div className="ssTabs" role="tablist" aria-label="Secret Santa views">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "member"}
            className={tab === "member" ? "active" : ""}
            onClick={() => setTab("member")}
          >
            My Secret Santa
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "admin"}
            className={tab === "admin" ? "active" : ""}
            onClick={() => setTab("admin")}
          >
            Officer Management
          </button>
        </div>
      )}

      {notice && (
        <div className={`ssNotice ${notice.kind}`} role="status">
          {notice.text}
        </div>
      )}

      {tab === "member" ? (
        !event ? (
          <section className="ssCard">
            <div className="ssCardHead">
              <h2>No Active Secret Santa Yet</h2>
            </div>
            <p className="uiMuted">
              Jolly Misfit is still polishing the sleigh. Once Officers open a Secret Santa exchange, you'll be
              able to join here or in Discord with <code>/secret-santa</code>.
            </p>
            {isAdmin && (
              <div className="uiRow">
                <button
                  type="button"
                  className="primaryAction"
                  onClick={() => {
                    setTab("admin");
                    startNewEvent();
                  }}
                >
                  Create Secret Santa Event
                </button>
              </div>
            )}
          </section>
        ) : (
          <>
            {(match || incoming) && (
              <div className="ssGrid">
                {match && (
                  <section className="ssCard highlight">
                    <div className="ssCardHead">
                      <div>
                        <span className="eyebrow">YOUR SECRET RECIPIENT</span>
                        <h2>{match.displayName}</h2>
                      </div>
                      <span className={match.giftReceived ? "ssPill open" : match.giftSent ? "ssPill revealed" : "ssPill matched"}>
                        {match.giftReceived
                          ? "Gift Received"
                          : match.giftSent
                            ? "Gift Sent"
                            : "Needs Gift"}
                      </span>
                    </div>
                    <p className="uiMuted" style={{ margin: 0 }}>
                      Keep it a secret! Only you can see that you're buying for <b>{match.displayName}</b> until
                      the Grand Reveal.
                    </p>
                    <div className="ssWishlistBox">
                      {match.ign && (
                        <div className="ssWishlistField">
                          <small>In-Game Name (IGN)</small>
                          <p>
                            <b>{match.ign}</b>
                          </p>
                        </div>
                      )}
                      <div className="ssWishlistField">
                        <small>Wishlist</small>
                        <p>{match.wishlist || "No wishlist added yet."}</p>
                      </div>
                      {match.avoidList && (
                        <div className="ssWishlistField">
                          <small>Please Avoid / Already Have</small>
                          <p>{match.avoidList}</p>
                        </div>
                      )}
                      {match.notes && (
                        <div className="ssWishlistField">
                          <small>Delivery & Extra Notes</small>
                          <p>{match.notes}</p>
                        </div>
                      )}
                      {match.wishlistUpdatedAt && (
                        <small className="uiMuted">
                          Wishlist last updated {fmtDate(match.wishlistUpdatedAt)}
                        </small>
                      )}
                    </div>

                    <form className="ssForm" onSubmit={handleMarkSent}>
                      <label>
                        Anonymous delivery note for your recipient (optional)
                        <input
                          value={giftNote}
                          onChange={(e) => setGiftNote(e.target.value)}
                          maxLength={300}
                          placeholder="e.g. Check your home port mailbox — Merry Christmas!"
                        />
                      </label>
                      <div className="uiRow">
                        <button type="submit" className="primaryAction" disabled={busy}>
                          {match.giftSent ? "Update Delivery Note" : "Mark Gift Sent"}
                        </button>
                      </div>
                    </form>
                  </section>
                )}

                {incoming && (
                  <section className="ssCard">
                    <div className="ssCardHead">
                      <div>
                        <span className="eyebrow">YOUR SECRET SANTA</span>
                        <h2>
                          {incoming.revealedSantaName
                            ? `Revealed: ${incoming.revealedSantaName}!`
                            : "Mystery Santa"}
                        </h2>
                      </div>
                      <span className={incoming.giftReceived ? "ssPill open" : incoming.giftSent ? "ssPill revealed" : "ssPill"}>
                        {incoming.giftReceived
                          ? "Received"
                          : incoming.giftSent
                            ? "On Its Way!"
                            : "Preparing Gift"}
                      </span>
                    </div>
                    <p className="uiMuted" style={{ margin: 0 }}>
                      {incoming.revealedSantaName
                        ? `Your Secret Santa this year was ${incoming.revealedSantaName}!`
                        : "Your Secret Santa's identity stays hidden until the Grand Reveal, and they can see your live wishlist below."}
                    </p>
                    {incoming.giftSentNote && (
                      <div className="ssWishlistBox">
                        <div className="ssWishlistField">
                          <small>Note from your Secret Santa</small>
                          <p>{incoming.giftSentNote}</p>
                        </div>
                      </div>
                    )}
                    {!incoming.giftReceived && (
                      <div className="uiRow">
                        <button
                          type="button"
                          className="primaryAction"
                          disabled={busy}
                          onClick={() => void handleMarkReceived()}
                        >
                          Confirm Gift Received
                        </button>
                      </div>
                    )}
                    {incoming.giftReceivedAt && (
                      <small className="uiMuted">Confirmed on {fmtDate(incoming.giftReceivedAt)}</small>
                    )}
                  </section>
                )}
              </div>
            )}

            <div className="ssGrid">
              <section className="ssCard">
                <div className="ssCardHead">
                  <div>
                    <span className="eyebrow">YOUR WISHLIST</span>
                    <h2>{participant ? "Edit My Wishlist" : "Join Secret Santa"}</h2>
                  </div>
                  {participant && <span className="ssPill open">Signed Up</span>}
                </div>

                {!participant && !eligible ? (
                  <div className="ssNotice err">
                    This Secret Santa is open only to members holding one of the required Discord roles:{" "}
                    <b>{requiredRoles.map((r) => `@${r.name}`).join(", ") || "Configured Roles"}</b>.
                  </div>
                ) : canEditWishlist ? (
                  <form className="ssForm" onSubmit={handleSaveWishlist}>
                    {event.status === "MATCHED" && (
                      <p className="uiMuted" style={{ margin: 0 }}>
                        Matches are drawn! You can still update your wishlist — Jolly Misfit will privately
                        notify your Secret Santa when you save.
                      </p>
                    )}
                    <label>
                      In-Game Name / Captain Name (optional)
                      <input
                        value={ign}
                        onChange={(e) => setIgn(e.target.value)}
                        maxLength={80}
                        placeholder="Your WoSB captain name or delivery handle"
                      />
                    </label>
                    <label>
                      Wishlist (visible only to your Secret Santa) *
                      <textarea
                        required
                        minLength={2}
                        maxLength={1500}
                        value={wishlist}
                        onChange={(e) => setWishlist(e.target.value)}
                        placeholder="Ships, resources, skins, Steam wishlist items, or gift ideas..."
                      />
                    </label>
                    <label>
                      Please avoid / already have (optional)
                      <textarea
                        maxLength={600}
                        value={avoidList}
                        onChange={(e) => setAvoidList(e.target.value)}
                        placeholder="Anything you already own or prefer not to receive"
                      />
                    </label>
                    <label>
                      Delivery & extra notes (optional)
                      <input
                        maxLength={600}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Best time online, home port, timezone, etc."
                      />
                    </label>
                    <label className="checkLine">
                      <input
                        type="checkbox"
                        checked={backupElf}
                        onChange={(e) => setBackupElf(e.target.checked)}
                      />
                      <span>Volunteer as a Backup Elf (help cover if someone drops out)</span>
                    </label>
                    <div className="uiRow">
                      <button type="submit" className="primaryAction" disabled={busy}>
                        {participant ? "Save Wishlist" : "Join Secret Santa"}
                      </button>
                      {participant && event.status === "SIGNUPS_OPEN" && (
                        <button
                          type="button"
                          className="dangerAction"
                          disabled={busy}
                          onClick={() => void handleWithdraw()}
                        >
                          Withdraw
                        </button>
                      )}
                    </div>
                  </form>
                ) : (
                  <p className="uiMuted" style={{ margin: 0 }}>
                    {participant
                      ? "This Secret Santa has been revealed — wishlists are now locked."
                      : "Signups are closed for this Secret Santa."}
                  </p>
                )}
              </section>

              <section className="ssCard">
                <div className="ssCardHead">
                  <div>
                    <span className="eyebrow">CREW ROSTER</span>
                    <h2>Participants ({participants.length})</h2>
                  </div>
                </div>
                {participants.length ? (
                  <div className="ssParticipantGrid">
                    {participants.map((p) => (
                      <div key={p.userId} className="ssParticipantChip">
                        <div>
                          <b>{p.displayName}</b>
                          <div>
                            <small>{p.hasWishlist ? "Wishlist ready" : "No wishlist yet"}</small>
                          </div>
                        </div>
                        {p.backupElf && <span className="ssPill">Elf</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="uiMuted" style={{ margin: 0 }}>
                    No Misfits signed up yet — be the first!
                  </p>
                )}
              </section>
            </div>

            {reveal && reveal.length > 0 && (
              <section className="ssCard highlight">
                <div className="ssCardHead">
                  <div>
                    <span className="eyebrow">GRAND REVEAL</span>
                    <h2>Who Was Whose Secret Santa</h2>
                  </div>
                </div>
                <div className="ssTableWrap">
                  <table className="ssTable">
                    <thead>
                      <tr>
                        <th>Secret Santa</th>
                        <th>Gifted To</th>
                        <th>Sent</th>
                        <th>Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reveal.map((r, i) => (
                        <tr key={i}>
                          <td>
                            <b>{r.giver_name}</b>
                          </td>
                          <td>{r.recipient_name}</td>
                          <td>{r.gift_sent ? "Yes" : "—"}</td>
                          <td>{r.gift_received ? "Yes" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )
      ) : (
        /* Officer Management Tab (Zero-Spoiler by default) */
        <div className="uiStackLg">
          <section className="ssCard">
            <div className="ssCardHead">
              <div>
                <span className="eyebrow">OFFICER CONTROLS · ZERO-SPOILER</span>
                <h2>{creatingNew ? "Create Secret Santa Event" : "Manage Event"}</h2>
              </div>
              <div className="uiRow">
                {(adminData?.events ?? []).length > 0 && (
                  <select
                    aria-label="Select Secret Santa event"
                    value={creatingNew ? "__new__" : selectedEventId}
                    onChange={(e) => {
                      if (e.target.value === "__new__") startNewEvent();
                      else void refreshAdmin(e.target.value);
                    }}
                  >
                    {(adminData?.events ?? []).map((ev: any) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.title} ({statusLabel(ev.status)})
                      </option>
                    ))}
                    <option value="__new__">+ New Secret Santa Event</option>
                  </select>
                )}
                {!creatingNew && (
                  <button type="button" className="secondaryAction" onClick={startNewEvent}>
                    + New Event
                  </button>
                )}
              </div>
            </div>

            {selectedAdminEvent && !creatingNew && (
              <div className="uiRow">
                <button
                  type="button"
                  className="secondaryAction"
                  disabled={busy || !evChannelId}
                  onClick={() => void handleAdminAction("publish")}
                >
                  Publish / Refresh Discord Card
                </button>
                {["DRAFT", "SIGNUPS_OPEN"].includes(selectedAdminEvent.status) && (
                  <button
                    type="button"
                    className="primaryAction"
                    disabled={busy || (adminData?.participants?.length ?? 0) < 3}
                    onClick={() => void handleAdminAction("match")}
                  >
                    Draw Secret Santa Matches
                  </button>
                )}
                {selectedAdminEvent.status === "MATCHED" && (
                  <>
                    <button
                      type="button"
                      className="secondaryAction"
                      disabled={busy}
                      onClick={() => void handleAdminAction("remind")}
                    >
                      Send Gift Reminders
                    </button>
                    <button
                      type="button"
                      className="primaryAction"
                      disabled={busy}
                      onClick={() => void handleAdminAction("reveal")}
                    >
                      Reveal Secret Santas
                    </button>
                  </>
                )}
              </div>
            )}

            <form className="ssForm" onSubmit={handleSaveEvent}>
              <div className="ssFormRow">
                <label>
                  Event Title *
                  <input
                    required
                    minLength={2}
                    maxLength={120}
                    value={evTitle}
                    onChange={(e) => setEvTitle(e.target.value)}
                  />
                </label>
                <label>
                  Budget / Gift Rules
                  <input
                    maxLength={400}
                    value={evBudget}
                    onChange={(e) => setEvBudget(e.target.value)}
                    placeholder="e.g. In-game ships/gold or ~$15 gift card"
                  />
                </label>
              </div>

              <label>
                Description
                <textarea
                  maxLength={2000}
                  value={evDesc}
                  onChange={(e) => setEvDesc(e.target.value)}
                />
              </label>

              <div className="ssFormRow">
                <label>
                  Discord Announcement Channel
                  <select value={evChannelId} onChange={(e) => setEvChannelId(e.target.value)}>
                    <option value="">None (Dashboard & slash command only)</option>
                    {(adminData?.channels ?? []).map((c: ChannelItem) => (
                      <option key={c.id} value={c.id}>
                        #{c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={evStatus}
                    disabled={
                      !creatingNew &&
                      selectedAdminEvent &&
                      ["MATCHED", "REVEALED"].includes(selectedAdminEvent.status) &&
                      evStatus !== "ARCHIVED"
                        ? false
                        : false
                    }
                    onChange={(e) => setEvStatus(e.target.value as any)}
                  >
                    <option value="SIGNUPS_OPEN">Signups Open</option>
                    <option value="DRAFT">Draft (Hidden from members)</option>
                    {!creatingNew && <option value="ARCHIVED">Archived</option>}
                  </select>
                </label>
              </div>

              <div className="ssFormRow">
                <label>
                  Signups Close At (optional)
                  <input
                    type="datetime-local"
                    value={evSignupCloses}
                    onChange={(e) => setEvSignupCloses(e.target.value)}
                  />
                </label>
                <label>
                  Gift Deadline (optional)
                  <input
                    type="datetime-local"
                    value={evGiftDeadline}
                    onChange={(e) => setEvGiftDeadline(e.target.value)}
                  />
                </label>
              </div>

              <div className="uiStack">
                <div className="ssCardHead">
                  <label style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                    Allowed Discord Roles ({evRoles.length ? `${evRoles.length} selected` : "Everyone in server"})
                  </label>
                  <input
                    style={{ maxWidth: 240 }}
                    placeholder="Filter roles..."
                    value={roleSearch}
                    onChange={(e) => setRoleSearch(e.target.value)}
                  />
                </div>
                <div className="ssRoleGrid">
                  {filteredRoles.map((r) => (
                    <label key={r.id} className="ssRoleChip">
                      <input
                        type="checkbox"
                        checked={evRoles.includes(r.id)}
                        onChange={() => toggleRole(r.id)}
                      />
                      <span>@{r.name}</span>
                    </label>
                  ))}
                  {!filteredRoles.length && <span className="uiMuted">No matching roles.</span>}
                </div>
              </div>

              <div className="uiRow">
                <button type="submit" className="primaryAction" disabled={busy}>
                  {creatingNew ? "Create Event" : "Save Settings"}
                </button>
              </div>
            </form>
          </section>

          {selectedAdminEvent && !creatingNew && (
            <>
              <section className="ssCard">
                <div className="ssCardHead">
                  <div>
                    <span className="eyebrow">PROGRESS TRACKER (NO SPOILERS)</span>
                    <h2>Participants & Gift Health</h2>
                  </div>
                </div>
                <div className="ssStatStrip">
                  <div className="ssStat">
                    <small>Signed Up</small>
                    <b>{adminData?.participants?.length ?? 0}</b>
                  </div>
                  <div className="ssStat">
                    <small>Matched</small>
                    <b>{adminData?.stats?.total ?? 0}</b>
                  </div>
                  <div className="ssStat">
                    <small>DMs Delivered</small>
                    <b>{adminData?.stats?.dmDelivered ?? 0}</b>
                  </div>
                  <div className="ssStat">
                    <small>DM Issues</small>
                    <b>{adminData?.stats?.dmFailed ?? 0}</b>
                  </div>
                  <div className="ssStat">
                    <small>Gifts Sent</small>
                    <b>{adminData?.stats?.sent ?? 0}</b>
                  </div>
                  <div className="ssStat">
                    <small>Gifts Received</small>
                    <b>{adminData?.stats?.received ?? 0}</b>
                  </div>
                </div>

                <div className="ssTableWrap">
                  <table className="ssTable">
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>IGN</th>
                        <th>Wishlist</th>
                        <th>Backup Elf</th>
                        <th>Match DM</th>
                        <th>Gift Sent</th>
                        <th>Gift Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(adminData?.participants ?? []).map((p: any) => (
                        <tr key={p.user_id}>
                          <td>
                            <b>{p.display_name}</b>
                          </td>
                          <td>{p.ign || "—"}</td>
                          <td>{p.has_wishlist ? "Ready" : "Missing"}</td>
                          <td>{p.backup_elf ? "Yes" : "—"}</td>
                          <td>
                            {selectedAdminEvent.status === "DRAFT" ||
                            selectedAdminEvent.status === "SIGNUPS_OPEN"
                              ? "Not drawn"
                              : p.dm_delivered_at
                                ? "Delivered"
                                : p.dm_last_error
                                  ? "Closed DMs (Dashboard ok)"
                                  : "Queued"}
                          </td>
                          <td>{p.gift_sent ? "Sent" : "Pending"}</td>
                          <td>{p.gift_received ? "Received" : "Pending"}</td>
                        </tr>
                      ))}
                      {!(adminData?.participants ?? []).length && (
                        <tr>
                          <td colSpan={7} className="uiMuted">
                            No participants yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {["DRAFT", "SIGNUPS_OPEN"].includes(selectedAdminEvent.status) && (
                <section className="ssCard">
                  <div className="ssCardHead">
                    <div>
                      <span className="eyebrow">PAIRING RULES</span>
                      <h2>Exclusions (Do Not Match Together)</h2>
                    </div>
                  </div>
                  <form className="ssForm" onSubmit={handleAddExclusion}>
                    <div className="ssFormRow">
                      <label>
                        Member A
                        <select value={exclA} onChange={(e) => setExclA(e.target.value)}>
                          <option value="">Select participant...</option>
                          {(adminData?.participants ?? []).map((p: any) => (
                            <option key={p.user_id} value={p.user_id}>
                              {p.display_name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Member B
                        <select value={exclB} onChange={(e) => setExclB(e.target.value)}>
                          <option value="">Select participant...</option>
                          {(adminData?.participants ?? []).map((p: any) => (
                            <option key={p.user_id} value={p.user_id}>
                              {p.display_name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="uiRow">
                      <button
                        type="submit"
                        className="secondaryAction"
                        disabled={busy || !exclA || !exclB || exclA === exclB}
                      >
                        Add Exclusion Pair
                      </button>
                    </div>
                  </form>
                  {(adminData?.exclusions ?? []).length > 0 && (
                    <div className="ssParticipantGrid">
                      {(adminData?.exclusions ?? []).map((ex: any) => (
                        <div key={`${ex.user_a}-${ex.user_b}`} className="ssParticipantChip">
                          <span>
                            <b>{ex.name_a ?? ex.user_a}</b> ↔ <b>{ex.name_b ?? ex.user_b}</b>
                          </span>
                          <button
                            type="button"
                            className="dangerAction"
                            disabled={busy}
                            onClick={() => void handleRemoveExclusion(ex.user_a, ex.user_b)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {selectedAdminEvent.status === "MATCHED" && (
                <div className="ssGrid">
                  <section className="ssCard">
                    <div className="ssCardHead">
                      <div>
                        <span className="eyebrow">BACKUP ELF RESCUE</span>
                        <h2>Reassign a Dropout's Match</h2>
                      </div>
                    </div>
                    <p className="uiMuted" style={{ margin: 0 }}>
                      Transfer an active Santa's recipient to an unassigned Backup Elf without spoiling the
                      recipient's name to you. Jolly Misfit will DM the Backup Elf automatically.
                    </p>
                    <form className="ssForm" onSubmit={handleReassign}>
                      <label>
                        Santa who dropped out
                        <select value={reassignFrom} onChange={(e) => setReassignFrom(e.target.value)}>
                          <option value="">Select Santa...</option>
                          {(adminData?.participants ?? []).map((p: any) => (
                            <option key={p.user_id} value={p.user_id}>
                              {p.display_name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Replacement Backup Elf (Discord User ID)
                        <input
                          value={reassignTo}
                          onChange={(e) => setReassignTo(e.target.value)}
                          placeholder="e.g. 123456789012345678"
                        />
                      </label>
                      <div className="uiRow">
                        <button
                          type="submit"
                          className="secondaryAction"
                          disabled={busy || !reassignFrom || !reassignTo.trim()}
                        >
                          Reassign Match
                        </button>
                      </div>
                    </form>
                  </section>

                  <section className="ssCard">
                    <div className="ssCardHead">
                      <div>
                        <span className="eyebrow">SENTINEL-AUDITED</span>
                        <h2>Emergency Pairing Inspect</h2>
                      </div>
                    </div>
                    <p className="uiMuted" style={{ margin: 0 }}>
                      Only use this if you must resolve a dispute or missing gift. Your user ID and reason are
                      permanently logged to Sentinel.
                    </p>
                    <form className="ssForm" onSubmit={handleEmergencyInspect}>
                      <label>
                        Audit Reason (min 4 characters)
                        <input
                          value={inspectReason}
                          onChange={(e) => setInspectReason(e.target.value)}
                          maxLength={300}
                          placeholder="e.g. Investigating missing gift report"
                        />
                      </label>
                      <div className="uiRow">
                        <button
                          type="submit"
                          className="dangerAction"
                          disabled={busy || inspectReason.trim().length < 4}
                        >
                          Reveal Pairings (Audited)
                        </button>
                      </div>
                    </form>
                    {inspectedPairings && (
                      <div className="ssTableWrap">
                        <table className="ssTable">
                          <thead>
                            <tr>
                              <th>Santa</th>
                              <th>Recipient</th>
                              <th>Sent</th>
                              <th>Received</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inspectedPairings.map((p: any) => (
                              <tr key={p.giver_id}>
                                <td>
                                  <b>{p.giver_name}</b>
                                </td>
                                <td>{p.recipient_name}</td>
                                <td>{p.gift_sent ? "Yes" : "No"}</td>
                                <td>{p.gift_received ? "Yes" : "No"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
