import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, many, oneOrNone, pool } from "@bom/db";
import { redis } from "@bom/redis";
import { discordAccess, discordContext, hasDashboardAdminAccess } from "./authz.js";
import { sentinelRecord } from "./sentinel.js";
import { hasAllowedSecretSantaRole, solveSecretSantaMatching } from "./secretSantaMatch.js";

export { hasAllowedSecretSantaRole, solveSecretSantaMatching };
export type SecretSantaStatus = "DRAFT" | "SIGNUPS_OPEN" | "MATCHED" | "REVEALED" | "ARCHIVED";

const createEventSchema = z.object({
  title: z.string().trim().min(2).max(120).default("BOM Christmas Secret Santa"),
  description: z.string().trim().max(2000).default(""),
  budgetNote: z.string().trim().max(400).default(""),
  allowedRoleIds: z.array(z.string().regex(/^\d{5,25}$/)).max(50).default([]),
  signupClosesAt: z.string().datetime().nullable().optional(),
  giftDeadlineAt: z.string().datetime().nullable().optional(),
  channelId: z.string().regex(/^\d{5,25}$/).nullable().optional(),
  status: z.enum(["DRAFT", "SIGNUPS_OPEN"]).default("SIGNUPS_OPEN"),
});

const updateEventSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  budgetNote: z.string().trim().max(400).optional(),
  allowedRoleIds: z.array(z.string().regex(/^\d{5,25}$/)).max(50).optional(),
  signupClosesAt: z.string().datetime().nullable().optional(),
  giftDeadlineAt: z.string().datetime().nullable().optional(),
  channelId: z.string().regex(/^\d{5,25}$/).nullable().optional(),
  status: z.enum(["DRAFT", "SIGNUPS_OPEN", "ARCHIVED"]).optional(),
});

const signupSchema = z.object({
  ign: z.string().trim().max(80).default(""),
  wishlist: z.string().trim().min(2, "Add at least a short wishlist so your Secret Santa knows what to get you.").max(1500),
  avoidList: z.string().trim().max(600).default(""),
  notes: z.string().trim().max(600).default(""),
  backupElf: z.boolean().default(false),
});

async function notifyController(guildId: string, action: string, eventId: string) {
  await redis.publish("secret-santa:control", JSON.stringify({ guildId, action, eventId, at: Date.now() })).catch(() => {});
  await redis.set(`secret-santa:trigger:${guildId}:${action}:${eventId}`, String(Date.now()), "EX", 3600).catch(() => {});
}

async function resolveDisplayName(uid: string): Promise<string> {
  try {
    const access = await discordAccess(uid);
    return String(access.displayName || access.username || uid).slice(0, 80);
  } catch {
    return uid;
  }
}

export function registerSecretSantaRoutes(
  app: any,
  opts: { guildId: string; requireAdmin: any; userId: (req: any) => string },
) {
  const { guildId, requireAdmin, userId } = opts;

  async function requireGuildUser(req: any, reply: any) {
    const uid = userId(req);
    if (!uid) {
      reply.code(401).send({ error: "unauthenticated" });
      return null;
    }
    const access = await discordAccess(uid);
    if (!access.member) {
      reply.code(403).send({ error: "not_a_member", message: "You must be a member of the Discord server." });
      return null;
    }
    return { uid, access, admin: await hasDashboardAdminAccess(uid) };
  }

  async function activeEventForMember(eventId?: string) {
    if (eventId) {
      return oneOrNone<any>(`SELECT * FROM secret_santa_events WHERE guild_id=$1 AND id=$2`, [guildId, eventId]);
    }
    return oneOrNone<any>(
      `SELECT * FROM secret_santa_events
       WHERE guild_id=$1 AND status IN ('SIGNUPS_OPEN','MATCHED','REVEALED')
       ORDER BY CASE status WHEN 'SIGNUPS_OPEN' THEN 0 WHEN 'MATCHED' THEN 1 ELSE 2 END, created_at DESC
       LIMIT 1`,
      [guildId],
    );
  }

  // Member overview: active event, role eligibility, own wishlist, anonymous match + recipient wishlist.
  app.get("/v1/secret-santa/current", async (req: any, reply: any) => {
    const ctx = await requireGuildUser(req, reply);
    if (!ctx) return;
    const { uid, access, admin } = ctx;
    const event = await activeEventForMember();
    const dCtx = await discordContext().catch(() => ({ roles: [] as any[], textChannels: [] as any[] }));
    const roleMap = new Map<string, string>((dCtx.roles ?? []).map((r: any) => [String(r.id), String(r.name)]));

    if (!event) {
      return { event: null, eligible: admin, admin, requiredRoles: [], participant: null, match: null, incoming: null, participants: [], reveal: null };
    }

    const allowedRoleIds: string[] = Array.isArray(event.allowed_role_ids) ? event.allowed_role_ids.map(String) : [];
    const eligible = hasAllowedSecretSantaRole(access.roles, allowedRoleIds);
    const requiredRoles = allowedRoleIds.map((id) => ({ id, name: roleMap.get(id) ?? id }));

    const [me, participants, myOutgoing, myIncoming] = await Promise.all([
      oneOrNone<any>(`SELECT * FROM secret_santa_participants WHERE event_id=$1 AND user_id=$2`, [event.id, uid]),
      many<any>(
        `SELECT user_id, display_name, backup_elf, joined_at, (LENGTH(TRIM(wishlist)) > 0) AS has_wishlist
         FROM secret_santa_participants WHERE event_id=$1 ORDER BY LOWER(display_name), joined_at`,
        [event.id],
      ),
      oneOrNone<any>(
        `SELECT a.recipient_id, a.gift_sent, a.gift_sent_at, a.gift_sent_note, a.gift_received, a.gift_received_at,
                p.display_name, p.ign, p.wishlist, p.avoid_list, p.notes, p.updated_at AS wishlist_updated_at
         FROM secret_santa_assignments a
         JOIN secret_santa_participants p ON p.event_id = a.event_id AND p.user_id = a.recipient_id
         WHERE a.event_id=$1 AND a.giver_id=$2`,
        [event.id, uid],
      ),
      oneOrNone<any>(
        `SELECT a.gift_sent, a.gift_sent_at, a.gift_sent_note, a.gift_received, a.gift_received_at,
                CASE WHEN $3='REVEALED' THEN a.giver_id ELSE NULL END AS revealed_giver_id,
                CASE WHEN $3='REVEALED' THEN p.display_name ELSE NULL END AS revealed_giver_name
         FROM secret_santa_assignments a
         JOIN secret_santa_participants p ON p.event_id = a.event_id AND p.user_id = a.giver_id
         WHERE a.event_id=$1 AND a.recipient_id=$2`,
        [event.id, uid, event.status],
      ),
    ]);

    let reveal: any[] | null = null;
    if (event.status === "REVEALED") {
      reveal = await many<any>(
        `SELECT g.display_name AS giver_name, r.display_name AS recipient_name, a.gift_sent, a.gift_received
         FROM secret_santa_assignments a
         JOIN secret_santa_participants g ON g.event_id=a.event_id AND g.user_id=a.giver_id
         JOIN secret_santa_participants r ON r.event_id=a.event_id AND r.user_id=a.recipient_id
         WHERE a.event_id=$1 ORDER BY LOWER(g.display_name)`,
        [event.id],
      );
    }

    return {
      event: {
        id: event.id,
        title: event.title,
        description: event.description,
        budgetNote: event.budget_note,
        status: event.status,
        allowedRoleIds,
        signupClosesAt: event.signup_closes_at,
        giftDeadlineAt: event.gift_deadline_at,
        matchedAt: event.matched_at,
        revealedAt: event.revealed_at,
        participantCount: participants.length,
      },
      eligible,
      admin,
      requiredRoles,
      participant: me
        ? {
            userId: me.user_id,
            displayName: me.display_name,
            ign: me.ign,
            wishlist: me.wishlist,
            avoidList: me.avoid_list,
            notes: me.notes,
            backupElf: Boolean(me.backup_elf),
            joinedAt: me.joined_at,
            updatedAt: me.updated_at,
          }
        : null,
      match: myOutgoing
        ? {
            recipientId: myOutgoing.recipient_id,
            displayName: myOutgoing.display_name,
            ign: myOutgoing.ign,
            wishlist: myOutgoing.wishlist,
            avoidList: myOutgoing.avoid_list,
            notes: myOutgoing.notes,
            wishlistUpdatedAt: myOutgoing.wishlist_updated_at,
            giftSent: Boolean(myOutgoing.gift_sent),
            giftSentAt: myOutgoing.gift_sent_at,
            giftSentNote: myOutgoing.gift_sent_note ?? "",
            giftReceived: Boolean(myOutgoing.gift_received),
            giftReceivedAt: myOutgoing.gift_received_at,
          }
        : null,
      incoming: myIncoming
        ? {
            giftSent: Boolean(myIncoming.gift_sent),
            giftSentAt: myIncoming.gift_sent_at,
            giftSentNote: myIncoming.gift_sent_note ?? "",
            giftReceived: Boolean(myIncoming.gift_received),
            giftReceivedAt: myIncoming.gift_received_at,
            revealedSantaName: myIncoming.revealed_giver_name ?? null,
          }
        : null,
      participants: participants.map((p: any) => ({
        userId: p.user_id,
        displayName: p.display_name,
        backupElf: Boolean(p.backup_elf),
        hasWishlist: Boolean(p.has_wishlist),
      })),
      reveal,
    };
  });

  // Join or update own wishlist (allowed during SIGNUPS_OPEN, and existing participants can keep updating wishlist during MATCHED).
  app.post("/v1/secret-santa/:eventId/signup", async (req: any, reply: any) => {
    const ctx = await requireGuildUser(req, reply);
    if (!ctx) return;
    const { uid, access } = ctx;
    const event = await activeEventForMember(String(req.params.eventId));
    if (!event) return reply.code(404).send({ error: "event_not_found", message: "Secret Santa event not found." });

    const existing = await oneOrNone<any>(
      `SELECT * FROM secret_santa_participants WHERE event_id=$1 AND user_id=$2`,
      [event.id, uid],
    );

    if (!existing) {
      if (event.status !== "SIGNUPS_OPEN") {
        return reply.code(409).send({ error: "signups_closed", message: "Signups are not currently open for this Secret Santa." });
      }
      if (event.signup_closes_at && Date.now() > Date.parse(event.signup_closes_at)) {
        return reply.code(409).send({ error: "signups_closed", message: "The signup deadline for this Secret Santa has passed." });
      }
      const allowedRoleIds: string[] = Array.isArray(event.allowed_role_ids) ? event.allowed_role_ids.map(String) : [];
      if (!hasAllowedSecretSantaRole(access.roles, allowedRoleIds)) {
        return reply.code(403).send({
          error: "role_required",
          message: "You do not have one of the Discord roles required to join this Secret Santa.",
        });
      }
    } else if (!["SIGNUPS_OPEN", "MATCHED"].includes(event.status)) {
      return reply.code(409).send({ error: "event_locked", message: "Wishlists can no longer be edited after the event is revealed or archived." });
    }

    const body = signupSchema.parse(req.body ?? {});
    const displayName = await resolveDisplayName(uid);
    await db.query(
      `INSERT INTO secret_santa_participants(event_id,user_id,display_name,ign,wishlist,avoid_list,notes,backup_elf,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (event_id,user_id) DO UPDATE SET
         display_name=EXCLUDED.display_name,
         ign=EXCLUDED.ign,
         wishlist=EXCLUDED.wishlist,
         avoid_list=EXCLUDED.avoid_list,
         notes=EXCLUDED.notes,
         backup_elf=EXCLUDED.backup_elf,
         updated_at=NOW()`,
      [event.id, uid, displayName, body.ign, body.wishlist, body.avoidList, body.notes, body.backupElf],
    );

    if (event.status === "MATCHED") {
      await notifyController(guildId, "wishlist-updated", event.id);
    } else {
      await notifyController(guildId, "panel", event.id);
    }
    return { ok: true, joined: !existing, updated: Boolean(existing) };
  });

  // Withdraw before matching
  app.delete("/v1/secret-santa/:eventId/signup", async (req: any, reply: any) => {
    const ctx = await requireGuildUser(req, reply);
    if (!ctx) return;
    const event = await activeEventForMember(String(req.params.eventId));
    if (!event) return reply.code(404).send({ error: "event_not_found" });
    if (event.status !== "SIGNUPS_OPEN") {
      return reply.code(409).send({ error: "already_matched", message: "Matches are already drawn. Ask an Officer if you need to drop out so a Backup Elf can cover." });
    }
    await db.query(`DELETE FROM secret_santa_participants WHERE event_id=$1 AND user_id=$2`, [event.id, ctx.uid]);
    await db.query(`DELETE FROM secret_santa_exclusions WHERE event_id=$1 AND (user_a=$2 OR user_b=$2)`, [event.id, ctx.uid]);
    await notifyController(guildId, "panel", event.id);
    return { ok: true };
  });

  // Santa marks gift as sent
  app.post("/v1/secret-santa/:eventId/gift-sent", async (req: any, reply: any) => {
    const ctx = await requireGuildUser(req, reply);
    if (!ctx) return;
    const note = z.object({ note: z.string().trim().max(300).default("") }).parse(req.body ?? {}).note;
    const event = await activeEventForMember(String(req.params.eventId));
    if (!event || !["MATCHED", "REVEALED"].includes(event.status)) {
      return reply.code(409).send({ error: "not_matched", message: "Secret Santa matches have not been drawn yet." });
    }
    const res = await db.query(
      `UPDATE secret_santa_assignments
       SET gift_sent=TRUE, gift_sent_at=COALESCE(gift_sent_at,NOW()), gift_sent_note=$3
       WHERE event_id=$1 AND giver_id=$2 RETURNING recipient_id`,
      [event.id, ctx.uid, note],
    );
    if (!res.rowCount) return reply.code(404).send({ error: "no_assignment", message: "You are not matched in this Secret Santa." });
    await notifyController(guildId, "panel", event.id);
    await redis.publish("secret-santa:notify", JSON.stringify({ guildId, eventId: event.id, kind: "gift_sent", recipientId: res.rows[0].recipient_id, note })).catch(() => {});
    return { ok: true };
  });

  // Recipient confirms gift received
  app.post("/v1/secret-santa/:eventId/gift-received", async (req: any, reply: any) => {
    const ctx = await requireGuildUser(req, reply);
    if (!ctx) return;
    const event = await activeEventForMember(String(req.params.eventId));
    if (!event || !["MATCHED", "REVEALED"].includes(event.status)) {
      return reply.code(409).send({ error: "not_matched" });
    }
    const res = await db.query(
      `UPDATE secret_santa_assignments
       SET gift_received=TRUE, gift_received_at=COALESCE(gift_received_at,NOW()), gift_sent=TRUE, gift_sent_at=COALESCE(gift_sent_at,NOW())
       WHERE event_id=$1 AND recipient_id=$2 RETURNING giver_id`,
      [event.id, ctx.uid],
    );
    if (!res.rowCount) return reply.code(404).send({ error: "no_assignment" });
    await notifyController(guildId, "panel", event.id);
    await redis.publish("secret-santa:notify", JSON.stringify({ guildId, eventId: event.id, kind: "gift_received", giverId: res.rows[0].giver_id })).catch(() => {});
    return { ok: true };
  });

  // Admin overview (zero-spoiler: shows progress & DM health without leaking pairings)
  app.get("/v1/secret-santa/admin", async (req: any, reply: any) => {
    if (!(await requireAdmin(req, reply))) return;
    const [events, dCtx] = await Promise.all([
      many<any>(`SELECT * FROM secret_santa_events WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 20`, [guildId]),
      discordContext().catch(() => ({ roles: [] as any[], textChannels: [] as any[] })),
    ]);
    const selectedId = String((req.query as any)?.eventId ?? events[0]?.id ?? "");
    let participants: any[] = [];
    let exclusions: any[] = [];
    let stats = { total: 0, sent: 0, received: 0, dmDelivered: 0, dmFailed: 0 };

    if (selectedId && events.some((e: any) => e.id === selectedId)) {
      [participants, exclusions] = await Promise.all([
        many<any>(
          `SELECT p.user_id, p.display_name, p.ign, p.backup_elf, p.joined_at, p.updated_at,
                  (LENGTH(TRIM(p.wishlist)) > 0) AS has_wishlist,
                  COALESCE(g.gift_sent, FALSE) AS gift_sent,
                  g.gift_sent_at,
                  COALESCE(r.gift_received, FALSE) AS gift_received,
                  r.gift_received_at,
                  g.dm_delivered_at,
                  g.dm_last_error
           FROM secret_santa_participants p
           LEFT JOIN secret_santa_assignments g ON g.event_id=p.event_id AND g.giver_id=p.user_id
           LEFT JOIN secret_santa_assignments r ON r.event_id=p.event_id AND r.recipient_id=p.user_id
           WHERE p.event_id=$1
           ORDER BY LOWER(p.display_name), p.joined_at`,
          [selectedId],
        ),
        many<any>(
          `SELECT e.user_a, e.user_b, pa.display_name AS name_a, pb.display_name AS name_b
           FROM secret_santa_exclusions e
           LEFT JOIN secret_santa_participants pa ON pa.event_id=e.event_id AND pa.user_id=e.user_a
           LEFT JOIN secret_santa_participants pb ON pb.event_id=e.event_id AND pb.user_id=e.user_b
           WHERE e.event_id=$1`,
          [selectedId],
        ),
      ]);
      const agg = await oneOrNone<any>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE gift_sent)::int AS sent,
                COUNT(*) FILTER (WHERE gift_received)::int AS received,
                COUNT(*) FILTER (WHERE dm_delivered_at IS NOT NULL)::int AS dm_delivered,
                COUNT(*) FILTER (WHERE dm_last_error IS NOT NULL AND dm_delivered_at IS NULL)::int AS dm_failed
         FROM secret_santa_assignments WHERE event_id=$1`,
        [selectedId],
      );
      if (agg) {
        stats = {
          total: Number(agg.total ?? 0),
          sent: Number(agg.sent ?? 0),
          received: Number(agg.received ?? 0),
          dmDelivered: Number(agg.dm_delivered ?? 0),
          dmFailed: Number(agg.dm_failed ?? 0),
        };
      }
    }

    return {
      events,
      selectedEventId: selectedId || null,
      participants,
      exclusions,
      stats,
      roles: (dCtx.roles ?? []).filter((r: any) => String(r.id) !== guildId && !r.managed),
      channels: dCtx.textChannels ?? [],
    };
  });

  app.post("/v1/secret-santa/admin/events", async (req: any, reply: any) => {
    if (!(await requireAdmin(req, reply))) return;
    const b = createEventSchema.parse(req.body ?? {});
    const id = randomUUID();
    const uid = userId(req);
    await db.query(
      `INSERT INTO secret_santa_events(id,guild_id,title,description,budget_note,status,allowed_role_ids,signup_closes_at,gift_deadline_at,channel_id,created_by)
       VALUES($1,$2,$3,$4,$5,$6,ARRAY(SELECT jsonb_array_elements_text($7::jsonb)),$8,$9,$10,$11)`,
      [id, guildId, b.title, b.description, b.budgetNote, b.status, b.allowedRoleIds, b.signupClosesAt ?? null, b.giftDeadlineAt ?? null, b.channelId ?? null, uid],
    );
    await sentinelRecord({ source: "api", category: "secret-santa", action: "event.created", actorId: uid, targetId: id, metadata: { title: b.title, allowedRoles: b.allowedRoleIds.length } }).catch(() => {});
    if (b.channelId) await notifyController(guildId, "panel", id);
    return { ok: true, id };
  });

  app.put("/v1/secret-santa/admin/events/:eventId", async (req: any, reply: any) => {
    if (!(await requireAdmin(req, reply))) return;
    const id = String(req.params.eventId);
    const existing = await oneOrNone<any>(`SELECT * FROM secret_santa_events WHERE guild_id=$1 AND id=$2`, [guildId, id]);
    if (!existing) return reply.code(404).send({ error: "event_not_found" });
    const b = updateEventSchema.parse(req.body ?? {});
    // Never downgrade MATCHED/REVEALED back to SIGNUPS_OPEN directly (prevents corrupting live matches).
    const nextStatus = b.status && ["MATCHED", "REVEALED"].includes(existing.status) && b.status !== "ARCHIVED"
      ? existing.status
      : (b.status ?? existing.status);

    await db.query(
      `UPDATE secret_santa_events
       SET title=$3, description=$4, budget_note=$5, allowed_role_ids=ARRAY(SELECT jsonb_array_elements_text($6::jsonb)), signup_closes_at=$7, gift_deadline_at=$8, channel_id=$9, status=$10, updated_at=NOW()
       WHERE guild_id=$1 AND id=$2`,
      [
        guildId,
        id,
        b.title ?? existing.title,
        b.description ?? existing.description,
        b.budgetNote ?? existing.budget_note,
        b.allowedRoleIds ?? (Array.isArray(existing.allowed_role_ids) ? existing.allowed_role_ids.map(String) : []),
        "signupClosesAt" in b ? (b.signupClosesAt ?? null) : existing.signup_closes_at,
        "giftDeadlineAt" in b ? (b.giftDeadlineAt ?? null) : existing.gift_deadline_at,
        "channelId" in b ? (b.channelId ?? null) : existing.channel_id,
        nextStatus,
      ],
    );
    await notifyController(guildId, "panel", id);
    return { ok: true };
  });

  app.post("/v1/secret-santa/admin/events/:eventId/exclusions", async (req: any, reply: any) => {
    if (!(await requireAdmin(req, reply))) return;
    const id = String(req.params.eventId);
    const { userA, userB } = z.object({ userA: z.string().regex(/^\d{5,25}$/), userB: z.string().regex(/^\d{5,25}$/) }).parse(req.body ?? {});
    if (userA === userB) return reply.code(400).send({ error: "same_user", message: "Choose two different participants." });
    const [a, b] = userA < userB ? [userA, userB] : [userB, userA];
    const event = await oneOrNone<any>(`SELECT status FROM secret_santa_events WHERE guild_id=$1 AND id=$2`, [guildId, id]);
    if (!event) return reply.code(404).send({ error: "event_not_found" });
    if (!["DRAFT", "SIGNUPS_OPEN"].includes(event.status)) return reply.code(409).send({ error: "already_matched", message: "Exclusions can only be edited before matching." });
    await db.query(`INSERT INTO secret_santa_exclusions(event_id,user_a,user_b) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [id, a, b]);
    return { ok: true };
  });

  app.delete("/v1/secret-santa/admin/events/:eventId/exclusions", async (req: any, reply: any) => {
    if (!(await requireAdmin(req, reply))) return;
    const id = String(req.params.eventId);
    const { userA, userB } = z.object({ userA: z.string().regex(/^\d{5,25}$/), userB: z.string().regex(/^\d{5,25}$/) }).parse(req.body ?? {});
    const [a, b] = userA < userB ? [userA, userB] : [userB, userA];
    await db.query(`DELETE FROM secret_santa_exclusions WHERE event_id=$1 AND user_a=$2 AND user_b=$3`, [id, a, b]);
    return { ok: true };
  });

  // Transactional draw: computes valid derangement, writes assignments atomically, triggers Discord DM dispatch.
  app.post("/v1/secret-santa/admin/events/:eventId/match", async (req: any, reply: any) => {
    if (!(await requireAdmin(req, reply))) return;
    const id = String(req.params.eventId);
    const uid = userId(req);
    const client = await pool.connect();
    let matchedCount = 0;
    try {
      await client.query("BEGIN");
      const evRes = await client.query(`SELECT * FROM secret_santa_events WHERE guild_id=$1 AND id=$2 FOR UPDATE`, [guildId, id]);
      const ev = evRes.rows[0];
      if (!ev) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ error: "event_not_found" });
      }
      if (!["DRAFT", "SIGNUPS_OPEN"].includes(ev.status)) {
        await client.query("ROLLBACK");
        return reply.code(409).send({ error: "already_matched", message: "Matches have already been drawn for this event." });
      }
      const pRes = await client.query(`SELECT user_id FROM secret_santa_participants WHERE event_id=$1 FOR UPDATE`, [id]);
      const participantIds = pRes.rows.map((r: any) => String(r.user_id));
      if (participantIds.length < 3) {
        await client.query("ROLLBACK");
        return reply.code(400).send({ error: "too_few_participants", message: "At least 3 participants are required to draw Secret Santa matches." });
      }
      const eRes = await client.query(`SELECT user_a, user_b FROM secret_santa_exclusions WHERE event_id=$1`, [id]);
      const exclusions = eRes.rows.map((r: any) => [String(r.user_a), String(r.user_b)] as const);

      const pairing = solveSecretSantaMatching(participantIds, exclusions);
      if (!pairing) {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          error: "unsatisfiable_exclusions",
          message: "No valid Secret Santa matching exists with the current exclusion rules. Remove one or more exclusions and try again.",
        });
      }

      await client.query(`DELETE FROM secret_santa_assignments WHERE event_id=$1`, [id]);
      for (const [giver, recipient] of pairing) {
        await client.query(
          `INSERT INTO secret_santa_assignments(event_id,giver_id,recipient_id,wishlist_notified_at) VALUES($1,$2,$3,NOW())`,
          [id, giver, recipient],
        );
      }
      await client.query(`UPDATE secret_santa_events SET status='MATCHED', matched_at=NOW(), updated_at=NOW() WHERE id=$1`, [id]);
      await client.query("COMMIT");
      matchedCount = pairing.size;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    await sentinelRecord({ source: "api", category: "secret-santa", action: "event.matched", actorId: uid, targetId: id, metadata: { participants: matchedCount } }).catch(() => {});
    await notifyController(guildId, "dispatch-matches", id);
    return { ok: true, matched: matchedCount };
  });

  app.post("/v1/secret-santa/admin/events/:eventId/publish", async (req: any, reply: any) => {
    if (!(await requireAdmin(req, reply))) return;
    const id = String(req.params.eventId);
    const ev = await oneOrNone<any>(`SELECT id, channel_id FROM secret_santa_events WHERE guild_id=$1 AND id=$2`, [guildId, id]);
    if (!ev) return reply.code(404).send({ error: "event_not_found" });
    if (!ev.channel_id) return reply.code(400).send({ error: "channel_required", message: "Choose a Discord channel for the event first." });
    await notifyController(guildId, "panel", id);
    return { ok: true };
  });

  app.post("/v1/secret-santa/admin/events/:eventId/remind", async (req: any, reply: any) => {
    if (!(await requireAdmin(req, reply))) return;
    const id = String(req.params.eventId);
    const ev = await oneOrNone<any>(`SELECT status FROM secret_santa_events WHERE guild_id=$1 AND id=$2`, [guildId, id]);
    if (!ev || ev.status !== "MATCHED") return reply.code(409).send({ error: "not_matched", message: "Reminders are only available while an event is matched." });
    await notifyController(guildId, "remind", id);
    return { ok: true };
  });

  app.post("/v1/secret-santa/admin/events/:eventId/reveal", async (req: any, reply: any) => {
    if (!(await requireAdmin(req, reply))) return;
    const id = String(req.params.eventId);
    const uid = userId(req);
    const res = await db.query(
      `UPDATE secret_santa_events SET status='REVEALED', revealed_at=NOW(), updated_at=NOW()
       WHERE guild_id=$1 AND id=$2 AND status='MATCHED' RETURNING id`,
      [guildId, id],
    );
    if (!res.rowCount) return reply.code(409).send({ error: "cannot_reveal", message: "Only a MATCHED Secret Santa event can be revealed." });
    await sentinelRecord({ source: "api", category: "secret-santa", action: "event.revealed", actorId: uid, targetId: id }).catch(() => {});
    await notifyController(guildId, "reveal", id);
    return { ok: true };
  });

  // Audited emergency pairing inspection (for resolving a dispute or no-show)
  app.post("/v1/secret-santa/admin/events/:eventId/emergency-inspect", async (req: any, reply: any) => {
    if (!(await requireAdmin(req, reply))) return;
    const id = String(req.params.eventId);
    const uid = userId(req);
    const reason = z.object({ reason: z.string().trim().min(4).max(300) }).parse(req.body ?? {}).reason;
    const ev = await oneOrNone<any>(`SELECT id, title FROM secret_santa_events WHERE guild_id=$1 AND id=$2`, [guildId, id]);
    if (!ev) return reply.code(404).send({ error: "event_not_found" });
    await sentinelRecord({
      source: "api",
      category: "secret-santa",
      action: "event.emergency_inspect",
      actorId: uid,
      targetId: id,
      severity: "warning",
      metadata: { title: ev.title, reason },
    }).catch(() => {});
    const pairings = await many<any>(
      `SELECT a.giver_id, g.display_name AS giver_name, a.recipient_id, r.display_name AS recipient_name,
              a.gift_sent, a.gift_received, a.dm_delivered_at, a.dm_last_error
       FROM secret_santa_assignments a
       JOIN secret_santa_participants g ON g.event_id=a.event_id AND g.user_id=a.giver_id
       JOIN secret_santa_participants r ON r.event_id=a.event_id AND r.user_id=a.recipient_id
       WHERE a.event_id=$1 ORDER BY LOWER(g.display_name)`,
      [id],
    );
    return { ok: true, pairings };
  });

  // Reassign a flaked Santa's recipient to a Backup Elf (or another chosen giver who does not already have this recipient)
  app.post("/v1/secret-santa/admin/events/:eventId/reassign", async (req: any, reply: any) => {
    if (!(await requireAdmin(req, reply))) return;
    const id = String(req.params.eventId);
    const uid = userId(req);
    const { fromGiverId, toGiverId } = z.object({
      fromGiverId: z.string().regex(/^\d{5,25}$/),
      toGiverId: z.string().regex(/^\d{5,25}$/),
    }).parse(req.body ?? {});
    if (fromGiverId === toGiverId) return reply.code(400).send({ error: "same_user" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const ev = (await client.query(`SELECT status FROM secret_santa_events WHERE guild_id=$1 AND id=$2 FOR UPDATE`, [guildId, id])).rows[0];
      if (!ev || ev.status !== "MATCHED") {
        await client.query("ROLLBACK");
        return reply.code(409).send({ error: "not_matched" });
      }
      const oldAssign = (await client.query(`SELECT * FROM secret_santa_assignments WHERE event_id=$1 AND giver_id=$2 FOR UPDATE`, [id, fromGiverId])).rows[0];
      if (!oldAssign) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ error: "assignment_not_found" });
      }
      if (String(oldAssign.recipient_id) === toGiverId) {
        await client.query("ROLLBACK");
        return reply.code(409).send({ error: "self_match", message: "The replacement Santa cannot be assigned to themselves." });
      }
      const existingNew = (await client.query(`SELECT 1 FROM secret_santa_assignments WHERE event_id=$1 AND giver_id=$2`, [id, toGiverId])).rows[0];
      if (existingNew) {
        await client.query("ROLLBACK");
        return reply.code(409).send({ error: "already_assigned", message: "That member already has an active Secret Santa assignment. Choose an unassigned Backup Elf or add them first." });
      }
      // Ensure replacement exists in participants so joins work cleanly.
      const displayName = await resolveDisplayName(toGiverId);
      await client.query(
        `INSERT INTO secret_santa_participants(event_id,user_id,display_name,backup_elf) VALUES($1,$2,$3,TRUE) ON CONFLICT (event_id,user_id) DO NOTHING`,
        [id, toGiverId, displayName],
      );
      await client.query(
        `UPDATE secret_santa_assignments
         SET giver_id=$3, dm_delivered_at=NULL, dm_last_error=NULL, wishlist_notified_at=NOW()
         WHERE event_id=$1 AND giver_id=$2`,
        [id, fromGiverId, toGiverId],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    await sentinelRecord({ source: "api", category: "secret-santa", action: "event.reassigned", actorId: uid, targetId: id, severity: "warning", metadata: { fromGiverId, toGiverId } }).catch(() => {});
    await notifyController(guildId, "dispatch-matches", id);
    return { ok: true };
  });
}
