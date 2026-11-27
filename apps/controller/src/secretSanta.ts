import {
  ActionRowBuilder,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Client,
} from "discord.js";
import { db, many, oneOrNone } from "@bom/db";
import { redis } from "@bom/redis";
import { sendBotDm } from "./dmDelivery.js";
import { deferInteractionReply, editInteractionReply } from "./interactionReply.js";

const guildId = process.env.DISCORD_GUILD_ID ?? "";
const dashAdminRoleId = (process.env.DASHBOARD_ADMIN_ROLE_ID ?? "").trim();

export const secretSantaCommands = [
  new SlashCommandBuilder()
    .setName("secret-santa")
    .setDescription("Join Secret Santa, edit your wishlist, or privately view your match"),
  new SlashCommandBuilder()
    .setName("secret-santa-admin")
    .setDescription("Manage BOM Christmas Secret Santa (Officers)")
    .addSubcommand((sc) =>
      sc
        .setName("publish")
        .setDescription("Post or refresh the Secret Santa signup card in a channel")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel for the Secret Santa card (defaults to configured channel)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((sc) => sc.setName("draw").setDescription("Draw Secret Santa matches and DM every Santa their recipient"))
    .addSubcommand((sc) => sc.setName("remind").setDescription("DM Santas who have not yet marked their gift as sent"))
    .addSubcommand((sc) => sc.setName("reveal").setDescription("Reveal Secret Santas and post the holiday recap")),
];

function dashboardUrl() {
  const base = (process.env.PUBLIC_DASHBOARD_URL ?? "").trim().replace(/\/$/, "");
  return base ? `${base}/dashboard/secret-santa` : "";
}

function isAdminInteraction(interaction: any): boolean {
  const perms = interaction.memberPermissions;
  if (perms?.has?.(PermissionFlagsBits.Administrator) || perms?.has?.(PermissionFlagsBits.ManageGuild)) return true;
  if (!dashAdminRoleId) return false;
  const roles = interaction.member?.roles;
  if (Array.isArray(roles)) return roles.includes(dashAdminRoleId);
  return Boolean(roles?.cache?.has?.(dashAdminRoleId));
}

function memberRoleIds(interaction: any): string[] {
  const roles = interaction.member?.roles;
  if (Array.isArray(roles)) return roles.map(String);
  if (roles?.cache) return [...roles.cache.keys()].map(String);
  return [];
}

function hasAllowedRole(userRoles: string[], allowedRoleIds: string[] | null | undefined): boolean {
  const allowed = (allowedRoleIds ?? []).map(String).filter(Boolean);
  if (!allowed.length) return true;
  const set = new Set(userRoles.map(String));
  return allowed.some((id) => set.has(id));
}

async function apiCall(path: string, userId: string, init: RequestInit = {}) {
  const base = (process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4100").replace(/\/$/, "");
  const headers = new Headers(init.headers);
  headers.set("x-internal-token", process.env.INTERNAL_API_TOKEN ?? "");
  headers.set("x-discord-user-id", userId);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const r = await fetch(`${base}/v1/secret-santa${path}`, { ...init, headers, signal: AbortSignal.timeout(20_000) });
  const text = await r.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text || `HTTP ${r.status}` };
  }
  if (!r.ok) throw Object.assign(new Error(body?.message ?? body?.error ?? `Request failed (${r.status})`), { status: r.status, body });
  return body;
}

async function activeEvent(eventId?: string) {
  if (eventId) return oneOrNone<any>(`SELECT * FROM secret_santa_events WHERE guild_id=$1 AND id=$2`, [guildId, eventId]);
  return oneOrNone<any>(
    `SELECT * FROM secret_santa_events
     WHERE guild_id=$1 AND status IN ('SIGNUPS_OPEN','MATCHED','REVEALED','DRAFT')
     ORDER BY CASE status WHEN 'SIGNUPS_OPEN' THEN 0 WHEN 'MATCHED' THEN 1 WHEN 'REVEALED' THEN 2 ELSE 3 END, created_at DESC
     LIMIT 1`,
    [guildId],
  );
}

function fmtDiscordTs(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const ms = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  if (!Number.isFinite(ms)) return "";
  const unix = Math.floor(ms / 1000);
  return `<t:${unix}:F> (<t:${unix}:R>)`;
}

function v2Card(accentColor: number, sections: string[], buttons: any[] = []) {
  const comps: any[] = [];
  let budget = 3850;
  for (const raw of sections) {
    if (!raw || budget <= 0) continue;
    const text = raw.length > budget ? `${raw.slice(0, Math.max(0, budget - 1))}…` : raw;
    comps.push({ type: 10, content: text });
    budget -= text.length;
  }
  if (buttons.length) {
    comps.push({ type: 14, divider: true, spacing: 1 });
    for (let i = 0; i < buttons.length; i += 5) {
      comps.push({ type: 1, components: buttons.slice(i, i + 5) });
    }
  }
  return [{ type: 17, accent_color: accentColor, components: comps }] as any;
}

async function buildEventPanel(event: any) {
  const countRow = await oneOrNone<any>(`SELECT COUNT(*)::int AS n FROM secret_santa_participants WHERE event_id=$1`, [event.id]);
  const agg = await oneOrNone<any>(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE gift_sent)::int AS sent, COUNT(*) FILTER (WHERE gift_received)::int AS received
     FROM secret_santa_assignments WHERE event_id=$1`,
    [event.id],
  );
  const participants = Number(countRow?.n ?? 0);
  const allowed: string[] = Array.isArray(event.allowed_role_ids) ? event.allowed_role_ids.map(String) : [];
  const statusLabel: Record<string, string> = {
    DRAFT: "Draft (not open yet)",
    SIGNUPS_OPEN: "Signups Open",
    MATCHED: "Matches Drawn — Secret Gifting Active",
    REVEALED: "Santas Revealed — Merry Christmas!",
    ARCHIVED: "Archived",
  };

  const lines = [
    `## 🎄 ${event.title}`,
    `**Status:** ${statusLabel[event.status] ?? event.status} · **Participants:** ${participants}`,
  ];
  if (event.description) lines.push(String(event.description).slice(0, 1200));
  const meta: string[] = [];
  if (event.budget_note) meta.push(`🎁 **Gift / Budget Rules:** ${event.budget_note}`);
  if (allowed.length) meta.push(`🛡️ **Eligible Roles:** ${allowed.map((id) => `<@&${id}>`).join(", ")}`);
  if (event.signup_closes_at && event.status === "SIGNUPS_OPEN") meta.push(`⏰ **Signups Close:** ${fmtDiscordTs(event.signup_closes_at)}`);
  if (event.gift_deadline_at) meta.push(`🎅 **Gift Deadline:** ${fmtDiscordTs(event.gift_deadline_at)}`);
  if (event.status === "MATCHED" || event.status === "REVEALED") {
    meta.push(`📦 **Progress:** ${Number(agg?.sent ?? 0)}/${Number(agg?.total ?? 0)} gifts sent · ${Number(agg?.received ?? 0)}/${Number(agg?.total ?? 0)} confirmed received`);
  }
  if (meta.length) lines.push(meta.join("\n"));
  lines.push(
    "-# Secret Santa is anonymous. Add or update your wishlist anytime so your Santa knows what you'd love! Even if your DMs are closed, click **View My Match** below or open the Dashboard.",
  );

  const buttons: any[] = [];
  if (event.status === "SIGNUPS_OPEN") {
    buttons.push({ type: 2, style: 3, label: "Join / Edit Wishlist", custom_id: `ss:join:${event.id}` });
    buttons.push({ type: 2, style: 4, label: "Leave Event", custom_id: `ss:leave:${event.id}` });
  } else if (event.status === "MATCHED") {
    buttons.push({ type: 2, style: 1, label: "View My Match & Wishlist", custom_id: `ss:match:${event.id}` });
    buttons.push({ type: 2, style: 2, label: "Edit My Wishlist", custom_id: `ss:join:${event.id}` });
    buttons.push({ type: 2, style: 3, label: "Mark Gift Sent", custom_id: `ss:sent:${event.id}` });
    buttons.push({ type: 2, style: 2, label: "Confirm Gift Received", custom_id: `ss:received:${event.id}` });
  } else if (event.status === "REVEALED") {
    buttons.push({ type: 2, style: 1, label: "View My Match", custom_id: `ss:match:${event.id}` });
  }
  const url = dashboardUrl();
  if (url) buttons.push({ type: 2, style: 5, label: "Open Dashboard", url });

  return v2Card(0xc82333, lines, buttons);
}

function wishlistModal(eventId: string, existing?: any) {
  const ign = new TextInputBuilder()
    .setCustomId("ign")
    .setLabel("In-Game Name (optional)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(80)
    .setPlaceholder("Your WoSB captain name");
  if (existing?.ign) ign.setValue(String(existing.ign).slice(0, 80));

  const wishlist = new TextInputBuilder()
    .setCustomId("wishlist")
    .setLabel("Your Wishlist (shown to your Secret Santa)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1500)
    .setPlaceholder("Ships, blueprints, upgrades, resources, or gift ideas you'd love!");
  if (existing?.wishlist) wishlist.setValue(String(existing.wishlist).slice(0, 1500));

  const avoid = new TextInputBuilder()
    .setCustomId("avoid")
    .setLabel("Already Own / Avoid (optional)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(600)
    .setPlaceholder("Items or ships you already have");
  if (existing?.avoid_list) avoid.setValue(String(existing.avoid_list).slice(0, 600));

  const notes = new TextInputBuilder()
    .setCustomId("notes")
    .setLabel("Delivery / Extra Notes (optional)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(600)
    .setPlaceholder("Best times online, port, or fun notes for your Santa");
  if (existing?.notes) notes.setValue(String(existing.notes).slice(0, 600));

  return new ModalBuilder()
    .setCustomId(`ss:modal:${eventId}`)
    .setTitle("BOM Secret Santa Wishlist")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(ign),
      new ActionRowBuilder<TextInputBuilder>().addComponents(wishlist),
      new ActionRowBuilder<TextInputBuilder>().addComponents(avoid),
      new ActionRowBuilder<TextInputBuilder>().addComponents(notes),
    );
}

function formatMatchSections(event: any, match: any, incoming?: any): string[] {
  const lines = [
    `## 🎅 Your Secret Santa Match — ${event.title}`,
    `You are the Secret Santa for **${match.display_name}** (<@${match.recipient_id}>)!`,
  ];
  if (match.ign) lines.push(`⚓ **In-Game Name:** ${match.ign}`);
  lines.push(`🎁 **Their Wishlist:**\n${match.wishlist ? match.wishlist : "_No wishlist entered yet — check back soon!_"}`);
  if (match.avoid_list) lines.push(`🚫 **Avoid / Already Own:** ${match.avoid_list}`);
  if (match.notes) lines.push(`📝 **Notes:** ${match.notes}`);
  if (event.budget_note) lines.push(`💰 **Event Rules / Budget:** ${event.budget_note}`);
  if (event.gift_deadline_at) lines.push(`⏰ **Gift Deadline:** ${fmtDiscordTs(event.gift_deadline_at)}`);

  const statusParts: string[] = [
    match.gift_sent ? "✅ You marked your gift as **Sent**" : "⏳ You have **not** marked your gift as sent yet",
    match.gift_received ? "🎉 Your recipient confirmed **Received**" : "",
  ].filter(Boolean);
  if (incoming) {
    statusParts.push(
      incoming.gift_received
        ? "🎄 You confirmed your incoming gift **Received**"
        : incoming.gift_sent
          ? "📬 Your Secret Santa marked your gift as **Sent**!"
          : "❄️ Your Secret Santa is still preparing your gift",
    );
    if (event.status === "REVEALED" && incoming.revealed_giver_name) {
      statusParts.push(`🎁 **Your Secret Santa was:** ${incoming.revealed_giver_name}`);
    }
  }
  lines.push(statusParts.join("\n"));
  lines.push("-# Keep it secret until Reveal Day! Your recipient cannot see who their Santa is.");
  return lines;
}

export async function publishSecretSantaPanel(client: Client, eventId: string, overrideChannelId?: string | null) {
  const event = await activeEvent(eventId);
  if (!event) return false;
  const channelId = overrideChannelId || event.channel_id;
  if (!channelId) return false;
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  const channel: any = guild ? await guild.channels.fetch(channelId).catch(() => null) : null;
  if (!channel?.isTextBased?.()) return false;

  const components = await buildEventPanel(event);
  if (event.message_id && event.channel_id === channelId) {
    try {
      const existing = await channel.messages.fetch(event.message_id);
      await existing.edit({ flags: MessageFlags.IsComponentsV2, components, allowedMentions: { parse: [] } });
      return true;
    } catch {
      // Message was deleted or uneditable; post a fresh panel below.
    }
  }
  const sent = await channel.send({ flags: MessageFlags.IsComponentsV2, components, allowedMentions: { parse: [] } });
  await db.query(`UPDATE secret_santa_events SET channel_id=$2, message_id=$3, updated_at=NOW() WHERE id=$1`, [event.id, channelId, sent.id]);
  return true;
}

async function sendSecretSantaDm(client: Client, userId: string, payload: any): Promise<{ ok: boolean; code?: string | number; error?: string }> {
  try {
    const user = await client.users.fetch(String(userId));
    await sendBotDm(user, payload);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, code: err?.code, error: err?.message ?? String(err) };
  }
}

async function dispatchPendingMatchDms(client: Client, eventId?: string) {
  const rows = await many<any>(
    `SELECT a.event_id, a.giver_id, a.recipient_id, a.gift_sent, a.gift_received,
            e.title, e.budget_note, e.gift_deadline_at, e.status,
            p.display_name, p.ign, p.wishlist, p.avoid_list, p.notes
     FROM secret_santa_assignments a
     JOIN secret_santa_events e ON e.id = a.event_id
     JOIN secret_santa_participants p ON p.event_id = a.event_id AND p.user_id = a.recipient_id
     WHERE e.guild_id=$1 AND e.status='MATCHED'
       AND a.dm_delivered_at IS NULL AND a.dm_last_error IS NULL
       ${eventId ? "AND a.event_id=$2" : ""}
     LIMIT 30`,
    eventId ? [guildId, eventId] : [guildId],
  );
  const url = dashboardUrl();
  for (const r of rows) {
    const sections = formatMatchSections(r, r);
    const buttons: any[] = [
      { type: 2, style: 3, label: "Mark Gift Sent", custom_id: `ss:sent:${r.event_id}` },
    ];
    if (url) buttons.push({ type: 2, style: 5, label: "Open Secret Santa Dashboard", url });
    const res = await sendSecretSantaDm(client, String(r.giver_id), {
      flags: MessageFlags.IsComponentsV2,
      components: v2Card(0xc82333, sections, buttons),
      allowedMentions: { parse: [] },
    });
    if (res.ok) {
      await db.query(
        `UPDATE secret_santa_assignments SET dm_delivered_at=NOW(), dm_last_error=NULL, wishlist_notified_at=NOW() WHERE event_id=$1 AND giver_id=$2`,
        [r.event_id, r.giver_id],
      );
    } else {
      await db.query(
        `UPDATE secret_santa_assignments SET dm_last_error=$3 WHERE event_id=$1 AND giver_id=$2`,
        [r.event_id, r.giver_id, String(res.code ?? res.error ?? "dm_failed").slice(0, 120)],
      );
    }
  }
}

async function dispatchWishlistUpdateDms(client: Client, eventId?: string) {
  const rows = await many<any>(
    `SELECT a.event_id, a.giver_id, a.recipient_id,
            e.title, p.display_name, p.ign, p.wishlist, p.avoid_list, p.notes
     FROM secret_santa_assignments a
     JOIN secret_santa_events e ON e.id = a.event_id
     JOIN secret_santa_participants p ON p.event_id = a.event_id AND p.user_id = a.recipient_id
     WHERE e.guild_id=$1 AND e.status='MATCHED'
       AND a.dm_delivered_at IS NOT NULL
       AND p.updated_at > COALESCE(a.wishlist_notified_at, to_timestamp(0))
       ${eventId ? "AND a.event_id=$2" : ""}
     LIMIT 30`,
    eventId ? [guildId, eventId] : [guildId],
  );
  const url = dashboardUrl();
  for (const r of rows) {
    const sections = [
      `## 🎄 Wishlist Updated — ${r.title}`,
      `Your Secret Santa recipient **${r.display_name}** updated their wishlist!`,
      r.ign ? `⚓ **In-Game Name:** ${r.ign}` : "",
      `🎁 **Updated Wishlist:**\n${r.wishlist}`,
      r.avoid_list ? `🚫 **Avoid / Already Own:** ${r.avoid_list}` : "",
      r.notes ? `📝 **Notes:** ${r.notes}` : "",
    ].filter(Boolean);
    const buttons = url ? [{ type: 2, style: 5, label: "View on Dashboard", url }] : [];
    await sendSecretSantaDm(client, String(r.giver_id), {
      flags: MessageFlags.IsComponentsV2,
      components: v2Card(0x1f7a4c, sections, buttons),
      allowedMentions: { parse: [] },
    }).catch(() => {});
    await db.query(
      `UPDATE secret_santa_assignments SET wishlist_notified_at=NOW() WHERE event_id=$1 AND giver_id=$2`,
      [r.event_id, r.giver_id],
    );
  }
}

async function sendGiftReminders(client: Client, eventId: string) {
  const rows = await many<any>(
    `SELECT a.event_id, a.giver_id, e.title, e.gift_deadline_at, p.display_name
     FROM secret_santa_assignments a
     JOIN secret_santa_events e ON e.id=a.event_id
     JOIN secret_santa_participants p ON p.event_id=a.event_id AND p.user_id=a.recipient_id
     WHERE e.guild_id=$1 AND a.event_id=$2 AND e.status='MATCHED' AND a.gift_sent=FALSE`,
    [guildId, eventId],
  );
  const url = dashboardUrl();
  let sent = 0;
  for (const r of rows) {
    const sections = [
      `## 🎅 Secret Santa Reminder — ${r.title}`,
      `Friendly reminder from Jolly Misfit: you haven't marked your gift for **${r.display_name}** as sent yet!`,
      r.gift_deadline_at ? `⏰ **Gift Deadline:** ${fmtDiscordTs(r.gift_deadline_at)}` : "",
      `Click **Mark Gift Sent** once you've delivered it, or check their wishlist on the Dashboard.`,
    ].filter(Boolean);
    const buttons: any[] = [{ type: 2, style: 3, label: "Mark Gift Sent", custom_id: `ss:sent:${r.event_id}` }];
    if (url) buttons.push({ type: 2, style: 5, label: "Open Dashboard", url });
    const res = await sendSecretSantaDm(client, String(r.giver_id), {
      flags: MessageFlags.IsComponentsV2,
      components: v2Card(0xd8ad44, sections, buttons),
      allowedMentions: { parse: [] },
    });
    if (res.ok) sent++;
    await db.query(`UPDATE secret_santa_assignments SET last_reminded_at=NOW() WHERE event_id=$1 AND giver_id=$2`, [r.event_id, r.giver_id]);
  }
  return { total: rows.length, sent };
}

async function postRevealAnnouncement(client: Client, eventId: string) {
  const event = await activeEvent(eventId);
  if (!event) return;
  await publishSecretSantaPanel(client, event.id);
  if (!event.channel_id) return;
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  const channel: any = guild ? await guild.channels.fetch(event.channel_id).catch(() => null) : null;
  if (!channel?.isTextBased?.()) return;
  const rows = await many<any>(
    `SELECT a.giver_id, g.display_name AS giver_name, a.recipient_id, r.display_name AS recipient_name
     FROM secret_santa_assignments a
     JOIN secret_santa_participants g ON g.event_id=a.event_id AND g.user_id=a.giver_id
     JOIN secret_santa_participants r ON r.event_id=a.event_id AND r.user_id=a.recipient_id
     WHERE a.event_id=$1 ORDER BY LOWER(g.display_name)`,
    [event.id],
  );
  const lines = rows.map((r: any) => `• 🎅 **${r.giver_name}** → 🎁 **${r.recipient_name}**`);
  const chunks: string[] = [];
  let cur = "";
  for (const line of lines) {
    if ((cur + "\n" + line).length > 3200) {
      chunks.push(cur);
      cur = line;
    } else cur = cur ? `${cur}\n${line}` : line;
  }
  if (cur) chunks.push(cur);
  for (let i = 0; i < chunks.length; i++) {
    const header = i === 0 ? `## 🎄 ${event.title} — The Big Reveal!` : `### 🎄 ${event.title} (continued)`;
    await channel.send({
      flags: MessageFlags.IsComponentsV2,
      components: v2Card(0x1f7a4c, [header, chunks[i], i === chunks.length - 1 ? "-# Merry Christmas from Band of Misfits & Jolly Misfit!" : ""].filter(Boolean)),
      allowedMentions: { parse: [] },
    }).catch(() => {});
  }
}

export function installSecretSanta(client: Client) {
  const sub = redis.duplicate();
  void sub.subscribe("secret-santa:control", "secret-santa:notify").catch(() => {});
  sub.on("message", (channel: string, raw: string) => {
    void (async () => {
      let msg: any;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (String(msg?.guildId) !== guildId) return;
      if (channel === "secret-santa:control") {
        const action = String(msg.action ?? "");
        const eventId = String(msg.eventId ?? "");
        if (!eventId) return;
        if (action === "panel") await publishSecretSantaPanel(client, eventId);
        else if (action === "dispatch-matches") {
          await publishSecretSantaPanel(client, eventId);
          await dispatchPendingMatchDms(client, eventId);
        } else if (action === "wishlist-updated") {
          await dispatchWishlistUpdateDms(client, eventId);
        } else if (action === "remind") {
          await sendGiftReminders(client, eventId);
        } else if (action === "reveal") {
          await postRevealAnnouncement(client, eventId);
        }
      } else if (channel === "secret-santa:notify") {
        const url = dashboardUrl();
        const buttons = url ? [{ type: 2, style: 5, label: "Open Secret Santa", url }] : [];
        if (msg.kind === "gift_sent" && msg.recipientId) {
          await sendSecretSantaDm(client, String(msg.recipientId), {
            flags: MessageFlags.IsComponentsV2,
            components: v2Card(
              0x1f7a4c,
              [
                "## 🎁 Your Secret Santa Sent Your Gift!",
                msg.note ? `📝 **Note from your Santa:** ${String(msg.note).slice(0, 300)}` : "Keep an eye out — your gift is on the way!",
                "Once you receive it, click **Confirm Gift Received** on the Secret Santa card or Dashboard.",
              ],
              [{ type: 2, style: 3, label: "Confirm Gift Received", custom_id: `ss:received:${msg.eventId}` }, ...buttons],
            ),
            allowedMentions: { parse: [] },
          }).catch(() => {});
        } else if (msg.kind === "gift_received" && msg.giverId) {
          await sendSecretSantaDm(client, String(msg.giverId), {
            flags: MessageFlags.IsComponentsV2,
            components: v2Card(
              0xd8ad44,
              ["## 🎉 Gift Confirmed Received!", "Your Secret Santa recipient confirmed they received your gift. Merry Christmas!"],
              buttons,
            ),
            allowedMentions: { parse: [] },
          }).catch(() => {});
        }
      }
    })().catch((e) => console.warn("[secret-santa] control event failed", e));
  });

  // Periodic sweep guarantees pending DMs and wishlist updates still deliver after restarts.
  const timer = setInterval(() => {
    if (!client.isReady()) return;
    void dispatchPendingMatchDms(client).catch(() => {});
    void dispatchWishlistUpdateDms(client).catch(() => {});
  }, 60_000);
  timer.unref?.();
}

export async function handleSecretSantaInteraction(interaction: any, client: Client): Promise<boolean> {
  // /secret-santa
  if (interaction.isChatInputCommand() && interaction.commandName === "secret-santa") {
    await deferInteractionReply(interaction, { flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
    const event = await activeEvent();
    if (!event || event.status === "DRAFT") {
      await editInteractionReply(interaction, {
        components: v2Card(0xc82333, ["## 🎄 BOM Christmas Secret Santa", "No Secret Santa event is open right now. Check back soon!"]),
      });
      return true;
    }
    const allowed: string[] = Array.isArray(event.allowed_role_ids) ? event.allowed_role_ids.map(String) : [];
    const eligible = hasAllowedRole(memberRoleIds(interaction), allowed);
    const me = await oneOrNone<any>(`SELECT * FROM secret_santa_participants WHERE event_id=$1 AND user_id=$2`, [event.id, interaction.user.id]);
    const match = await oneOrNone<any>(
      `SELECT a.recipient_id, a.gift_sent, a.gift_received, p.display_name, p.ign, p.wishlist, p.avoid_list, p.notes
       FROM secret_santa_assignments a
       JOIN secret_santa_participants p ON p.event_id=a.event_id AND p.user_id=a.recipient_id
       WHERE a.event_id=$1 AND a.giver_id=$2`,
      [event.id, interaction.user.id],
    );
    const incoming = await oneOrNone<any>(
      `SELECT a.gift_sent, a.gift_received, CASE WHEN $3='REVEALED' THEN p.display_name ELSE NULL END AS revealed_giver_name
       FROM secret_santa_assignments a
       JOIN secret_santa_participants p ON p.event_id=a.event_id AND p.user_id=a.giver_id
       WHERE a.event_id=$1 AND a.recipient_id=$2`,
      [event.id, interaction.user.id, event.status],
    );

    const url = dashboardUrl();
    if (match) {
      const buttons: any[] = [];
      if (event.status === "MATCHED") {
        buttons.push({ type: 2, style: 2, label: "Edit My Wishlist", custom_id: `ss:join:${event.id}` });
        if (!match.gift_sent) buttons.push({ type: 2, style: 3, label: "Mark Gift Sent", custom_id: `ss:sent:${event.id}` });
        if (incoming && !incoming.gift_received) buttons.push({ type: 2, style: 2, label: "Confirm Gift Received", custom_id: `ss:received:${event.id}` });
      }
      if (url) buttons.push({ type: 2, style: 5, label: "Open Dashboard", url });
      await editInteractionReply(interaction, { components: v2Card(0xc82333, formatMatchSections(event, match, incoming), buttons) });
      return true;
    }

    const sections = [`## 🎄 ${event.title}`];
    if (!eligible && !me) {
      sections.push(`This Secret Santa is open to members with: ${allowed.map((id) => `<@&${id}>`).join(", ")}.`);
    } else if (me) {
      sections.push("✅ **You're signed up!**", `🎁 **Your Wishlist:**\n${me.wishlist || "_Not filled out yet_"}`);
      if (me.ign) sections.push(`⚓ **IGN:** ${me.ign}`);
      if (me.avoid_list) sections.push(`🚫 **Avoid:** ${me.avoid_list}`);
      if (event.status === "SIGNUPS_OPEN") sections.push("Matches haven't been drawn yet — you can edit your wishlist anytime.");
    } else if (event.status === "SIGNUPS_OPEN") {
      sections.push("Signups are open! Click **Join / Edit Wishlist** to enter and share your wishlist with your future Secret Santa.");
    } else {
      sections.push("Signups for this Secret Santa have already closed.");
    }
    const buttons: any[] = [];
    if (event.status === "SIGNUPS_OPEN" && (eligible || me)) {
      buttons.push({ type: 2, style: 3, label: me ? "Edit My Wishlist" : "Join Secret Santa", custom_id: `ss:join:${event.id}` });
      if (me) buttons.push({ type: 2, style: 4, label: "Leave Event", custom_id: `ss:leave:${event.id}` });
    }
    if (url) buttons.push({ type: 2, style: 5, label: "Open Dashboard", url });
    await editInteractionReply(interaction, { components: v2Card(0xc82333, sections, buttons) });
    return true;
  }

  // /secret-santa-admin
  if (interaction.isChatInputCommand() && interaction.commandName === "secret-santa-admin") {
    await deferInteractionReply(interaction, { flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
    if (!isAdminInteraction(interaction)) {
      await editInteractionReply(interaction, {
        components: v2Card(0xc82333, ["### Permission denied", "Only Officers / Dashboard Administrators can manage Secret Santa."]),
      });
      return true;
    }
    const sub = interaction.options.getSubcommand();
    const event = await activeEvent();
    if (!event) {
      const url = dashboardUrl();
      await editInteractionReply(interaction, {
        components: v2Card(
          0xc82333,
          ["### No Secret Santa event yet", "Create a Secret Santa event in the Dashboard first, configure the eligible Discord roles, then publish it here."],
          url ? [{ type: 2, style: 5, label: "Open Secret Santa Dashboard", url }] : [],
        ),
      });
      return true;
    }
    try {
      if (sub === "publish") {
        const ch = interaction.options.getChannel("channel");
        const targetId = ch?.id ?? event.channel_id ?? interaction.channelId;
        const ok = await publishSecretSantaPanel(client, event.id, targetId);
        await editInteractionReply(interaction, {
          components: v2Card(0x1f7a4c, [ok ? `### 🎄 Secret Santa card posted in <#${targetId}>` : "### Could not post card", ok ? "Members with the configured role(s) can now sign up and submit wishlists directly from Discord or the Dashboard." : "Check my Send Messages / Embed permissions in that channel."]),
        });
      } else if (sub === "draw") {
        const res = await apiCall(`/admin/events/${event.id}/match`, interaction.user.id, { method: "POST" });
        await editInteractionReply(interaction, {
          components: v2Card(0x1f7a4c, [`### 🎅 Matches drawn for ${res.matched} participants!`, "Jolly Misfit is delivering match DMs now. Anyone with closed DMs can click **View My Match & Wishlist** on the channel card or open the Dashboard."]),
        });
      } else if (sub === "remind") {
        const res = await sendGiftReminders(client, event.id);
        await editInteractionReply(interaction, {
          components: v2Card(0xd8ad44, [`### 🔔 Reminders sent`, `Delivered ${res.sent}/${res.total} reminder DMs to Santas who haven't marked their gift sent yet.`]),
        });
      } else if (sub === "reveal") {
        await apiCall(`/admin/events/${event.id}/reveal`, interaction.user.id, { method: "POST" });
        await editInteractionReply(interaction, {
          components: v2Card(0x1f7a4c, ["### 🎄 Secret Santas Revealed!", "The festive reveal recap has been posted to the event channel and unlocked on the Dashboard."]),
        });
      }
    } catch (err: any) {
      await editInteractionReply(interaction, {
        components: v2Card(0xc82333, ["### Secret Santa Action Failed", String(err?.message ?? err).slice(0, 1500)]),
      });
    }
    return true;
  }

  // Buttons: ss:join / ss:match / ss:sent / ss:received / ss:leave
  if (interaction.isButton() && interaction.customId.startsWith("ss:")) {
    const [, action, eventId] = interaction.customId.split(":");
    if (!eventId) return false;

    if (action === "join") {
      const event = await activeEvent(eventId);
      if (!event) {
        await deferInteractionReply(interaction, { flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
        await editInteractionReply(interaction, { components: v2Card(0xc82333, ["### Event not found", "That Secret Santa event is no longer active."]) });
        return true;
      }
      const existing = await oneOrNone<any>(`SELECT * FROM secret_santa_participants WHERE event_id=$1 AND user_id=$2`, [event.id, interaction.user.id]);
      if (!existing) {
        if (event.status !== "SIGNUPS_OPEN") {
          await deferInteractionReply(interaction, { flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
          await editInteractionReply(interaction, { components: v2Card(0xc82333, ["### Signups Closed", "Signups for this Secret Santa are already closed."]) });
          return true;
        }
        const allowed: string[] = Array.isArray(event.allowed_role_ids) ? event.allowed_role_ids.map(String) : [];
        if (!hasAllowedRole(memberRoleIds(interaction), allowed)) {
          await deferInteractionReply(interaction, { flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
          await editInteractionReply(interaction, {
            components: v2Card(0xc82333, [
              "### Role Required",
              `This Secret Santa is open to members with: ${allowed.map((id) => `<@&${id}>`).join(", ")}.`,
            ]),
          });
          return true;
        }
      } else if (!["SIGNUPS_OPEN", "MATCHED"].includes(event.status)) {
        await deferInteractionReply(interaction, { flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
        await editInteractionReply(interaction, { components: v2Card(0xc82333, ["### Event Locked", "Wishlists can no longer be edited after reveal."]) });
        return true;
      }
      await interaction.showModal(wishlistModal(event.id, existing));
      return true;
    }

    await deferInteractionReply(interaction, { flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
    const event = await activeEvent(eventId);
    if (!event) {
      await editInteractionReply(interaction, { components: v2Card(0xc82333, ["### Event not found"]) });
      return true;
    }

    if (action === "match") {
      const match = await oneOrNone<any>(
        `SELECT a.recipient_id, a.gift_sent, a.gift_received, p.display_name, p.ign, p.wishlist, p.avoid_list, p.notes
         FROM secret_santa_assignments a
         JOIN secret_santa_participants p ON p.event_id=a.event_id AND p.user_id=a.recipient_id
         WHERE a.event_id=$1 AND a.giver_id=$2`,
        [event.id, interaction.user.id],
      );
      const incoming = await oneOrNone<any>(
        `SELECT a.gift_sent, a.gift_received, CASE WHEN $3='REVEALED' THEN p.display_name ELSE NULL END AS revealed_giver_name
         FROM secret_santa_assignments a
         JOIN secret_santa_participants p ON p.event_id=a.event_id AND p.user_id=a.giver_id
         WHERE a.event_id=$1 AND a.recipient_id=$2`,
        [event.id, interaction.user.id, event.status],
      );
      if (!match) {
        await editInteractionReply(interaction, {
          components: v2Card(0xc82333, ["### No Match Found", "You are not currently matched in this Secret Santa event."]),
        });
        return true;
      }
      const url = dashboardUrl();
      const buttons: any[] = [];
      if (event.status === "MATCHED" && !match.gift_sent) {
        buttons.push({ type: 2, style: 3, label: "Mark Gift Sent", custom_id: `ss:sent:${event.id}` });
      }
      if (url) buttons.push({ type: 2, style: 5, label: "Open Dashboard", url });
      await editInteractionReply(interaction, { components: v2Card(0xc82333, formatMatchSections(event, match, incoming), buttons) });
      return true;
    }

    if (action === "sent") {
      try {
        await apiCall(`/${event.id}/gift-sent`, interaction.user.id, { method: "POST", body: JSON.stringify({ note: "" }) });
        await editInteractionReply(interaction, {
          components: v2Card(0x1f7a4c, ["### 🎁 Gift Marked as Sent!", "Your recipient has been notified anonymously that their gift is on the way. Merry Christmas!"]),
        });
      } catch (err: any) {
        await editInteractionReply(interaction, { components: v2Card(0xc82333, ["### Could not update", String(err?.message ?? err)]) });
      }
      return true;
    }

    if (action === "received") {
      try {
        await apiCall(`/${event.id}/gift-received`, interaction.user.id, { method: "POST" });
        await editInteractionReply(interaction, {
          components: v2Card(0x1f7a4c, ["### 🎉 Gift Confirmed Received!", "Your Secret Santa has been notified. Hope you enjoy it — Merry Christmas!"]),
        });
      } catch (err: any) {
        await editInteractionReply(interaction, { components: v2Card(0xc82333, ["### Could not update", String(err?.message ?? err)]) });
      }
      return true;
    }

    if (action === "leave") {
      try {
        await apiCall(`/${event.id}/signup`, interaction.user.id, { method: "DELETE" });
        await editInteractionReply(interaction, {
          components: v2Card(0x6b7280, ["### Removed from Secret Santa", "You have left this Secret Santa before matching. You can rejoin anytime while signups are open."]),
        });
      } catch (err: any) {
        await editInteractionReply(interaction, { components: v2Card(0xc82333, ["### Could not leave", String(err?.message ?? err)]) });
      }
      return true;
    }
    return false;
  }

  // Modal submit: ss:modal:<eventId>
  if (interaction.isModalSubmit() && interaction.customId.startsWith("ss:modal:")) {
    const eventId = interaction.customId.split(":").at(-1)!;
    await deferInteractionReply(interaction, { flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
    const ign = interaction.fields.getTextInputValue("ign").trim();
    const wishlist = interaction.fields.getTextInputValue("wishlist").trim();
    const avoidList = interaction.fields.getTextInputValue("avoid").trim();
    const notes = interaction.fields.getTextInputValue("notes").trim();
    try {
      const res = await apiCall(`/${eventId}/signup`, interaction.user.id, {
        method: "POST",
        body: JSON.stringify({ ign, wishlist, avoidList, notes }),
      });
      const url = dashboardUrl();
      await editInteractionReply(interaction, {
        components: v2Card(
          0x1f7a4c,
          [
            res.joined ? "### 🎄 You're in BOM Secret Santa!" : "### 🎄 Wishlist Updated!",
            "Your wishlist has been saved securely so your Secret Santa can see it (while staying completely anonymous to you).",
            `🎁 **Wishlist:**\n${wishlist}`,
          ],
          url ? [{ type: 2, style: 5, label: "Open Secret Santa Dashboard", url }] : [],
        ),
      });
    } catch (err: any) {
      await editInteractionReply(interaction, {
        components: v2Card(0xc82333, ["### Could not save wishlist", String(err?.message ?? err).slice(0, 1500)]),
      });
    }
    return true;
  }

  return false;
}
