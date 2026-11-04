"use client";
const icon = (name: string) => {
  const n = name.toLowerCase();
  const match: [string, string][] = [
    ["captain", "captains-seal"],
    ["battle mark", "battle-mark"],
    ["pirate token", "pirate-token"],
    ["pirate coin", "pirate-token"],
    ["escudo", "escudo"],
    ["chest key", "chest-key"],
    ["heavy shot", "heavy-shot"],
    ["saxon shot", "saxon-shot"],
    ["volcanic", "volcanic-ore"],
    ["ice lantern", "ice-lantern"],
    ["al-fatih", "al-fatih"],
    ["letters patent", "elite-warrant"],
    ["elite status", "elite-warrant"],
    ["imperial blueprint", "imperial-blueprint"],
    ["construction license", "construction-license"],
    ["voodoo", "voodoo-skull"],
    ["basilisk", "basilisk-flag"],
    ["narwhal", "narwhal"],
    ["decal", "halloween-decal"],
    ["paint", "ship-paint"],
    ["gold", "gold"],
    ["coins", "coin"],
    ["iron", "iron"],
    ["beam", "beam"],
    ["sailcloth", "sailcloth"],
  ];
  const key = match.find(([term]) => n.includes(term))?.[1];
  return key ? `/event-guide/icons/${key}.png` : null;
};
export default function EventItemIcon({ name }: { name: string }) {
  const src = icon(name);
  return src ? (
    <img className="eventMerchantIcon" src={src} width="40" height="40" alt="" loading="lazy" />
  ) : null;
}
