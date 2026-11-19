// Discord commands backed by the WoSB Wiki (the public wiki built by WoSB Workbench; "Compendium" internally):
// /ship, /damage, /fire, /tower and /compendium search. Data comes from the active release on disk
// (data/compendium-active.json), so publishing a new Compendium updates the bot without a restart.
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { AttachmentBuilder, EmbedBuilder, MessageFlags, SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction } from "discord.js";

const SITE = (process.env.PUBLIC_WIKI_URL ?? "https://bandofmisfits.org").replace(/\/$/, "");
const root = () => (process.cwd().replace(/\\/g, "/").endsWith("/apps/controller") ? resolve(process.cwd(), "../..") : process.cwd());

type Ship = { n: string; armor: number; hp: number; rank?: number; cls?: string; crew?: number; speed?: number; box?: { min: number[]; max: number[] } | null; ports?: any; masts?: number; sails?: number };
type Gun = { n: string; pen: number; min?: number; max?: number; reload?: number; splash?: number; scatter?: number; mortar?: boolean; mount?: string };
type Ammo = { n: string; pen: number; df: number; min: number; sail?: number; crew?: number; reload?: number; fx?: string };
type Data = { ships: Ship[]; cannons: Gun[]; ammo: Ammo[]; calib: any; towers: any[]; pb: any; search: { t: string; u: string; c: string; k?: string }[]; release: string };

let loaded: { key: string; data: Data | null } | null = null;
/** The active Compendium's data, reloaded when a new release is published. */
export async function compendiumData(): Promise<Data | null> {
  let active: any = null;
  try {
    active = JSON.parse(await readFile(join(root(), "data", "compendium-active.json"), "utf8"));
  } catch {
    return null;
  }
  const key = `${active.release}:${active.activatedAt}`;
  if (loaded?.key === key) return loaded.data;
  let data: Data | null = null;
  try {
    const raw = await readFile(join(active.directory, "assets", "hit-data.js"), "utf8");
    const hit = JSON.parse(raw.slice(raw.indexOf("=") + 1).trim().replace(/;\s*$/, ""));
    const search = JSON.parse(await readFile(join(active.directory, "search.json"), "utf8").catch(() => "[]"));
    data = { ...hit, search, release: active.release };
  } catch (e) {
    console.warn("[compendium] could not read the active release", e);
  }
  loaded = { key, data };
  return data;
}
export async function compendiumInstalled() {
  try {
    const a = JSON.parse(await readFile(join(root(), "data", "compendium-active.json"), "utf8"));
    return Boolean(await stat(join(a.directory, "index.html")).catch(() => null));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- hit model (same rules as the Compendium's hit analysis)
const N = [[1, 0], [0.70710677, 0.70710677], [0.7269121, 0.6867306], [0.3794607, 0.9252079], [0.00884719, 0.9999609], [0.04054236, 0.9991779], [-0.02138744, 0.9997712],
  [-0.04306768, 0.9990721], [-0.281508, 0.9595589], [-0.2177823, 0.9759973], [-0.1870278, 0.9823547], [-0.4435308, 0.8962591], [-0.4962481, 0.8681807], [-0.7269121, 0.6867306],
  [-0.9873866, 0.158328], [-0.9873866, 0.158328], [-0.9999427, 0.01071631], [-1, 0], [-1, 0], [-1, 0]];
type Zone = "bow" | "side" | "stern";
function model(box: { min: number[]; max: number[] }) {
  const cx = (box.min[0] + box.max[0]) / 2, cz = (box.min[2] + box.max[2]) / 2, hl = (box.max[0] - box.min[0]) / 2, hw = (box.max[2] - box.min[2]) / 2;
  const idx = (x: number, z: number) => Math.min(19, (Math.atan2(Math.abs(z - cz) / hw, (x - cx) / hl) / (2 * Math.PI)) * 38);
  const zone = (f: number): Zone => (f < 2.5 ? "bow" : f > 13.5 ? "stern" : "side");
  const normal = (x: number, z: number) => {
    const f = idx(x, z), i0 = Math.floor(f), i1 = Math.min(19, i0 + 1), k = f - i0;
    let nx = N[i0][0] + (N[i1][0] - N[i0][0]) * k, nz = (N[i0][1] + (N[i1][1] - N[i0][1]) * k) * (z >= cz ? 1 : -1);
    const l = Math.hypot(nx, nz) || 1;
    return [nx / l, nz / l, f] as const;
  };
  const entry = (dx: number, dz: number) => {
    const t = Math.min(dx ? hl / Math.abs(dx) : 1e9, dz ? hw / Math.abs(dz) : 1e9);
    return [cx - dx * t, cz - dz * t] as const;
  };
  return { cx, cz, hl, hw, zone, normal, entry };
}
type Params = { pen: number; df: number; minDmg: number; armor: number; armorWeight: number; scale: number };
function params(d: Data, gun: Gun, ammo: Ammo, ship: Ship): Params {
  const c = d.calib ?? {};
  return { pen: (gun.pen || 0) + (ammo.pen || 0), df: ammo.df || 1, minDmg: ammo.min || 0, armor: ship.armor || 0, armorWeight: c.armor_weight ?? 1, scale: c.scale ?? 1 };
}
const MUL: Record<Zone, number> = { bow: 1.3, side: 1, stern: 0.5 };
function fromBearing(M: ReturnType<typeof model>, bearing: number, p: Params) {
  const dx = -Math.cos((bearing * Math.PI) / 180), dz = -Math.sin((bearing * Math.PI) / 180);
  const [x, z] = M.entry(dx, dz);
  const [nx, nz, f] = M.normal(x, z);
  const zone = M.zone(f);
  const c = Math.min(1, Math.max(1e-3, -(dx * nx + dz * nz)));
  const ang = (Math.acos(c) * 180) / Math.PI;
  const eff = (p.armor * MUL[zone]) / Math.max(0.05, Math.cos((Math.min(85, ang) * Math.PI) / 180));
  return { dmg: Math.max(0, Math.max(p.minDmg, p.pen - p.armorWeight * eff) * p.df * p.scale), zone, ang };
}
const glance = (p: Params) => (p.pen > p.armor * p.armorWeight ? (Math.acos(Math.min(1, (p.armor * p.armorWeight) / p.pen)) * 180) / Math.PI : 0);
const BOX = { min: [-25, -4, -6], max: [25, 8, 6] };

function heat(v: number) {
  const st: [number, number[]][] = [[0, [40, 50, 90]], [0.25, [60, 110, 190]], [0.5, [90, 190, 120]], [0.75, [240, 200, 60]], [1, [220, 50, 40]]];
  v = Math.max(0, Math.min(1, v));
  for (let i = 1; i < st.length; i++)
    if (v <= st[i][0]) {
      const [a, ca] = st[i - 1], [b, cb] = st[i], t = (v - a) / (b - a);
      return `rgb(${ca.map((c, k) => Math.round(c + (cb[k] - c) * t)).join(",")})`;
    }
  return "rgb(220,50,40)";
}
/** Damage ring around the hull, as a PNG: what each firing direction does to this ship. */
export async function heatmapPng(ship: Ship, p: Params) {
  const M = model(ship.box ?? BOX), W = 520, cx = W / 2, cy = W / 2, R1 = 210, R0 = 176;
  const ring = Array.from({ length: 180 }, (_, i) => [i * 2, fromBearing(M, i * 2, p)] as const);
  const top = Math.max(1, ...ring.map(([, r]) => r.dmg));
  const arcs = ring.map(([b, r]) => {
    const a0 = ((b - 1.2) * Math.PI) / 180, a1 = ((b + 1.2) * Math.PI) / 180;
    const pt = (R: number, a: number) => `${(cx + Math.cos(a) * R).toFixed(1)},${(cy - Math.sin(a) * R).toFixed(1)}`;
    return `<path d="M${pt(R1, a0)} A${R1},${R1} 0 0 0 ${pt(R1, a1)} L${pt(R0, a1)} A${R0},${R0} 0 0 1 ${pt(R0, a0)}Z" fill="${heat(r.dmg / top)}"/>`;
  }).join("");
  const S = Math.min(150 / M.hl, 150 / (M.hw * 3.2)), L = M.hl * S, H = M.hw * S;
  const hull = `<rect x="${cx - L}" y="${cy - H}" width="${2 * L}" height="${2 * H}" fill="#e8eef4" stroke="#2878c8" stroke-width="2"/>` +
    `<polygon points="${cx - L * 0.97},${cy - H * 0.75} ${cx + L * 0.45},${cy - H * 0.92} ${cx + L * 0.98},${cy} ${cx + L * 0.45},${cy + H * 0.92} ${cx - L * 0.97},${cy + H * 0.75}" fill="#9aa3ab"/>` +
    `<rect x="${cx - L}" y="${cy - H}" width="${L * 0.11}" height="${2 * H}" fill="#d23737" opacity=".7"/><rect x="${cx + L * 0.78}" y="${cy - H * 0.44}" width="${L * 0.22}" height="${H * 0.88}" fill="#2e9650" opacity=".7"/>`;
  const label = (b: number, t: string) => `<text x="${cx + Math.cos((b * Math.PI) / 180) * (R1 + 22)}" y="${cy - Math.sin((b * Math.PI) / 180) * (R1 + 22) + 5}" text-anchor="middle" font-size="15" font-family="sans-serif" fill="#e9eef0" font-weight="bold">${t}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W + 28}"><rect width="100%" height="100%" fill="#13202b"/>${arcs}${hull}` +
    `${label(0, "bow")}${label(180, "stern")}${label(90, "beam")}${label(270, "beam")}` +
    `<text x="12" y="${W + 18}" font-size="13" font-family="sans-serif" fill="#9eafb9">ring = firing from that direction · max ${top.toFixed(1)} per ball</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ---------------------------------------------------------------- commands
const shipOpt = (o: any, name = "ship", desc = "Ship name") => o.setName(name).setDescription(desc).setRequired(true).setAutocomplete(true);
export const compendiumCommands = [
  new SlashCommandBuilder().setName("ship").setDescription("Ship card: stats, where to hit it and the best ammo against it")
    .addStringOption((o) => shipOpt(o))
    .addStringOption((o) => o.setName("gun").setDescription("Your gun (default 32-pdr Cannon)").setAutocomplete(true)),
  new SlashCommandBuilder().setName("damage").setDescription("Damage per ball with your gun and ammo against a ship, from any angle")
    .addStringOption((o) => o.setName("gun").setDescription("Your gun").setRequired(true).setAutocomplete(true))
    .addStringOption((o) => shipOpt(o, "target", "Target ship"))
    .addStringOption((o) => o.setName("ammo").setDescription("Ammo (default cast-iron shot)").setAutocomplete(true))
    .addIntegerOption((o) => o.setName("from").setDescription("Firing from: 0 = bow-on, 90 = abeam, 180 = stern (default 90)").setMinValue(0).setMaxValue(180)),
  new SlashCommandBuilder().setName("fire").setDescription("How many minor fires start a large fire on a ship, and how long they burn")
    .addStringOption((o) => shipOpt(o))
    .addIntegerOption((o) => o.setName("hp").setDescription("Current HP in % (default 60)").setMinValue(1).setMaxValue(100))
    .addIntegerOption((o) => o.setName("suppression").setDescription("Minor-fire suppression bonus in % (special crew 25, Large Plates 50)").setMinValue(0).setMaxValue(95)),
  new SlashCommandBuilder().setName("tower").setDescription("Port-battle tower and fort strength and tower reach")
    .addIntegerOption((o) => o.setName("rank").setDescription("Battle's minimum ship rank (1–7)").setRequired(true).setMinValue(1).setMaxValue(7))
    .addIntegerOption((o) => o.setName("team").setDescription("Players per side").setRequired(true).addChoices(...[5, 7, 10, 15, 20, 40].map((n) => ({ name: `${n} v ${n}`, value: n }))))
    .addIntegerOption((o) => o.setName("port_level").setDescription("Port level 1–7 (default 1)").setMinValue(1).setMaxValue(7)),
  new SlashCommandBuilder().setName("wosb").setDescription("Search the WoSB Wiki")
    .addStringOption((o) => o.setName("query").setDescription("Ship, gun, ammo, port, tool or guide").setRequired(true)),
];
export const compendiumCommandNames = new Set(compendiumCommands.map((c) => c.name));

const norm = (s: string) => String(s ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
function find<T extends { n: string }>(list: T[], q: string | null) {
  if (!q) return undefined;
  const k = norm(q);
  return list.find((x) => norm(x.n) === k) ?? list.find((x) => norm(x.n).startsWith(k)) ?? list.find((x) => norm(x.n).includes(k));
}
const pageUrl = (d: Data, kind: string, name: string) => {
  const hit = d.search.find((s) => s.c === kind && norm(s.t) === norm(name));
  return hit ? `${SITE}/${hit.u}` : `${SITE}/`;
};
const guns = (d: Data) => d.cannons.filter((c) => !c.mortar && (!c.mount || c.mount === "broadside"));
const shots = (d: Data) => d.ammo.filter((a) => !/mortar|keg|rocket|firework|smoke|snow|phosphor|percussion/i.test(a.n));
const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }) : "—");
const roundEven = (x: number) => { const f = Math.floor(x), r = x - f; return r > 0.5 ? f + 1 : r < 0.5 ? f : f % 2 ? f + 1 : f; };
const COLOR = 0x1f6f8b;

export async function handleCompendiumAutocomplete(i: AutocompleteInteraction) {
  const d = await compendiumData();
  if (!d) return i.respond([]);
  const f = i.options.getFocused(true);
  const list = f.name === "gun" ? guns(d) : f.name === "ammo" ? shots(d) : d.ships;
  const k = norm(String(f.value));
  const hits = list.filter((x) => !k || norm(x.n).includes(k)).sort((a, b) => Number(!norm(a.n).startsWith(k)) - Number(!norm(b.n).startsWith(k)) || a.n.localeCompare(b.n));
  await i.respond(hits.slice(0, 25).map((x) => ({ name: x.n.slice(0, 100), value: x.n.slice(0, 100) })));
}

export async function handleCompendiumCommand(i: ChatInputCommandInteraction) {
  const d = await compendiumData();
  if (!d) return i.reply({ content: "The WoSB Wiki isn't installed on this server yet. An admin can publish it from WoSB Workbench.", flags: MessageFlags.Ephemeral });
  const name = i.commandName;
  if (name === "wosb") return search(i, d);
  if (name === "tower") return tower(i, d);
  const ship = find(d.ships, i.options.getString(name === "damage" ? "target" : "ship"));
  if (!ship) return i.reply({ content: "I couldn't find that ship. Pick one from the list as you type.", flags: MessageFlags.Ephemeral });
  if (name === "fire") return fire(i, ship);
  const gun = find(guns(d), i.options.getString("gun")) ?? find(guns(d), "32-pdr Cannon") ?? guns(d)[0];
  if (!gun) return i.reply({ content: "No gun data in this WoSB Wiki release.", flags: MessageFlags.Ephemeral });
  if (name === "ship") return shipCard(i, d, ship, gun);
  if (name === "damage") return damage(i, d, ship, gun);
}

async function shipCard(i: ChatInputCommandInteraction, d: Data, ship: Ship, gun: Gun) {
  await i.deferReply();
  const ball = find(shots(d), "Cast-Iron Shot") ?? shots(d)[0];
  const M = model(ship.box ?? BOX), p = params(d, gun, ball, ship);
  const ammo = shots(d).map((a) => { const q = params(d, gun, a, ship); return { a, side: fromBearing(M, 90, q).dmg, stern: fromBearing(M, 180, q).dmg }; })
    .sort((x, y) => y.side - x.side).slice(0, 4);
  const ports = ship.ports ?? {};
  const url = pageUrl(d, "Ships", ship.n);
  const e = new EmbedBuilder().setColor(COLOR).setTitle(ship.n).setURL(url)
    .setDescription(`Rate ${ship.rank ?? "—"}${ship.cls ? ` · ${ship.cls}` : ""}`)
    .addFields(
      { name: "Hull", value: `${fmt(ship.hp, 0)} HP · armor ${fmt(ship.armor)}`, inline: true },
      { name: "Speed · crew", value: `${fmt(ship.speed ?? NaN)} · ${fmt(ship.crew ?? NaN, 0)}`, inline: true },
      { name: "Guns", value: ports.left != null ? `${ports.left} per side${ports.swivel ? ` · ${ports.swivel} swivels` : ""}` : "—", inline: true },
      { name: `Where to hit it (${gun.n}, cast-iron)`, value: `Square on the side **${fmt(fromBearing(M, 90, p).dmg)}** · stern rake **${fmt(fromBearing(M, 180, p).dmg)}** · bow-on **${fmt(fromBearing(M, 0, p).dmg)}** per ball\nSide hits more than **${fmt(glance(p), 0)}°** off square glance off.` },
      { name: "Best ammo against it", value: ammo.map((x) => `${x.a.n}: ${fmt(x.side)} side · ${fmt(x.stern)} stern`).join("\n") || "—" },
      { name: "Fire", value: `A large fire needs **${1 + roundEven(ship.hp / 1000)}** minor fires at once (and HP between 5% and 95%).` },
    )
    .setImage("attachment://heatmap.png")
    .setFooter({ text: `Estimates from the client's hull model · ${d.calib?.calibrated ? "calibrated" : "uncalibrated"} · WoSB Wiki` });
  const png = await heatmapPng(ship, p);
  await i.editReply({ embeds: [e], files: [new AttachmentBuilder(png, { name: "heatmap.png" })],
    content: `[Ship page](${url}) · [Full hit analysis](${SITE}/tools/hit-analysis.html?ship=${encodeURIComponent(ship.n)})` });
}

async function damage(i: ChatInputCommandInteraction, d: Data, ship: Ship, gun: Gun) {
  const ammo = find(shots(d), i.options.getString("ammo")) ?? find(shots(d), "Cast-Iron Shot") ?? shots(d)[0];
  const from = i.options.getInteger("from") ?? 90;
  const M = model(ship.box ?? BOX), p = params(d, gun, ammo, ship), r = fromBearing(M, from, p);
  const dead = Array.from({ length: 180 }, (_, k) => fromBearing(M, k * 2, p)).filter((x) => x.dmg <= 0.05).length * 2;
  const rows = [[90, "Square on the side"], [45, "Bow quarter"], [0, "Bow-on"], [135, "Stern quarter"], [180, "Stern rake"]] as const;
  const e = new EmbedBuilder().setColor(COLOR).setTitle(`${gun.n} + ${ammo.n} → ${ship.n}`).setURL(`${SITE}/tools/hit-analysis.html?ship=${encodeURIComponent(ship.n)}`)
    .setDescription(`From ${from}°: hits the **${r.zone}** at ${fmt(r.ang, 0)}° off square → **${fmt(r.dmg)}** per ball.`)
    .addFields(
      { name: "Other angles", value: rows.map(([b, t]) => { const x = fromBearing(M, b, p); return `${t}: ${fmt(x.dmg)} (${x.zone})`; }).join("\n") },
      { name: "Glancing", value: p.pen > p.armor * p.armorWeight ? `Side hits more than ${fmt(glance(p), 0)}° off square do nothing. Dead zone: ${dead}° of the circle.` : "This gun can't get through the side at any angle; aim for the stern." },
    )
    .setFooter({ text: "Estimate: penetration − armor ÷ cos(angle); stern armor ×0.5, bow ×1.3. The server decides exact numbers." });
  await i.reply({ embeds: [e] });
}

async function fire(i: ChatInputCommandInteraction, ship: Ship) {
  const hpPct = i.options.getInteger("hp") ?? 60, sup = Math.min(95, i.options.getInteger("suppression") ?? 0) / 100, f = 1 - sup;
  const need = 1 + roundEven(ship.hp / 1000), can = hpPct >= 5 && hpPct <= 95;
  const e = new EmbedBuilder().setColor(0xe0552b).setTitle(`Fire on the ${ship.n}`).setURL(`${SITE}/tools/fire-calculator.html`)
    .addFields(
      { name: "Large fire needs", value: `**${need}** minor fires burning at once (max HP ${fmt(ship.hp, 0)})`, inline: false },
      { name: "One minor fire", value: `${fmt(6 * f)}–${fmt(10 * f)} s · 4 HP/s · ${fmt(24 * f, 0)}–${fmt(40 * f, 0)} HP`, inline: true },
      { name: `At ${hpPct}% HP`, value: can ? `Large fire possible · checks ×${fmt(1 / (0.5 + 0.5 * hpPct / 100), 2)} as often as at full HP` : "No large fire can start (HP outside 5–95%)", inline: true },
      { name: "After a large fire", value: "80 s before another can start. Repairs put out finite and mendable large fires, not infinite ones.", inline: false },
    )
    .setFooter({ text: "From the game client's fire rules. The ignition chance per hit is rolled by the server." });
  await i.reply({ embeds: [e] });
}

async function tower(i: ChatInputCommandInteraction, d: Data) {
  const rank = i.options.getInteger("rank", true), team = i.options.getInteger("team", true), level = i.options.getInteger("port_level") ?? 1;
  const pb = d.pb ?? {};
  const base = pb.base?.[String(Math.max(1, rank))] ?? pb.base_low ?? [4500, 10000];
  const tf = pb.team?.[String(team)] ?? 1, lf = pb.level?.[level] ?? 1;
  const hp = (t: boolean) => Math.round((base[t ? 0 : 1] * tf * lf) / 100) * 100;
  const e = new EmbedBuilder().setColor(COLOR).setTitle(`Port battle: rank ${rank}, ${team} v ${team}, port level ${level}`).setURL(`${SITE}/tools/defenses.html`)
    .addFields(
      { name: "Strength", value: `Tower **${hp(true).toLocaleString()}** HP · guild fort **${hp(false).toLocaleString()}** HP` },
      { name: "Towers", value: (d.towers ?? []).map((t: any) => `${t.n}: reach ${t.dead ? `${t.dead}–` : ""}${t.range}${t.dmg ? ` · ${t.dmg} dmg every ${t.cd} s` : ""}`).join("\n") || "—" },
      { name: "Capture", value: `Stay within ${pb.capture_r ?? 30} of a tower for ${pb.capture_s ?? 30} s. Boarding the fort takes ${pb.fort_board_s ?? 25} s. Each destroyed tower adds 10 minutes.` },
    );
  await i.reply({ embeds: [e] });
}

async function search(i: ChatInputCommandInteraction, d: Data) {
  const q = norm(i.options.getString("query", true));
  const scored = d.search.map((s) => {
    const t = norm(s.t), k = norm(s.k ?? "");
    const score = t === q ? 100 : t.startsWith(q) ? 60 : t.includes(q) ? 40 : k.includes(q) ? 10 : 0;
    return { s, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.s.t.localeCompare(b.s.t)).slice(0, 8);
  if (!scored.length) return i.reply({ content: `Nothing found. Try the search box at ${SITE}/`, flags: MessageFlags.Ephemeral });
  const e = new EmbedBuilder().setColor(COLOR).setTitle("WoSB Wiki").setURL(SITE + "/")
    .setDescription(scored.map(({ s }) => `**[${s.t}](${SITE}/${encodeURI(s.u)})** · ${s.c}`).join("\n"));
  await i.reply({ embeds: [e] });
}
