// Special crew in the same tabs and order as the in-game Special Crew menu
// (taken from a screenshot of that menu). Effects are reworded in plain
// English; the in-game wording is kept alongside for reference.
export type CrewClass = "Military" | "Sailors" | "Pirates" | "Adventurers";
export type CrewUse =
  | "Gunnery"
  | "Mortars"
  | "Sailing"
  | "Repairs & safety"
  | "Boarding"
  | "Loot & supplies"
  | "Exploration";
export type Specialist = {
  name: string;
  cls: CrewClass;
  effect: string;
  game: string;
  uses: CrewUse[];
  image?: string;
};

const img = (n: string) => `/wosb/builds/specialist-${n}.png`;

export const CREW_CLASSES: { id: CrewClass; label: string; blurb: string; clientOption: string }[] = [
  {
    id: "Military",
    label: "Military",
    blurb: "Gunnery, fire fighting and keeping your crew alive.",
    clientOption: "Combats",
  },
  {
    id: "Sailors",
    label: "Sailors",
    blurb: "Speed, turning, repairs and life on board.",
    clientOption: "Sailors",
  },
  {
    id: "Pirates",
    label: "Pirates",
    blurb: "Boarding, loot, spotting things and XP.",
    clientOption: "Pirates",
  },
  {
    id: "Adventurers",
    label: "Adventurers",
    blurb: "Finding rare crew and items at sea.",
    clientOption: "Adventurers",
  },
];

export const CREW_USES: CrewUse[] = [
  "Gunnery",
  "Mortars",
  "Sailing",
  "Repairs & safety",
  "Boarding",
  "Loot & supplies",
  "Exploration",
];

export const SPECIALISTS: Specialist[] = [
  // Military
  {
    cls: "Military",
    name: "Midshipman",
    image: img("midshipman"),
    uses: ["Boarding"],
    effect: "Your musketeers start a boarding fight already defending.",
    game: "During boarding, Musketeers start defending",
  },
  {
    cls: "Military",
    name: "Watchman",
    image: img("watchman"),
    uses: ["Repairs & safety"],
    effect: "Puts out fires 40% faster.",
    game: "Fire extinguishing speed +40%",
  },
  {
    cls: "Military",
    name: "Junior provost",
    image: img("junior-provost"),
    uses: ["Repairs & safety"],
    effect: "Big fires do half as much damage.",
    game: "Reduce damage from large fire by 50%",
  },
  {
    cls: "Military",
    name: "Provost",
    image: img("provost"),
    uses: ["Repairs & safety"],
    effect: "Puts out small fires (like sparks) 25% faster.",
    game: "Extinguish small fire (like sparks in ships) 25% faster",
  },
  {
    cls: "Military",
    name: "Surgeon",
    image: img("surgeon"),
    uses: ["Repairs & safety"],
    effect: "When you repair, half the crew hurt by cannon fire get healed.",
    game: "Half of the crew wounded by cannon fire are healed during repairs",
  },
  {
    cls: "Military",
    name: "Sub-lieutenant",
    image: img("sub-lieutenant"),
    uses: ["Repairs & safety"],
    effect: "Items recharge a little faster for every sailor you have (+0.1% each).",
    game: "Bonus for each sailor: Items reload +0.1%",
  },
  {
    cls: "Military",
    name: "Naval Cadet",
    image: img("naval-cadet"),
    uses: ["Gunnery"],
    effect: "Grapeshot does a third more damage to NPC ships.",
    game: "Increase grapeshot damage to npc by 33%",
  },
  {
    cls: "Military",
    name: "Commodore",
    image: img("commodore"),
    uses: ["Gunnery"],
    effect: "Guns aim 20% faster.",
    game: "Weapon aiming speed +20%",
  },
  {
    cls: "Military",
    name: "Commander",
    image: img("commander"),
    uses: ["Gunnery"],
    effect: "Switching ammo is faster for every sailor you have (+0.2% each).",
    game: "Switching ammo faster by 0.2% per sailor",
  },
  {
    cls: "Military",
    name: "Gunner",
    image: img("gunner"),
    uses: ["Gunnery"],
    effect: "Guns reload 4% faster.",
    game: "+4% reload speed increase",
  },
  {
    cls: "Military",
    name: "Armorer",
    image: img("armorer"),
    uses: ["Gunnery"],
    effect:
      "After firing a single cannon, your next reload is 20% faster. Great with right-click targeted shots.",
    game: "Next reload after a single cannon shot will be faster by 20%",
  },
  {
    cls: "Military",
    name: "Master Gunner",
    image: img("master-gunner"),
    uses: ["Gunnery"],
    effect: "Below half health, guns reload faster for every sailor you have (+0.1% each).",
    game: "When health is below 50%, boost ammo reload speed by 0.1% per sailor",
  },
  {
    cls: "Military",
    name: "Artillerist",
    image: img("artillerist"),
    uses: ["Mortars"],
    effect: "Mortars aim 25% faster.",
    game: "Mortar aiming speed +25%",
  },
  {
    cls: "Military",
    name: "Bombardier",
    image: img("bombardier"),
    uses: ["Mortars"],
    effect: "Mortars reload 10% faster while your other guns are loaded.",
    game: "Mortar reload speed +10% if weapons are loaded",
  },
  {
    cls: "Military",
    name: "Sailing Master",
    uses: ["Sailing"],
    effect: "Helps the ship hold its course and stops it drifting.",
    game: "Helps maintain a course direction, removes drift",
  },
  // Sailors
  {
    cls: "Sailors",
    name: "Pilot",
    image: img("pilot"),
    uses: ["Sailing"],
    effect: "You lose 25% less speed when turning at full speed, and drift less.",
    game: "Reduce speed penalty when turning in cruise speed (max speed) by 25%, helps drifting",
  },
  {
    cls: "Sailors",
    name: "First Mate",
    image: img("first-mate"),
    uses: ["Sailing"],
    effect: "Speed up and slow down faster for every sailor you have (+0.2% each).",
    game: "Bonus for each sailor: Speed change +0.2%",
  },
  {
    cls: "Sailors",
    name: "Sail Handler",
    image: img("sail-handler"),
    uses: ["Sailing"],
    effect: "+4% speed.",
    game: "+4% to speed",
  },
  {
    cls: "Sailors",
    name: "Helmsman",
    image: img("helmsman"),
    uses: ["Sailing"],
    effect: "Turns better when stopped or at first speed (+4).",
    game: "Maneuverability in place and on first speed +4",
  },
  {
    cls: "Sailors",
    name: "Steersman",
    uses: ["Sailing"],
    effect: "Below half health, turns better (+6).",
    game: "When durability is <50%, maneuverability +6",
  },
  {
    cls: "Sailors",
    name: "Rigger",
    uses: ["Repairs & safety"],
    effect: "Sails repair themselves 25% faster.",
    game: "Sail repair itself 25% faster",
  },
  {
    cls: "Sailors",
    name: "Carpenter",
    uses: ["Repairs & safety"],
    effect: "Repairs are faster for every sailor you have (+0.3% each).",
    game: "Bonus for each sailor: Repair speed +0.3%",
  },
  {
    cls: "Sailors",
    name: "Ship's Carpenter",
    uses: ["Repairs & safety"],
    effect: "Lets you repair at second speed, though more slowly.",
    game: "Repairs are available on second speed, but it is slower",
  },
  {
    cls: "Sailors",
    name: "Purser",
    image: img("purser"),
    uses: ["Sailing", "Loot & supplies"],
    effect: "When overloaded, you lose 30% less speed.",
    game: "Lower overloaded speed penalty by 30%",
  },
  {
    cls: "Sailors",
    name: "Butcher",
    image: img("butcher"),
    uses: ["Loot & supplies"],
    effect: "Lets you hunt animals on islands for food.",
    game: "Animal slaughter for food is available. More animals can be found on islands",
  },
  {
    cls: "Sailors",
    name: "Cook",
    image: img("cook"),
    uses: ["Loot & supplies"],
    effect: "Each piece of food feeds the crew a third more.",
    game: "Increases food satiety per food by 33%",
  },
  {
    cls: "Sailors",
    name: "Clerk",
    image: img("clerk"),
    uses: ["Repairs & safety"],
    effect: "Guns are 40% less likely to blow up by accident.",
    game: "Reduces chance of weapons accidentally blowing up by 40%",
  },
  {
    cls: "Sailors",
    name: "Fisherman",
    image: img("fisherman"),
    uses: ["Loot & supplies"],
    effect: "More loot from fishing and whaling for every boarder (+0.5% each).",
    game: "Extra loot when fishing/whaling by 0.5% per boarder",
  },
  {
    cls: "Sailors",
    name: "Boatman",
    image: img("boatman"),
    uses: ["Loot & supplies"],
    effect: "Fish faster for every sailor you have (+1% each).",
    game: "Bonus for each sailor: Fishing speed +1%",
  },
  // Pirates
  {
    cls: "Pirates",
    name: "Corsair",
    image: img("corsair"),
    uses: ["Loot & supplies"],
    effect: "+6% to all experience.",
    game: "All experience +6%",
  },
  {
    cls: "Pirates",
    name: "Scribe",
    image: img("scribe"),
    uses: ["Loot & supplies"],
    effect: "+20% ship-tree XP and upgrade progress.",
    game: "Ship branch xp and upgrades +20%",
  },
  {
    cls: "Pirates",
    name: "Mastman",
    image: img("mastman"),
    uses: ["Exploration"],
    effect: "See 10% further.",
    game: "Visibility Range +10%",
  },
  {
    cls: "Pirates",
    name: "Navigator",
    image: img("navigator"),
    uses: ["Exploration"],
    effect: "Items show on the minimap from 40% further away.",
    game: "Item visibility distance on the minimap +40%",
  },
  {
    cls: "Pirates",
    name: "Quartermaster",
    image: img("quartermaster"),
    uses: ["Boarding"],
    effect: "Picks one random enemy group to target when boarding starts.",
    game: "Randomly choose one target at start of boarding",
  },
  {
    cls: "Pirates",
    name: "Harpooner",
    image: img("harpooner"),
    uses: ["Boarding"],
    effect: "Boarding hooks come back 60% faster.",
    game: "Boarding hook cooldown reload 60% faster",
  },
  {
    cls: "Pirates",
    name: "Skipper",
    image: img("skipper"),
    uses: ["Boarding", "Loot & supplies"],
    effect: "More loot from boarding for every boarder (+0.5% each).",
    game: "For each boarder, the maximum loot obtained from boarding +0.5%",
  },
  {
    cls: "Pirates",
    name: "Swimmer",
    image: img("swimmer"),
    uses: ["Exploration"],
    effect: "Pick up items from 40% further away.",
    game: "Item pick-up range +40%",
  },
  {
    cls: "Pirates",
    name: "Daredevil",
    image: img("daredevil"),
    uses: ["Boarding"],
    effect: "Your crew don't die in sorties.",
    game: "Crew doesn't die in sorties.",
  },
  {
    cls: "Pirates",
    name: "Doctor",
    image: img("doctor"),
    uses: ["Boarding", "Repairs & safety"],
    effect: "Your boarding crew survive cannon fire 40% better.",
    game: "Boarding company survivability in shelling +40%",
  },
  {
    cls: "Pirates",
    name: "Senior doctor",
    image: img("senior-doctor"),
    uses: ["Repairs & safety"],
    effect: "20% more crew healed after a fight.",
    game: "20% more crew healed after combat",
  },
  {
    cls: "Pirates",
    name: "Recruiter",
    image: img("recruiter"),
    uses: ["Boarding"],
    effect: "Pick up 10 more crew from the sea.",
    game: "Increases limit of how many crew can be picked up from sea by 10",
  },
  {
    cls: "Pirates",
    name: "Powder Monkey",
    uses: ["Gunnery"],
    effect: "Swivel guns reload 20% faster.",
    game: "Swivel reload speed +20%",
  },
  // Adventurers
  {
    cls: "Adventurers",
    name: "Lifeguard",
    uses: ["Exploration"],
    effect: "+15% chance to find special crew when boarding Empire ships.",
    game: "Chance to find unique crew when boarding Empire ships +15%",
  },
  {
    cls: "Adventurers",
    name: "Explorer",
    uses: ["Exploration"],
    effect: "+5% chance to find special crew at sea (not adventurers).",
    game: "Chance to find unique crew at sea, except adventurers +5%",
  },
  {
    cls: "Adventurers",
    name: "Seafarer",
    uses: ["Exploration"],
    effect: "+50% chance to find and rescue special crew after finishing a mode.",
    game: "Chance to find and save unique crew after mode completion +50%",
  },
  {
    cls: "Adventurers",
    name: "Scout",
    uses: ["Boarding"],
    effect: "Take 30% more captives when boarding.",
    game: "More captives from total crew count when boarding +30%",
  },
  {
    cls: "Adventurers",
    name: "Lucky One",
    uses: ["Loot & supplies"],
    effect: "+20% chance to find double items at sea.",
    game: "Chance to find twice as many items at sea +20%",
  },
  {
    cls: "Adventurers",
    name: "Seeker",
    uses: ["Loot & supplies"],
    effect: "+10% chance to find rare items at sea and on islands.",
    game: "Chance to find rare items at sea and on islands +10%",
  },
  {
    cls: "Adventurers",
    name: "Veteran",
    uses: ["Loot & supplies"],
    effect: "Consumables you pick up at sea don't expire until you reach port.",
    game: "Consumables picked up at sea will not have a timer until entering a port",
  },
  {
    cls: "Adventurers",
    name: "Old Hand",
    uses: ["Repairs & safety"],
    effect: "Searching wrecks repairs 5% of your ship.",
    game: "Restores durability when examining ship wreckage +5%",
  },
  {
    cls: "Adventurers",
    name: "Ginger",
    uses: ["Repairs & safety"],
    effect: "Lets specialists who won't normally work together share a ship, and takes no slot itself.",
    game: "Solves incompatibility conflict (for those who cannot work together). Does not take up space",
  },
];

/** Suggested picks, clearly labelled as suggestions. */
export const CREW_PRESETS: { id: string; label: string; names: string[] }[] = [
  {
    id: "pb-heavy",
    label: "Port battle heavy",
    names: [
      "Gunner",
      "Armorer",
      "Commodore",
      "Watchman",
      "Junior provost",
      "Surgeon",
      "Carpenter",
      "Sail Handler",
    ],
  },
  {
    id: "siege",
    label: "Siege ship",
    names: ["Artillerist", "Bombardier", "Watchman", "Junior provost", "Carpenter", "Sail Handler"],
  },
  {
    id: "boarding",
    label: "Boarding",
    names: ["Midshipman", "Quartermaster", "Harpooner", "Doctor", "Skipper", "Recruiter"],
  },
  {
    id: "explorer",
    label: "Exploring & loot",
    names: ["Mastman", "Navigator", "Swimmer", "Lucky One", "Seeker", "Veteran", "Cook"],
  },
];
