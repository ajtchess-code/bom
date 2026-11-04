"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import GuildEmojiUploader from "./GuildEmojiUploader";
import DiscordOptionsSelect from "./DiscordOptionsSelect";
import RoleTagPicker from "./RoleTagPicker";

type Tab = "voice" | "channels" | "social" | "import" | "providers" | "history" | "health";
const PROVIDERS = ["YOUTUBE", "TWITCH", "REDDIT", "X", "INSTAGRAM", "FACEBOOK"] as const;
const EVENTS: Record<string, string[]> = {
  YOUTUBE: ["VIDEO"],
  TWITCH: ["LIVE", "VOD"],
  REDDIT: ["POST"],
  X: ["POST"],
  INSTAGRAM: ["POST"],
  FACEBOOK: ["POST"],
};
const CREDENTIAL_FIELDS: Record<
  string,
  { key: string; label: string; secret?: boolean; placeholder?: string }[]
> = {
  YOUTUBE: [{ key: "apiKey", label: "YouTube API key", secret: true }],
  TWITCH: [
    { key: "clientId", label: "Twitch Client ID" },
    { key: "clientSecret", label: "Twitch Client Secret", secret: true },
  ],
  REDDIT: [
    { key: "clientId", label: "Reddit Client ID" },
    { key: "clientSecret", label: "Reddit Client Secret", secret: true },
    { key: "userAgent", label: "Reddit User Agent", placeholder: "BOMSocial/1.0" },
  ],
  X: [{ key: "bearerToken", label: "X API bearer token", secret: true }],
  INSTAGRAM: [
    { key: "accessToken", label: "Meta access token", secret: true },
    { key: "businessAccountId", label: "Instagram Business Account ID" },
    { key: "appSecret", label: "Meta App Secret (webhook signatures)", secret: true },
  ],
  FACEBOOK: [
    { key: "accessToken", label: "Meta Page access token", secret: true },
    { key: "appSecret", label: "Meta App Secret (webhook signatures)", secret: true },
  ],
};

async function api(path: string, init: RequestInit = {}) {
  const h = new Headers(init.headers);
  if (init.body && !h.has("content-type")) h.set("content-type", "application/json");
  return fetch(path, { ...init, headers: h, cache: "no-store" });
}
const arr = (v: any) => (Array.isArray(v) ? v : []);
const fmt = (v: any) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : String(v);
};
const channelName = (ctx: any, id: string) =>
  ctx?.textChannels?.find((x: any) => x.id === id)?.name ??
  ctx?.voiceChannels?.find((x: any) => x.id === id)?.name ??
  id;

function RoleMulti({
  label,
  roles,
  value,
  onChange,
  onRefresh,
}: {
  label: string;
  roles: any[];
  value: string[];
  onChange: (v: string[]) => void;
  onRefresh?: () => void;
}) {
  return (
    <label>
      {label}
      <RoleTagPicker roles={roles} value={value} onChange={onChange} onRefresh={onRefresh} />
    </label>
  );
}

export default function AutomationSocialAdmin({ voiceOnly = false }: { voiceOnly?: boolean } = {}) {
  const [refreshingOptions, setRefreshingOptions] = useState(false);
  const [tab, setTab] = useState<Tab>("voice");
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [voice, setVoice] = useState<any>({
    creatorChannelId: "",
    categoryId: null,
    enabled: true,
    nameTemplate: "{displayName}'s Room",
    numberStyle: "NONE",
    bitrate: 384000,
    userLimit: 0,
    visibility: "PRIVATE",
    allowedRoleIds: [],
    managerRoleIds: [],
    positionAboveChannelId: null,
    deniedRoleIds: [],
    ownerCanManage: true,
    deleteDelaySeconds: 10,
    clonePermissions: true,
    linkedTextChannel: false,
    textNameTemplate: "{displayName}-room",
    waitingRoom: false,
    waitingNameTemplate: "{displayName}'s Waiting Room",
  });
  const [channel, setChannel] = useState<any>({
    channelId: "",
    enabled: true,
    autoThread: true,
    threadNameTemplate: "{author} — {message}",
    autoArchiveMinutes: 1440,
    reactionEmojis: [],
    onlyAttachments: false,
    onlyLinks: false,
    ignoreBots: true,
    ignoreWebhooks: true,
    allowedRoleIds: [],
    excludedRoleIds: [],
    starterMessage: "",
  });
  const [reactions, setReactions] = useState("👍 ❤️");
  const [feed, setFeed] = useState<any>({
    provider: "YOUTUBE",
    sourceInput: "",
    targetChannelId: "",
    mentionRoleId: null,
    enabled: true,
    eventTypes: ["VIDEO"],
    pollingSeconds: 120,
    config: { autoPublish: false, titleIncludes: "", gameIncludes: "" },
    template: {
      messagePrefix: "",
      titlePrefix: "",
      includeBody: true,
      includeMedia: true,
      includeAuthor: true,
      includeLink: true,
    },
  });
  const [creds, setCreds] = useState<Record<string, Record<string, string>>>({});
  const [importFeed, setImportFeed] = useState("");
  const [importItems, setImportItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState("newest");
  const [cursor, setCursor] = useState<string | null>(null);
  const ctx = data?.context;
  const browserOrigin =
    typeof window !== "undefined" ? window.location.origin : "https://dashboard.bandofmisfits.org";

  const numberSample =
    voice.numberStyle === "SUPERSCRIPT"
      ? "¹"
      : voice.numberStyle === "PAD2"
        ? "01"
        : voice.numberStyle === "STANDARD"
          ? "1"
          : "";
  const voicePreview = (() => {
    let t = String(voice.nameTemplate || "Temporary Voice")
      .replaceAll("{displayName}", "Litefootz")
      .replaceAll("{username}", "litefootz")
      .replaceAll("{number}", numberSample);
    if (voice.numberStyle !== "NONE" && !String(voice.nameTemplate || "").includes("{number}"))
      t += numberSample;
    return t;
  })();
  async function refresh() {
    const r = await api("/api/internal/admin/automations/summary");
    if (!r.ok) {
      setNotice(`Automations failed to load (${r.status}).`);
      return;
    }
    const j = await r.json();
    setData(j);
    setVoice((v: any) => ({
      ...v,
      creatorChannelId: v.creatorChannelId || j.context?.voiceChannels?.[0]?.id || "",
      categoryId: v.categoryId ?? j.context?.categories?.[0]?.id ?? null,
    }));
    setChannel((v: any) => ({ ...v, channelId: v.channelId || j.context?.textChannels?.[0]?.id || "" }));
    setFeed((v: any) => ({
      ...v,
      targetChannelId: v.targetChannelId || j.context?.textChannels?.[0]?.id || "",
    }));
    if (!importFeed && j.feeds?.length) setImportFeed(j.feeds[0].id);
  }
  async function refreshDiscordOptions() {
    setRefreshingOptions(true);
    try {
      const res = await api("/api/internal/membership/discord-context");
      if (!res.ok) throw new Error(`Discord option refresh failed (${res.status})`);
      const body = await res.json();
      setData((current: any) => ({ ...current, context: body.discord }));
      setNotice("Discord roles, channels and categories refreshed without changing your edits.");
    } catch (e: any) {
      setNotice(String(e.message ?? e));
    } finally {
      setRefreshingOptions(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  const say = (s: string) => {
    setNotice(s);
    setTimeout(() => setNotice(""), 4500);
  };
  async function submit(path: string, body: any, ok: string) {
    setBusy(true);
    try {
      const r = await api(path, { method: "PUT", body: JSON.stringify(body) });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`${r.status}: ${t.slice(0, 180)}`);
      }
      say(ok);
      await refresh();
    } catch (e: any) {
      say(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function del(path: string) {
    if (!confirm("Delete this configuration?")) return;
    const r = await api(path, { method: "DELETE" });
    if (r.ok) {
      say("Deleted.");
      await refresh();
    } else say(`Delete failed (${r.status})`);
  }
  function editVoice(r: any) {
    setVoice({
      id: r.id,
      creatorChannelId: r.creator_channel_id,
      categoryId: r.category_id,
      enabled: Boolean(r.enabled),
      nameTemplate: r.name_template,
      numberStyle: r.number_style || "NONE",
      bitrate: r.bitrate === null ? 384000 : Number(r.bitrate),
      managerRoleIds: arr(r.manager_role_ids),
      positionAboveChannelId: r.position_above_channel_id ?? null,
      userLimit: Number(r.user_limit || 0),
      visibility: r.visibility,
      allowedRoleIds: arr(r.allowed_role_ids),
      deniedRoleIds: arr(r.denied_role_ids),
      ownerCanManage: Boolean(r.owner_can_manage),
      deleteDelaySeconds: Number(r.delete_delay_seconds || 0),
      clonePermissions: Boolean(r.clone_permissions),
      linkedTextChannel: Boolean(r.linked_text_channel),
      textNameTemplate: r.text_name_template,
      waitingRoom: Boolean(r.waiting_room),
      waitingNameTemplate: r.waiting_name_template || "{displayName}'s Waiting Room",
    });
    setTab("voice");
  }
  function editChannel(r: any) {
    setChannel({
      id: r.id,
      channelId: r.channel_id,
      enabled: Boolean(r.enabled),
      autoThread: Boolean(r.auto_thread),
      threadNameTemplate: r.thread_name_template,
      autoArchiveMinutes: Number(r.auto_archive_minutes || 1440),
      reactionEmojis: arr(r.reaction_emojis),
      onlyAttachments: Boolean(r.only_attachments),
      onlyLinks: Boolean(r.only_links),
      ignoreBots: Boolean(r.ignore_bots),
      ignoreWebhooks: Boolean(r.ignore_webhooks),
      allowedRoleIds: arr(r.allowed_role_ids),
      excludedRoleIds: arr(r.excluded_role_ids),
      starterMessage: r.starter_message || "",
    });
    setReactions(arr(r.reaction_emojis).join(" "));
    setTab("channels");
  }
  function editFeed(f: any) {
    setFeed({
      id: f.id,
      provider: f.provider,
      sourceInput: f.source_input,
      targetChannelId: f.target_channel_id,
      mentionRoleId: f.mention_role_id,
      enabled: Boolean(f.enabled),
      eventTypes: arr(f.event_types),
      pollingSeconds: Number(f.polling_seconds || 120),
      accountKey: f.account_key,
      accountName: f.account_name,
      accountUrl: f.account_url,
      config: f.config || {},
      template: f.template || {},
    });
    setTab("social");
  }
  async function saveCredential(provider: string, e: FormEvent) {
    e.preventDefault();
    const body = creds[provider] || {};
    if (!Object.values(body).some(Boolean)) {
      say("Enter at least one credential value.");
      return;
    }
    const r = await api(`/api/internal/admin/social/credentials/${provider}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setCreds((x) => ({ ...x, [provider]: {} }));
      say(`${provider} credentials saved securely.`);
      await refresh();
    } else say(`Credential save failed (${r.status})`);
  }
  async function testFeed(id: string) {
    const r = await api(`/api/internal/admin/social/feeds/${id}/test`, { method: "POST" });
    say(r.ok ? "Test notification sent." : `Test failed (${r.status})`);
  }
  async function subscribe(id: string) {
    const r = await api(`/api/internal/admin/social/feeds/${id}/subscribe`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    say(r.ok ? "Webhook/subscription refreshed." : j.error || `Subscribe failed (${r.status})`);
    await refresh();
  }
  async function loadImport(append = false) {
    if (!importFeed) return;
    setBusy(true);
    try {
      const url = `/api/internal/admin/social/import/${importFeed}?limit=50${append && cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const r = await api(url);
      if (!r.ok) throw new Error(`Import browse failed (${r.status})`);
      const j = await r.json();
      setImportItems((old) => (append ? [...old, ...arr(j.items)] : arr(j.items)));
      setCursor(j.nextCursor || null);
      if (!append) setSelected(new Set(arr(j.items).map((x: any) => x.externalId)));
    } catch (e: any) {
      say(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function loadAllImport() {
    if (!importFeed) return;
    setBusy(true);
    try {
      let next: string | null = null,
        all: any[] = [];
      let pages = 0;
      do {
        const url = `/api/internal/admin/social/import/${importFeed}?limit=100${next ? `&cursor=${encodeURIComponent(next)}` : ""}`;
        const r = await api(url);
        if (!r.ok) throw new Error(`Archive browse failed (${r.status})`);
        const j = await r.json();
        all.push(...arr(j.items));
        next = j.nextCursor || null;
        pages++;
        setNotice(`Loading archive… ${all.length} items`);
        if (pages >= 200) throw new Error("Archive safety limit reached after 20,000 items.");
      } while (next);
      setImportItems(all);
      setSelected(new Set(all.map((x) => x.externalId)));
      setCursor(null);
      say(`Loaded ${all.length} archive items.`);
    } catch (e: any) {
      say(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function postSelected() {
    const items = importItems.filter((x) => selected.has(x.externalId));
    if (!items.length) {
      say("Select at least one item.");
      return;
    }
    setBusy(true);
    try {
      const r = await api(`/api/internal/admin/social/import/${importFeed}`, {
        method: "POST",
        body: JSON.stringify({ items }),
      });
      const j = await r.json().catch(() => ({}));
      say(
        r.ok
          ? `${j.queued ?? items.length} items queued for Discord delivery.`
          : `Import failed (${r.status})`,
      );
      if (r.ok) await refresh();
    } finally {
      setBusy(false);
    }
  }
  const sorted = useMemo(
    () =>
      [...importItems].sort((a, b) => {
        if (sort === "oldest") return +new Date(a.publishedAt || 0) - +new Date(b.publishedAt || 0);
        if (sort === "title") return String(a.title || "").localeCompare(String(b.title || ""));
        if (sort === "views") return Number(b.meta?.views || 0) - Number(a.meta?.views || 0);
        if (sort === "duration") return Number(b.meta?.durationMs || 0) - Number(a.meta?.durationMs || 0);
        return +new Date(b.publishedAt || 0) - +new Date(a.publishedAt || 0);
      }),
    [importItems, sort],
  );
  if (!data)
    return (
      <section className="panel">
        <div className="panelHead">
          <h3>{voiceOnly ? "Join-to-Create Voice" : "Automations & Social Feeds"}</h3>
          <span>loading</span>
        </div>
        <p className="uiLoading" role="status">
          Loading administration configuration…
        </p>
      </section>
    );
  return (
    <section className="automationStudio panel">
      <div className="panelHead">
        <div>
          <h3>{voiceOnly ? "Join-to-Create Voice" : "Automations & Social Feeds"}</h3>
          <span>{voiceOnly ? "Temporary voice room setup" : "Administrator-only server orchestration"}</span>
        </div>
        <span className="statusPill">
          {voiceOnly
            ? `${data.voiceRules?.length || 0} configured`
            : `${data.voiceRules?.length || 0} voice · ${data.channelRules?.length || 0} channel · ${data.feeds?.length || 0} social`}
        </span>
      </div>

      {notice && <div className="notice automationNotice">{notice}</div>}
      {!voiceOnly && (
        <div className="automationTabs">
          {(["voice", "channels", "social", "import", "providers", "history", "health"] as Tab[]).map((x) => (
            <button key={x} className={tab === x ? "active" : ""} onClick={() => setTab(x)}>
              {x === "voice"
                ? "Voice Automation"
                : x === "channels"
                  ? "Channel Automation"
                  : x === "social"
                    ? "Social Feeds"
                    : x === "import"
                      ? "Importer"
                      : x === "providers"
                        ? "Providers & Credentials"
                        : x === "history"
                          ? "Delivery History"
                          : "Health"}
            </button>
          ))}
        </div>
      )}

      {tab === "voice" && (
        <div className="automationPane">
          <div className="automationSplit">
            <form
              className="stackForm automationForm"
              onSubmit={(e) => {
                e.preventDefault();
                void submit("/api/internal/admin/automations/voice", voice, "Voice automation saved.");
              }}
            >
              <h4>{voice.id ? "Edit" : "Create"} Join-to-Create rule</h4>
              <label>
                Creator voice channel
                <DiscordOptionsSelect
                  onRefresh={() => void refreshDiscordOptions()}
                  refreshing={refreshingOptions}
                  value={voice.creatorChannelId}
                  onChange={(e) => setVoice({ ...voice, creatorChannelId: e.target.value })}
                >
                  {ctx?.voiceChannels?.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      🔊 {c.name}
                    </option>
                  ))}
                </DiscordOptionsSelect>
              </label>
              <label>
                Destination category
                <DiscordOptionsSelect
                  onRefresh={() => void refreshDiscordOptions()}
                  refreshing={refreshingOptions}
                  value={voice.categoryId ?? ""}
                  onChange={(e) => setVoice({ ...voice, categoryId: e.target.value || null })}
                >
                  <option value="">Same / inherited</option>
                  {ctx?.categories?.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </DiscordOptionsSelect>
              </label>
              <label>
                Voice name template
                <input
                  value={voice.nameTemplate}
                  onChange={(e) => setVoice({ ...voice, nameTemplate: e.target.value })}
                  placeholder="BOM"
                />
                <small>
                  Tokens: {"{displayName}"}, {"{username}"}, {"{number}"}. If numbering is enabled and{" "}
                  {"{number}"} is omitted, the number is appended automatically.
                </small>
              </label>
              <label>
                Automatic room numbering
                <select
                  value={voice.numberStyle || "NONE"}
                  onChange={(e) => setVoice({ ...voice, numberStyle: e.target.value })}
                >
                  <option value="NONE">Off</option>
                  <option value="STANDARD">Standard — BOM1, BOM2, BOM3</option>
                  <option value="SUPERSCRIPT">Superscript — BOM¹, BOM², BOM³</option>
                  <option value="PAD2">Padded — BOM01, BOM02, BOM03</option>
                </select>
                <small>The lowest available number is reused when a temporary room closes.</small>
              </label>
              <div className="voiceNamePreview">
                <small>Preview</small>
                <b>🔊 {voicePreview}</b>
              </div>
              <div className="automationRow">
                <label>
                  Bitrate
                  <input
                    type="number"
                    min={8000}
                    max={384000}
                    placeholder="384000"
                    value={voice.bitrate ?? 384000}
                    onChange={(e) =>
                      setVoice({ ...voice, bitrate: e.target.value ? Number(e.target.value) : 384000 })
                    }
                  />
                </label>
                <label>
                  User limit
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={voice.userLimit}
                    onChange={(e) => setVoice({ ...voice, userLimit: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Empty delete delay
                  <input
                    type="number"
                    min={0}
                    max={3600}
                    value={voice.deleteDelaySeconds}
                    onChange={(e) => setVoice({ ...voice, deleteDelaySeconds: Number(e.target.value) })}
                  />
                </label>
              </div>
              <div className="voiceAccessNotice">
                <b>Private by default</b>
                <small>
                  Only the creator and explicitly allowed roles can see or join the created voice room. If you
                  enable a Waiting Room, everyone in the server can enter that room.
                </small>
              </div>
              <label className="toggleLine">
                <input
                  type="checkbox"
                  checked={voice.clonePermissions}
                  onChange={(e) => setVoice({ ...voice, clonePermissions: e.target.checked })}
                />{" "}
                Clone category settings (access remains private)
              </label>
              <label className="toggleLine">
                <input
                  type="checkbox"
                  checked={voice.ownerCanManage}
                  onChange={(e) => setVoice({ ...voice, ownerCanManage: e.target.checked })}
                />{" "}
                Give temporary owner room management controls
              </label>
              <label className="toggleLine">
                <input
                  type="checkbox"
                  checked={voice.waitingRoom}
                  onChange={(e) => setVoice({ ...voice, waitingRoom: e.target.checked })}
                />{" "}
                Create a linked waiting voice room
              </label>
              {voice.waitingRoom && (
                <label>
                  Waiting room template
                  <input
                    value={voice.waitingNameTemplate}
                    onChange={(e) => setVoice({ ...voice, waitingNameTemplate: e.target.value })}
                  />
                </label>
              )}
              <label className="toggleLine">
                <input
                  type="checkbox"
                  checked={voice.linkedTextChannel}
                  onChange={(e) => setVoice({ ...voice, linkedTextChannel: e.target.checked })}
                />{" "}
                Create linked temporary text channel
              </label>
              {voice.linkedTextChannel && (
                <label>
                  Text channel template
                  <input
                    value={voice.textNameTemplate}
                    onChange={(e) => setVoice({ ...voice, textNameTemplate: e.target.value })}
                  />
                </label>
              )}
              <RoleMulti
                label="Roles explicitly allowed"
                roles={ctx?.roles || []}
                value={voice.allowedRoleIds || []}
                onChange={(v) => setVoice({ ...voice, allowedRoleIds: v })}
                onRefresh={() => void refreshDiscordOptions()}
              />
              <RoleMulti
                label="Roles that can manage the voice room"
                roles={ctx?.roles || []}
                value={voice.managerRoleIds || []}
                onChange={(v) => setVoice({ ...voice, managerRoleIds: v })}
                onRefresh={() => void refreshDiscordOptions()}
              />
              <label>
                Keep created rooms above
                <DiscordOptionsSelect
                  onRefresh={() => void refreshDiscordOptions()}
                  refreshing={refreshingOptions}
                  value={voice.positionAboveChannelId ?? ""}
                  onChange={(e) => setVoice({ ...voice, positionAboveChannelId: e.target.value || null })}
                >
                  <option value="">No channel anchor</option>
                  {ctx?.voiceChannels?.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      🔊 {c.name}
                    </option>
                  ))}
                </DiscordOptionsSelect>
                <small>Select a channel in the same category as the new rooms.</small>
              </label>
              <RoleMulti
                label="Roles explicitly denied"
                roles={ctx?.roles || []}
                value={voice.deniedRoleIds || []}
                onChange={(v) => setVoice({ ...voice, deniedRoleIds: v })}
                onRefresh={() => void refreshDiscordOptions()}
              />
              <label className="toggleLine">
                <input
                  type="checkbox"
                  checked={voice.enabled}
                  onChange={(e) => setVoice({ ...voice, enabled: e.target.checked })}
                />{" "}
                Enabled
              </label>
              <div className="buttonRow">
                <button disabled={busy} className="goldButton">
                  {voice.id ? "Update" : "Create"} rule
                </button>
                {voice.id && (
                  <button
                    type="button"
                    className="outlineButton"
                    onClick={() => setVoice({ ...voice, id: undefined })}
                  >
                    New rule
                  </button>
                )}
              </div>
            </form>
            <div>
              <h4>Configured Creator Channels</h4>
              <div className="automationCards">
                {data.voiceRules?.map((r: any) => (
                  <article key={r.id}>
                    <div>
                      <b>🔊 {channelName(ctx, r.creator_channel_id)}</b>
                      <small>
                        {r.name_template}
                        {r.number_style && r.number_style !== "NONE"
                          ? ` · ${r.number_style.toLowerCase()} numbering`
                          : ""}{" "}
                        · {r.visibility} · delete {r.delete_delay_seconds}s
                      </small>
                    </div>
                    <span className={r.enabled ? "autoState on" : "autoState"}>
                      {r.enabled ? "Enabled" : "Paused"}
                    </span>
                    <div className="cardActions">
                      <button onClick={() => editVoice(r)}>Edit</button>
                      <button onClick={() => void del(`/api/internal/admin/automations/voice/${r.id}`)}>
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
                {!data.voiceRules?.length && (
                  <p className="uiEmpty">No Join-to-Create channels configured.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!voiceOnly && tab === "channels" && (
        <div className="automationPane">
          <div className="automationSplit">
            <form
              className="stackForm automationForm"
              onSubmit={(e) => {
                e.preventDefault();
                void submit(
                  "/api/internal/admin/automations/channel",
                  { ...channel, reactionEmojis: reactions.split(/[\s,]+/).filter(Boolean) },
                  "Channel automation saved.",
                );
              }}
            >
              <h4>{channel.id ? "Edit" : "Create"} channel rule</h4>
              <label>
                Discord channel
                <DiscordOptionsSelect
                  onRefresh={() => void refreshDiscordOptions()}
                  refreshing={refreshingOptions}
                  value={channel.channelId}
                  onChange={(e) => setChannel({ ...channel, channelId: e.target.value })}
                >
                  {ctx?.textChannels?.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      #{c.name}
                    </option>
                  ))}
                </DiscordOptionsSelect>
              </label>
              <label className="toggleLine">
                <input
                  type="checkbox"
                  checked={channel.autoThread}
                  onChange={(e) => setChannel({ ...channel, autoThread: e.target.checked })}
                />{" "}
                Automatically create a thread for matching messages
              </label>
              {channel.autoThread && (
                <>
                  <label>
                    Thread name template
                    <input
                      value={channel.threadNameTemplate}
                      onChange={(e) => setChannel({ ...channel, threadNameTemplate: e.target.value })}
                    />
                    <small>
                      Tokens: {"{author}"}, {"{message}"}
                    </small>
                  </label>
                  <label>
                    Auto-archive
                    <select
                      value={channel.autoArchiveMinutes}
                      onChange={(e) => setChannel({ ...channel, autoArchiveMinutes: Number(e.target.value) })}
                    >
                      <option value={60}>1 hour</option>
                      <option value={1440}>1 day</option>
                      <option value={4320}>3 days</option>
                      <option value={10080}>7 days</option>
                    </select>
                  </label>
                </>
              )}
              <label>
                Automatic reactions
                <input
                  value={reactions}
                  onChange={(e) => setReactions(e.target.value)}
                  placeholder="👍 ❤️ 🏴‍☠️"
                />
                <small>Separate Unicode or custom emoji tokens with spaces.</small>
              </label>
              <GuildEmojiUploader
                onCreated={(token) =>
                  setReactions((value) => [value.trim(), token].filter(Boolean).join(" "))
                }
              />
              <label>
                Thread starter message
                <textarea
                  value={channel.starterMessage || ""}
                  onChange={(e) => setChannel({ ...channel, starterMessage: e.target.value })}
                  placeholder="Optional message sent inside each new thread"
                />
              </label>
              <div className="checkGrid">
                <label className="toggleLine">
                  <input
                    type="checkbox"
                    checked={channel.onlyAttachments}
                    onChange={(e) => setChannel({ ...channel, onlyAttachments: e.target.checked })}
                  />{" "}
                  Attachments only
                </label>
                <label className="toggleLine">
                  <input
                    type="checkbox"
                    checked={channel.onlyLinks}
                    onChange={(e) => setChannel({ ...channel, onlyLinks: e.target.checked })}
                  />{" "}
                  Links only
                </label>
                <label className="toggleLine">
                  <input
                    type="checkbox"
                    checked={channel.ignoreBots}
                    onChange={(e) => setChannel({ ...channel, ignoreBots: e.target.checked })}
                  />{" "}
                  Ignore bots
                </label>
                <label className="toggleLine">
                  <input
                    type="checkbox"
                    checked={channel.ignoreWebhooks}
                    onChange={(e) => setChannel({ ...channel, ignoreWebhooks: e.target.checked })}
                  />{" "}
                  Ignore webhooks
                </label>
              </div>
              <RoleMulti
                label="Only these roles (empty = everyone)"
                roles={ctx?.roles || []}
                value={channel.allowedRoleIds || []}
                onChange={(v) => setChannel({ ...channel, allowedRoleIds: v })}
                onRefresh={() => void refreshDiscordOptions()}
              />
              <RoleMulti
                label="Excluded roles"
                roles={ctx?.roles || []}
                value={channel.excludedRoleIds || []}
                onChange={(v) => setChannel({ ...channel, excludedRoleIds: v })}
                onRefresh={() => void refreshDiscordOptions()}
              />
              <label className="toggleLine">
                <input
                  type="checkbox"
                  checked={channel.enabled}
                  onChange={(e) => setChannel({ ...channel, enabled: e.target.checked })}
                />{" "}
                Enabled
              </label>
              <div className="buttonRow">
                <button disabled={busy} className="goldButton">
                  {channel.id ? "Update" : "Create"} rule
                </button>
                {channel.id && (
                  <button
                    type="button"
                    className="outlineButton"
                    onClick={() => setChannel({ ...channel, id: undefined })}
                  >
                    New rule
                  </button>
                )}
              </div>
            </form>
            <div>
              <h4>Channel Rules</h4>
              <div className="automationCards">
                {data.channelRules?.map((r: any) => (
                  <article key={r.id}>
                    <div>
                      <b>#{channelName(ctx, r.channel_id)}</b>
                      <small>
                        {r.auto_thread ? "Auto-thread" : "No thread"}
                        {arr(r.reaction_emojis).length ? ` · ${arr(r.reaction_emojis).join(" ")}` : ""}
                      </small>
                    </div>
                    <span className={r.enabled ? "autoState on" : "autoState"}>
                      {r.enabled ? "Enabled" : "Paused"}
                    </span>
                    <div className="cardActions">
                      <button onClick={() => editChannel(r)}>Edit</button>
                      <button onClick={() => void del(`/api/internal/admin/automations/channel/${r.id}`)}>
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
                {!data.channelRules?.length && (
                  <p className="uiEmpty">No automatic thread/reaction rules configured.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!voiceOnly && tab === "social" && (
        <div className="automationPane">
          <div className="automationSplit">
            <form
              className="stackForm automationForm"
              onSubmit={(e) => {
                e.preventDefault();
                void submit("/api/internal/admin/social/feeds", feed, "Social feed saved.");
              }}
            >
              <h4>{feed.id ? "Edit" : "Add"} social feed</h4>
              <label>
                Platform
                <select
                  value={feed.provider}
                  onChange={(e) => {
                    const p = e.target.value;
                    setFeed({
                      ...feed,
                      provider: p,
                      eventTypes: EVENTS[p],
                      accountKey: undefined,
                      accountName: undefined,
                      accountUrl: undefined,
                      sourceInput: "",
                    });
                  }}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                Creator / channel / subreddit
                <input
                  value={feed.sourceInput}
                  onChange={(e) => setFeed({ ...feed, sourceInput: e.target.value, accountKey: undefined })}
                  placeholder={
                    feed.provider === "REDDIT"
                      ? "r/SeaOfThieves"
                      : feed.provider === "YOUTUBE"
                        ? "@channel or YouTube URL"
                        : feed.provider === "TWITCH"
                          ? "creator or Twitch URL"
                          : "account name or URL"
                  }
                />
              </label>
              <label>
                Destination Discord channel
                <DiscordOptionsSelect
                  onRefresh={() => void refreshDiscordOptions()}
                  refreshing={refreshingOptions}
                  value={feed.targetChannelId}
                  onChange={(e) => setFeed({ ...feed, targetChannelId: e.target.value })}
                >
                  {ctx?.textChannels?.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      #{c.name}
                    </option>
                  ))}
                </DiscordOptionsSelect>
              </label>
              <label>
                Mention role
                <DiscordOptionsSelect
                  onRefresh={() => void refreshDiscordOptions()}
                  refreshing={refreshingOptions}
                  value={feed.mentionRoleId ?? ""}
                  onChange={(e) => setFeed({ ...feed, mentionRoleId: e.target.value || null })}
                >
                  <option value="">No role ping</option>
                  {ctx?.roles?.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      @{r.name}
                    </option>
                  ))}
                </DiscordOptionsSelect>
              </label>
              <fieldset>
                <legend>Events</legend>
                <div className="checkGrid">
                  {EVENTS[feed.provider]?.map((ev) => (
                    <label key={ev} className="toggleLine">
                      <input
                        type="checkbox"
                        checked={feed.eventTypes.includes(ev)}
                        onChange={(e) =>
                          setFeed({
                            ...feed,
                            eventTypes: e.target.checked
                              ? [...new Set([...feed.eventTypes, ev])]
                              : feed.eventTypes.filter((x: string) => x !== ev),
                          })
                        }
                      />
                      {ev}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label>
                Polling fallback interval (seconds)
                <input
                  type="number"
                  min={30}
                  max={86400}
                  value={feed.pollingSeconds}
                  onChange={(e) => setFeed({ ...feed, pollingSeconds: Number(e.target.value) })}
                />
              </label>
              {feed.provider === "TWITCH" && (
                <div className="automationRow">
                  <label>
                    Title contains
                    <input
                      value={feed.config?.titleIncludes || ""}
                      onChange={(e) =>
                        setFeed({
                          ...feed,
                          config: { ...(feed.config || {}), titleIncludes: e.target.value },
                        })
                      }
                      placeholder="optional"
                    />
                  </label>
                  <label>
                    Game/category contains
                    <input
                      value={feed.config?.gameIncludes || ""}
                      onChange={(e) =>
                        setFeed({ ...feed, config: { ...(feed.config || {}), gameIncludes: e.target.value } })
                      }
                      placeholder="optional"
                    />
                  </label>
                </div>
              )}
              <fieldset>
                <legend>Discord presentation</legend>
                <label>
                  Message prefix
                  <input
                    value={feed.template?.messagePrefix || ""}
                    onChange={(e) =>
                      setFeed({
                        ...feed,
                        template: { ...(feed.template || {}), messagePrefix: e.target.value },
                      })
                    }
                    placeholder="Optional text above the card"
                  />
                </label>
                <label>
                  Title prefix
                  <input
                    value={feed.template?.titlePrefix || ""}
                    onChange={(e) =>
                      setFeed({
                        ...feed,
                        template: { ...(feed.template || {}), titlePrefix: e.target.value },
                      })
                    }
                    placeholder="Optional title prefix"
                  />
                </label>
                <div className="checkGrid">
                  <label className="toggleLine">
                    <input
                      type="checkbox"
                      checked={feed.template?.includeBody !== false}
                      onChange={(e) =>
                        setFeed({
                          ...feed,
                          template: { ...(feed.template || {}), includeBody: e.target.checked },
                        })
                      }
                    />{" "}
                    Copy post/video text
                  </label>
                  <label className="toggleLine">
                    <input
                      type="checkbox"
                      checked={feed.template?.includeMedia !== false}
                      onChange={(e) =>
                        setFeed({
                          ...feed,
                          template: { ...(feed.template || {}), includeMedia: e.target.checked },
                        })
                      }
                    />{" "}
                    Include media preview
                  </label>
                  <label className="toggleLine">
                    <input
                      type="checkbox"
                      checked={feed.template?.includeAuthor !== false}
                      onChange={(e) =>
                        setFeed({
                          ...feed,
                          template: { ...(feed.template || {}), includeAuthor: e.target.checked },
                        })
                      }
                    />{" "}
                    Show author
                  </label>
                  <label className="toggleLine">
                    <input
                      type="checkbox"
                      checked={feed.template?.includeLink !== false}
                      onChange={(e) =>
                        setFeed({
                          ...feed,
                          template: { ...(feed.template || {}), includeLink: e.target.checked },
                        })
                      }
                    />{" "}
                    Link original post
                  </label>
                </div>
                <label className="toggleLine">
                  <input
                    type="checkbox"
                    checked={feed.config?.autoPublish === true}
                    onChange={(e) =>
                      setFeed({ ...feed, config: { ...(feed.config || {}), autoPublish: e.target.checked } })
                    }
                  />{" "}
                  Auto-publish if destination is an Announcement channel
                </label>
              </fieldset>
              <label className="toggleLine">
                <input
                  type="checkbox"
                  checked={feed.enabled}
                  onChange={(e) => setFeed({ ...feed, enabled: e.target.checked })}
                />{" "}
                Enabled
              </label>
              <div className="buttonRow">
                <button disabled={busy || !feed.eventTypes.length} className="goldButton">
                  {feed.id ? "Update" : "Add"} feed
                </button>
                {feed.id && (
                  <button
                    type="button"
                    className="outlineButton"
                    onClick={() =>
                      setFeed({
                        ...feed,
                        id: undefined,
                        accountKey: undefined,
                        accountName: undefined,
                        accountUrl: undefined,
                        sourceInput: "",
                      })
                    }
                  >
                    New feed
                  </button>
                )}
              </div>
            </form>
            <div>
              <h4>Active Feeds</h4>
              <div className="automationCards socialCards">
                {data.feeds?.map((f: any) => (
                  <article key={f.id}>
                    <div className="providerBadge">{f.provider.slice(0, 1)}</div>
                    <div>
                      <b>{f.account_name || f.source_input}</b>
                      <small>
                        {f.provider} · {arr(f.event_types).join(", ")} → #
                        {channelName(ctx, f.target_channel_id)}
                      </small>
                      {f.last_error && <small className="errorText">{f.last_error}</small>}
                    </div>
                    <span className={f.enabled ? "autoState on" : "autoState"}>
                      {f.enabled ? "Live" : "Paused"}
                    </span>
                    <div className="cardActions">
                      <button onClick={() => void testFeed(f.id)}>Test</button>
                      {["YOUTUBE", "TWITCH"].includes(f.provider) && (
                        <button onClick={() => void subscribe(f.id)}>Webhook</button>
                      )}
                      <button onClick={() => editFeed(f)}>Edit</button>
                      <button
                        onClick={() => {
                          setFeed({
                            provider: f.provider,
                            sourceInput: f.source_input,
                            targetChannelId: f.target_channel_id,
                            mentionRoleId: f.mention_role_id,
                            enabled: Boolean(f.enabled),
                            eventTypes: arr(f.event_types),
                            pollingSeconds: Number(f.polling_seconds || 120),
                            config: f.config || {},
                            template: f.template || {},
                          });
                          setTab("social");
                          say("Feed copied. Save it to create a second configuration.");
                        }}
                      >
                        Duplicate
                      </button>
                      <button onClick={() => void del(`/api/internal/admin/social/feeds/${f.id}`)}>
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
                {!data.feeds?.length && <p className="uiEmpty">No social feeds configured.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {!voiceOnly && tab === "import" && (
        <div className="automationPane">
          <div className="importToolbar">
            <label>
              Feed
              <select
                value={importFeed}
                onChange={(e) => {
                  setImportFeed(e.target.value);
                  setImportItems([]);
                  setSelected(new Set());
                  setCursor(null);
                }}
              >
                {data.feeds?.map((f: any) => (
                  <option key={f.id} value={f.id}>
                    {f.provider} · {f.account_name || f.source_input}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="title">Title</option>
                <option value="views">Views</option>
                <option value="duration">Duration</option>
              </select>
            </label>
            <button
              className="goldButton"
              disabled={!importFeed || busy}
              onClick={() => void loadImport(false)}
            >
              Load first page
            </button>
            <button
              className="outlineButton"
              disabled={!importFeed || busy}
              onClick={() => void loadAllImport()}
            >
              Load all
            </button>
            <button
              className="outlineButton"
              disabled={!cursor || busy}
              onClick={() => void loadImport(true)}
            >
              Load more
            </button>
          </div>
          <div className="selectionBar">
            <span>
              {selected.size}/{importItems.length} selected
            </span>
            <button onClick={() => setSelected(new Set(importItems.map((x) => x.externalId)))}>
              Select all
            </button>
            <button onClick={() => setSelected(new Set())}>Deselect all</button>
            <button
              onClick={() =>
                setSelected(
                  new Set(importItems.filter((x) => !selected.has(x.externalId)).map((x) => x.externalId)),
                )
              }
            >
              Invert
            </button>
            <button
              className="goldButton"
              disabled={!selected.size || busy}
              onClick={() => void postSelected()}
            >
              Post selected to Discord
            </button>
          </div>
          <div className="importGrid">
            {sorted.map((x: any) => (
              <label
                key={x.externalId}
                className={selected.has(x.externalId) ? "importCard selected" : "importCard"}
              >
                <input
                  type="checkbox"
                  checked={selected.has(x.externalId)}
                  onChange={(e) =>
                    setSelected((s) => {
                      const n = new Set(s);
                      e.target.checked ? n.add(x.externalId) : n.delete(x.externalId);
                      return n;
                    })
                  }
                />
                {x.media?.[0]?.url ? (
                  <img src={x.media[0].url} alt="" />
                ) : (
                  <div className="importPlaceholder">{x.contentType?.slice(0, 1) || "•"}</div>
                )}
                <span>
                  <b>{x.title || x.body?.slice(0, 90) || x.externalId}</b>
                  <small>
                    {fmt(x.publishedAt)}
                    {x.meta?.views !== undefined ? ` · ${Number(x.meta.views).toLocaleString()} views` : ""}
                  </small>
                </span>
              </label>
            ))}
            {!importItems.length && (
              <p className="muted">
                Choose a feed and load its available history. YouTube and Twitch provide the richest archive
                browser.
              </p>
            )}
          </div>
        </div>
      )}

      {!voiceOnly && tab === "providers" && (
        <div className="automationPane">
          <div className="providerGrid">
            {PROVIDERS.map((p) => (
              <form key={p} className="providerCard" onSubmit={(e) => void saveCredential(p, e)}>
                <div className="providerHead">
                  <b>{p}</b>
                  <span className={data.providers?.[p]?.configured ? "autoState on" : "autoState"}>
                    {data.providers?.[p]?.configured ? "Configured" : "Needs credentials"}
                  </span>
                </div>
                {CREDENTIAL_FIELDS[p].map((f) => (
                  <label key={f.key}>
                    {f.label}
                    <input
                      type={f.secret ? "password" : "text"}
                      autoComplete="off"
                      value={creds[p]?.[f.key] || ""}
                      onChange={(e) =>
                        setCreds((c) => ({ ...c, [p]: { ...(c[p] || {}), [f.key]: e.target.value } }))
                      }
                      placeholder={
                        data.providers?.[p]?.configured
                          ? "Stored — leave blank unless replacing"
                          : f.placeholder || ""
                      }
                    />
                  </label>
                ))}
                <div className="buttonRow">
                  <button className="goldButton">Save securely</button>
                  {data.providers?.[p]?.configured && (
                    <button
                      type="button"
                      className="outlineButton"
                      onClick={async () => {
                        if (!confirm(`Remove stored ${p} credentials?`)) return;
                        const r = await api(`/api/internal/admin/social/credentials/${p}`, {
                          method: "DELETE",
                        });
                        say(r.ok ? `${p} credentials removed.` : `Remove failed (${r.status})`);
                        await refresh();
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <small className="muted">
                  Stored fields: {data.providers?.[p]?.fields?.join(", ") || "none"}
                </small>
              </form>
            ))}
          </div>
          <div className="providerHelp">
            <b>Webhook endpoints</b>
            <code>{`${browserOrigin}/api/webhooks/social/youtube`}</code>
            <code>{`${browserOrigin}/api/webhooks/social/twitch`}</code>
            <code>{`${browserOrigin}/api/webhooks/social/meta`}</code>
            <p>
              Credentials never return to the browser after save. YouTube/Twitch use push subscriptions when
              available and polling recovery; Meta providers use official authorized Graph access.
            </p>
          </div>
        </div>
      )}

      {!voiceOnly && tab === "history" && (
        <div className="automationPane">
          <div className="deliveryTable">
            <div className="deliveryHeader">
              <span>Status</span>
              <span>Provider</span>
              <span>Content</span>
              <span>Destination</span>
              <span>Attempts</span>
              <span>Last update</span>
            </div>
            {data.deliveries?.map((d: any) => (
              <div key={d.id} className={`deliveryRow status-${String(d.status).toLowerCase()}`}>
                <span>{d.status}</span>
                <span>{d.provider}</span>
                <span>
                  <b>{d.title || d.canonical_url || "Social item"}</b>
                  {d.last_error && <small className="errorText">{d.last_error}</small>}
                </span>
                <span>
                  #
                  {channelName(
                    ctx,
                    d.discord_channel_id ||
                      data.feeds?.find((f: any) => f.id === d.feed_id)?.target_channel_id,
                  )}
                </span>
                <span>{d.attempts || 0}</span>
                <span>{fmt(d.updated_at || d.created_at)}</span>
              </div>
            ))}
            {!data.deliveries?.length && <p className="uiEmpty">No deliveries have been attempted yet.</p>}
          </div>
        </div>
      )}
      {!voiceOnly && tab === "health" && (
        <div className="automationPane">
          <div className="healthCards">
            <article>
              <small>Active temp rooms</small>
              <b>{data.tempSessions?.length || 0}</b>
              <span>Join-to-Create sessions currently tracked</span>
            </article>
            <article>
              <small>Enabled social feeds</small>
              <b>{data.feeds?.filter((f: any) => f.enabled).length || 0}</b>
              <span>{data.feeds?.filter((f: any) => f.last_error).length || 0} feeds reporting an error</span>
            </article>
            <article>
              <small>Pending deliveries</small>
              <b>{data.deliveries?.filter((d: any) => d.status === "PENDING").length || 0}</b>
              <span>
                {data.deliveries?.filter((d: any) => d.status === "DEAD").length || 0} dead-letter items
              </span>
            </article>
            <article>
              <small>Configured providers</small>
              <b>
                {PROVIDERS.filter((p) => data.providers?.[p]?.configured).length}/{PROVIDERS.length}
              </b>
              <span>Official API credentials available</span>
            </article>
          </div>
          <div className="automationCards healthFeedList">
            {data.feeds?.map((f: any) => (
              <article key={f.id}>
                <div>
                  <b>
                    {f.provider} · {f.account_name || f.source_input}
                  </b>
                  <small>
                    Last check: {fmt(f.last_checked_at)} · Poll every {f.polling_seconds}s
                  </small>
                  {f.last_error && <small className="errorText">{f.last_error}</small>}
                </div>
                <span className={f.last_error ? "autoState" : "autoState on"}>
                  {f.last_error ? "Attention" : "Healthy"}
                </span>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
