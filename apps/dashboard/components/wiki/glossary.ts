// Plain-English meanings for the game terms used across the wiki. Guides
// underline the first use of each term so readers can check it in place.
export type Term = { term: string; meaning: string; aliases?: string[]; group: string; auto?: boolean };

export const GLOSSARY: Term[] = [
  // Ships
  {
    group: "Ships",
    term: "Rate",
    meaning: "A ship's size class, from 1st rate (biggest) to 7th rate (smallest).",
    aliases: ["rates", "1st rate", "2nd rate", "3rd rate", "4th rate", "5th rate", "6th rate", "7th rate"],
  },
  {
    group: "Ships",
    term: "Hull",
    meaning: "The ship itself, without its guns and upgrades.",
    aliases: ["hulls"],
  },
  {
    group: "Ships",
    term: "Heavy",
    meaning: "A tough, slow ship class with lots of guns. The usual choice for port battles.",
    aliases: ["heavies", "heavy ship", "heavy ships"],
  },
  {
    group: "Ships",
    term: "Siege ship",
    meaning: "A fragile ship class that carries mortars to destroy forts and towers.",
    aliases: ["siege", "siege ships"],
  },
  {
    group: "Ships",
    term: "Durability",
    meaning: "How much damage a ship can take before it sinks. Also called health or HP.",
    aliases: ["HP"],
  },
  {
    group: "Ships",
    term: "Integrity",
    meaning:
      "Wear on your ship. It drops each time you sink in the open world. At zero the ship needs a major repair.",
    aliases: [],
  },
  { group: "Ships", term: "Maneuverability", meaning: "How quickly a ship turns.", aliases: [] },
  {
    group: "Ships",
    term: "Displacement",
    meaning: "How heavy the ship is. Heavier ships speed up and turn more slowly.",
    aliases: [],
  },
  {
    group: "Ships",
    term: "Hold",
    meaning: "How much weight of cargo and supplies your ship can carry.",
    aliases: ["cargo hold"],
    auto: false,
  },
  {
    group: "Ships",
    term: "Lantern",
    meaning:
      "A cosmetic ship lantern that also gives a small bonus. Red and Golden are popular for fighting.",
    aliases: ["lanterns"],
  },
  {
    group: "Ships",
    term: "Shipbuilding school",
    meaning:
      "The building tradition a ship belongs to. Building it in a matching port saves 25% of the materials.",
    aliases: [],
  },
  {
    group: "Ships",
    term: "Cruise mode",
    meaning: "A speed bonus you build up by sailing on full sails for a while.",
    aliases: [],
  },
  // Combat
  {
    group: "Combat",
    term: "Broadside",
    meaning: "All the guns on one side of the ship, or firing them all at once.",
    aliases: ["broadsides"],
  },
  { group: "Combat", term: "Volley", meaning: "One round of firing from your guns.", aliases: ["volleys"] },
  {
    group: "Combat",
    term: "Penetration",
    meaning: "How well a shot gets through armor. Higher means more damage gets through.",
    aliases: [],
  },
  {
    group: "Combat",
    term: "Armor",
    meaning: "Protection that blocks cannon damage. It's thickest at an angle and weakest at the stern.",
    aliases: [],
  },
  {
    group: "Combat",
    term: "Angling",
    meaning: "Turning your ship slightly away from the enemy so their shots glance off.",
    aliases: [],
  },
  { group: "Combat", term: "Bow", meaning: "The front of the ship.", aliases: [] },
  {
    group: "Combat",
    term: "Stern",
    meaning: "The back of the ship. Usually its weakest point.",
    aliases: [],
  },
  {
    group: "Combat",
    term: "Reload",
    meaning: "The time your guns need between shots.",
    aliases: ["reloads", "reload time", "loading time"],
  },
  {
    group: "Combat",
    term: "Spread",
    meaning: "How much your shots scatter. Lower is more accurate.",
    aliases: ["accuracy spread"],
  },
  {
    group: "Combat",
    term: "DPM",
    meaning: "Damage per minute: how much damage your guns deal in a minute.",
    aliases: [],
  },
  {
    group: "Combat",
    term: "Long cannon",
    meaning: "A long-range, accurate cannon. Reloads faster than a Jericho.",
    aliases: ["long cannons", "Longs"],
  },
  {
    group: "Combat",
    term: "Jericho",
    meaning: "A powerful pirate long cannon (38-pounder). Hits hard but reloads slowly.",
    aliases: ["Jerichos"],
  },
  {
    group: "Combat",
    term: "Carronade",
    meaning: "A short-range cannon that hits very hard.",
    aliases: ["carronades"],
  },
  {
    group: "Combat",
    term: "Mortar",
    meaning: "A gun that lobs shells in an arc. Best against forts and towers.",
    aliases: ["mortars"],
  },
  {
    group: "Combat",
    term: "Swivel gun",
    meaning: "A small extra gun fired with its own button (Q). Hard to aim precisely.",
    aliases: ["swivel guns", "swivels"],
  },
  {
    group: "Combat",
    term: "Saxon shot",
    meaning: "Everyday broadside ammo that can set ships on fire.",
    aliases: ["Saxon"],
  },
  {
    group: "Combat",
    term: "Heavy shot",
    meaning: "Ammo that punches through armor. For the bow, stern, or finishing a ship.",
    aliases: [],
  },
  {
    group: "Combat",
    term: "Fire ship",
    meaning: "A small boat full of powder that sails at an enemy and explodes.",
    aliases: ["fire ships", "fireship", "fireships"],
  },
  {
    group: "Combat",
    term: "Consumable",
    meaning: "A one-use item that repairs or boosts your ship for a while.",
    aliases: ["consumables"],
  },
  {
    group: "Combat",
    term: "Boarding",
    meaning: "A close fight between crews when two ships touch.",
    aliases: [],
  },
  {
    group: "Combat",
    term: "Musketeer",
    meaning: "Boarding crew that deals the most damage but dies easily.",
    aliases: ["musketeers"],
  },
  {
    group: "Combat",
    term: "Kiting",
    meaning: "Staying at long range while the enemy tries to close in.",
    aliases: [],
  },
  // Crew
  {
    group: "Crew",
    term: "Special crew",
    meaning: "Crew members who each give your whole ship one bonus. Also called specialists.",
    aliases: ["specialist", "specialists"],
  },
  {
    group: "Crew",
    term: "Sailor",
    meaning: "Crew who sail the ship and load the guns.",
    aliases: ["sailors"],
  },
  {
    group: "Crew",
    term: "Captain skill",
    meaning: "A permanent bonus you unlock as your captain levels up.",
    aliases: ["captain skills"],
  },
  // World
  {
    group: "World & ports",
    term: "NPC",
    meaning: "A computer-controlled ship. The game also calls them NPS (non-player ships).",
    aliases: ["NPCs", "NPS"],
  },
  {
    group: "World & ports",
    term: "Port battle",
    meaning: "A big fight between guilds to capture or defend a port. Often shortened to PB.",
    aliases: ["port battles", "PB", "PBs"],
  },
  {
    group: "World & ports",
    term: "Tension",
    meaning: "Pressure on a port. It rises from fighting nearby; at 100% a port battle can start.",
    aliases: [],
  },
  {
    group: "World & ports",
    term: "Battle window",
    meaning: "The daily time slot, set by the port's owner, when a port battle can start.",
    aliases: ["battle windows", "port battle window"],
  },
  {
    group: "World & ports",
    term: "Respawn points",
    meaning: "A team's pool of lives in a port battle (tickets). Each ship sunk costs some.",
    aliases: ["tickets", "respawn point"],
  },
  {
    group: "World & ports",
    term: "Tower",
    meaning: "A defensive gun tower in a port battle. Attackers must destroy them; they don't heal.",
    aliases: ["towers"],
  },
  {
    group: "World & ports",
    term: "Main line",
    meaning: "The core group of heavy ships fighting side by side in a port battle.",
    aliases: [],
  },
  {
    group: "World & ports",
    term: "Flanker",
    meaning: "A player who fights on the edges of the battle, away from the main line.",
    aliases: ["flankers"],
  },
  {
    group: "World & ports",
    term: "Notoriety",
    meaning: "How wanted you are for sinking NPC traders. High notoriety brings attacks and bounty hunters.",
    aliases: [],
  },
  {
    group: "World & ports",
    term: "Endless Sea",
    meaning: "The dangerous area beyond the main map, with better traders and loot.",
    aliases: [],
  },
  {
    group: "World & ports",
    term: "Black Mark",
    meaning: "A penalty for sinking neutral players or much smaller ships.",
    aliases: ["Black Marks"],
  },
  {
    group: "World & ports",
    term: "Battle Marks",
    meaning: "A currency you earn from the arena and PvP.",
    aliases: ["Battle Mark"],
  },
  {
    group: "World & ports",
    term: "Pirate Tokens",
    meaning: "A currency used to buy pirate weapons.",
    aliases: ["Pirate Token"],
  },
  {
    group: "World & ports",
    term: "Influence points",
    meaning: "What guilds spend on upgrades, city improvements and more members.",
    aliases: [],
  },
  // Economy
  {
    group: "Trading & crafting",
    term: "Crafting time",
    meaning: "A timer that refills over real time and is spent to craft in port.",
    aliases: [],
  },
  {
    group: "Trading & crafting",
    term: "Specialty Workshop",
    meaning: "A workshop needed to make certain parts. You can have up to two.",
    aliases: ["Specialty Workshops"],
  },
  {
    group: "Trading & crafting",
    term: "Labor",
    meaning: "Your personal island's own working time, separate from port crafting time.",
    aliases: ["Island Labor"],
  },
  {
    group: "Trading & crafting",
    term: "Provisions",
    meaning: "Food for your crew and for mines from level 3.",
    aliases: [],
  },
  {
    group: "Trading & crafting",
    term: "Auction",
    meaning: "Where players buy and sell goods, ships and guns to each other.",
    aliases: [],
  },
  {
    group: "Trading & crafting",
    term: "Hold insurance",
    meaning: "Protects your cargo in a port battle. Costs 40 scrolls in the port shop.",
    aliases: [],
  },
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const index = new Map<string, Term>();
for (const t of GLOSSARY)
  if (t.auto !== false) for (const w of [t.term, ...(t.aliases ?? [])]) index.set(w.toLowerCase(), t);
// Longest first so "Long cannon" wins over "cannon".
const words = [...index.keys()].sort((a, b) => b.length - a.length);
export const TERM_PATTERN = new RegExp(`\\b(${words.map(esc).join("|")})\\b`, "gi");
export const lookup = (w: string) => index.get(w.toLowerCase());
