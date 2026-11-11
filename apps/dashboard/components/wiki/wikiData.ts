"use client";
// Shared, cached loaders for wiki pages so moving between pages doesn't refetch.
import { useEffect, useState } from "react";

const cache = new Map<string, Promise<any>>();
export function load(path: string): Promise<any> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(`/api/internal/${path}`, { cache: "no-store" }).then(async (r) => {
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.message || b.error || "This part of the wiki isn't available right now.");
      return b;
    });
    cache.set(path, p);
    p.catch(() => cache.delete(path));
  }
  return p;
}
export const forget = (path: string) => cache.delete(path);

export function useLoad<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!path) return;
    let live = true;
    setError("");
    load(path)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [path]);
  return { data, error };
}

export type Ship = {
  name: string;
  rate: number | null;
  class: string | null;
  faction: string | null;
  image?: string | null;
  historicalInspiration?: string | null;
  stats: Record<string, number | null>;
};
export function useShips() {
  const { data, error } = useLoad<any>("wiki/portal/articles/ships");
  return { ships: (data?.data?.ships ?? null) as Ship[] | null, error };
}

export const shipSlug = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Ship portraits shipped with the dashboard, keyed by a squashed name. */
const PORTRAITS =
  "12Apostolov Adventure Anson AxelThorsen Azov Balloon Bellona Black-Wind BlackPrince BonhommeRichard BuenViento Constitution DeZevenProvincien Deadfish Devourer Diana Eagle Essex FairAmerican Falmouth Firestorm FlyingCloud Friede FriedrichWilhelm GeorgyPobedonosec GoldenApostle Horizon Huracan Iberia Ingermanland Kobukson KweeSong La-Creole La-Salamandre LaCouronne LaRoyale LaSirene Le-Cerf LeRequin LeSaintLouis Mercury Montanes Mordaunt Neptuno Octopus Phoenix Pickle Polacca Poltava PrinsWillem QingLong RedArrow Redoutable Rota Russia SanJuanNepomuceno SanLeandro SanMartin Sans-Pareil SantisimaTrinidad Savannah Shen Shunsen Southampton Sovereign Sparrow StPavel Surprise ThreeHierarchs TieLong Vasa Victory".split(
    " ",
  );
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const portraitBy = new Map(PORTRAITS.map((p) => [squash(p), `/wosb/ships/m${p}.png`]));
portraitBy.set("redoubtable", "/wosb/ships/mRedoutable.png");
export function portrait(ship: { name: string; image?: string | null }) {
  const own = portraitBy.get(squash(ship.name)) ?? portraitBy.get(squash(ship.name.replace(/^the\s+/i, "")));
  if (own) return own;
  const img = ship.image;
  return typeof img === "string" && /^\/[\w\-./]+\.(png|jpe?g|webp)$/i.test(img) ? img : null;
}

export const RATE_NAMES = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];
export const rateName = (r: number | null | undefined) =>
  r && RATE_NAMES[r] ? `${RATE_NAMES[r]} rate` : "Unrated";

/** BOM's port battle preferences (BOM Port Battle Preparation guide). */
export const BOM_PB_PICKS: Record<string, string> = {
  "12 apostolov": "Our preferred 1st rate for port battles.",
  "santisima trinidad": "Our preferred 1st rate for veteran players.",
  "la royale": "Our preferred 1st rate siege ship.",
  "de zeven provincien": "Reserved for our most experienced players.",
  sovereign: "Reserved for our most experienced players.",
  victory: "Our least preferred 1st rate; for new players only.",
  "st pavel": "Our preferred 2nd rate for port battles.",
  redoubtable: "A solid 2nd rate choice.",
  vasa: "Reserved for our most experienced players.",
  adventure: "Our preferred 2nd rate siege ship.",
  montanes: "Reserved for our most experienced players.",
  neptuno: "Reserved for our most experienced players.",
  "sans pareil": "Reserved for our most experienced players.",
  octopus: "Reserved for our most experienced players.",
  firestorm: "Reserved for our most experienced players.",
  ingermanland: "Reserved for our most experienced players.",
  azov: "Our preferred 3rd rate for port battles.",
  bellona: "A solid 3rd rate choice.",
  iberia: "Reserved for our most experienced players.",
  "le saint louis": "Reserved for our most experienced players.",
  anson: "Our least preferred 3rd rate; for new players.",
  kobukson: "Our preferred 3rd rate siege ship.",
  huracan: "Our preferred 1st rate for tension fights.",
  constitution: "Our preferred 4th rate for tension fights.",
  "three hierarchs": "Can stand in for a Constitution in tension fights.",
  "san martin": "Our preferred 5th rate for tension fights.",
  phoenix: "Our preferred 6th rate for tension fights.",
  shunsen: "For our most experienced players in 6th rate tension fights.",
};
export const bomPick = (name: string) =>
  BOM_PB_PICKS[
    name
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .trim()
  ];

export const CLASS_BLURB: Record<string, string> = {
  heavy: "Tough and heavily armed but slow. The backbone of the main line in port battles.",
  combat: "An all-rounder for line fighting and quick attacks.",
  siege: "Carries mortars to knock down forts and towers. Fragile, so stay behind the line.",
  fast: "Quick and nimble for scouting, chasing and long-range fighting. Not suited to port battles.",
  transport: "Built to carry cargo; fighting is secondary.",
  imperial: "Captured from the Inhagger Empire.",
};
export const classBlurb = (c: string | null) => (c ? CLASS_BLURB[c.toLowerCase()] : undefined);

export const STAT_LABELS: [string, string, boolean][] = [
  ["durability", "Health", true],
  ["armor", "Armor", true],
  ["speed", "Speed", true],
  ["maneuverability", "Turning", true],
  ["guns", "Guns", true],
  ["crew", "Crew", true],
  ["hold", "Hold", true],
];
