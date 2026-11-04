// Port Battle signup form: one Discord modal with radio buttons and checkboxes,
// so captains can sign up (and set their ships) without the dashboard.
//
// Discord limits that shape this form:
//  - a checkbox group holds at most 10 options, and
//  - a modal holds at most 5 questions.
// Rates with more than 10 ships split them across two checkbox groups.
import {
  CheckboxGroupBuilder,
  CheckboxGroupOptionBuilder,
  LabelBuilder,
  ModalBuilder,
  RadioGroupBuilder,
  RadioGroupOptionBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";

export const ATTENDANCE = [
  { value: "ATTENDING", label: "Attending", status: "ATTENDING", late: 0 },
  { value: "LATE_15", label: "Running late (~15 min)", status: "LATE", late: 15 },
  { value: "LATE_30", label: "Running late (~30 min)", status: "LATE", late: 30 },
  { value: "LATE_45", label: "Running late (45+ min)", status: "LATE", late: 45 },
  { value: "WAITLIST", label: "Waitlist", status: "WAITLIST", late: 0 },
  { value: "TENSIONING", label: "Tensioning (not in PB)", status: "TENSIONING", late: 0 },
] as const;

export const DUTIES = [
  { value: "HORN", label: "I can play Horn", description: "I have the Horn loadout and stock" },
  { value: "HORN_PREF", label: "I'd like to play Horn" },
  { value: "Red Flare", label: "Red flare" },
  { value: "Gold Flare", label: "Gold flare" },
] as const;

export type SignupDefaults = {
  status?: string | null;
  lateMinutes?: number | null;
  ships?: string[];
  preferred?: string[];
  hornCapable?: boolean;
  hornPreferred?: boolean;
  flares?: string[];
};

const MAX_GROUP = 10;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Split ships into at most two checkbox groups of <=10, alphabetical. */
export function shipGroups(ships: string[]): string[][] {
  const sorted = [...new Set(ships)].sort((a, b) => a.localeCompare(b));
  if (sorted.length <= MAX_GROUP) return [sorted];
  const half = Math.ceil(sorted.length / 2);
  return [sorted.slice(0, half), sorted.slice(half)];
}
const groupLabel = (group: string[], index: number, total: number) =>
  total === 1 ? "Ships you can bring" : `Ships you can bring (${group[0]![0]}–${group.at(-1)![0]})`;

function attendanceValue(d: SignupDefaults) {
  if (d.status === "LATE") {
    const m = Number(d.lateMinutes ?? 15);
    return m >= 45 ? "LATE_45" : m >= 30 ? "LATE_30" : "LATE_15";
  }
  return ATTENDANCE.some((a) => a.value === d.status) ? String(d.status) : "ATTENDING";
}

/** The signup modal. Returns null when the rate has too many ships for checkboxes (>20). */
export function buildSignupModal(battle: { id: string; port_name: string; rate?: number | null }, ships: string[], d: SignupDefaults) {
  const groups = shipGroups(ships);
  if (groups.flat().length > MAX_GROUP * 2) return null;
  const chosen = new Set(d.ships ?? []);
  const preferred = new Set((d.preferred ?? []).filter((s) => ships.includes(s)));
  const rate = battle.rate ? ` · ${battle.rate}${["st", "nd", "rd"][battle.rate - 1] ?? "th"} rate` : "";
  const modal = new ModalBuilder().setCustomId(`pb:formsubmit:${battle.id}`).setTitle(clip(`Sign up · ${battle.port_name}${rate}`, 45));

  const current = attendanceValue(d);
  const attendance = new LabelBuilder()
    .setLabel("Attendance")
    .setRadioGroupComponent(
      new RadioGroupBuilder()
        .setCustomId("status")
        .setRequired(true)
        .addOptions(
          ...ATTENDANCE.map((a) => new RadioGroupOptionBuilder().setLabel(a.label).setValue(a.value).setDefault(a.value === current)),
        ),
    );
  const labels: LabelBuilder[] = [attendance];

  groups.forEach((group, i) =>
    labels.push(
      new LabelBuilder()
        .setLabel(groupLabel(group, i, groups.length))
        .setDescription(i === 0 ? "Tick every ship you can sail in this battle." : "Continued.")
        .setCheckboxGroupComponent(
          new CheckboxGroupBuilder()
            .setCustomId(`ships_${i}`)
            .setRequired(false)
            .setMinValues(0)
            .setMaxValues(group.length)
            .addOptions(...group.map((s) => new CheckboxGroupOptionBuilder().setLabel(clip(s, 100)).setValue(s).setDefault(chosen.has(s)))),
        ),
    ),
  );

  // Preferred ships: checkboxes when they fit, otherwise a two-pick dropdown.
  const all = groups.flat();
  const preferredLabel = new LabelBuilder().setLabel("Preferred ships (up to 2)").setDescription("Your favourites. They're added to your ships if you forget to tick them.");
  if (all.length <= MAX_GROUP)
    preferredLabel.setCheckboxGroupComponent(
      new CheckboxGroupBuilder()
        .setCustomId("preferred")
        .setRequired(false)
        .setMinValues(0)
        .setMaxValues(Math.min(2, all.length))
        .addOptions(...all.map((s) => new CheckboxGroupOptionBuilder().setLabel(clip(s, 100)).setValue(s).setDefault(preferred.has(s)))),
    );
  else
    preferredLabel.setStringSelectMenuComponent(
      new StringSelectMenuBuilder()
        .setCustomId("preferred")
        .setRequired(false)
        .setMinValues(0)
        .setMaxValues(2)
        .setPlaceholder("Pick up to two")
        .addOptions(...all.map((s) => new StringSelectMenuOptionBuilder().setLabel(clip(s, 100)).setValue(s).setDefault(preferred.has(s)))),
    );
  labels.push(preferredLabel);

  const flares = new Set(d.flares ?? []);
  labels.push(
    new LabelBuilder()
      .setLabel("Duties")
      .setDescription("Officers make the final assignments.")
      .setCheckboxGroupComponent(
        new CheckboxGroupBuilder()
          .setCustomId("duties")
          .setRequired(false)
          .setMinValues(0)
          .setMaxValues(DUTIES.length)
          .addOptions(
            ...DUTIES.map((x) => {
              const o = new CheckboxGroupOptionBuilder().setLabel(x.label).setValue(x.value);
              if ("description" in x) o.setDescription(x.description);
              return o.setDefault(
                x.value === "HORN" ? Boolean(d.hornCapable) : x.value === "HORN_PREF" ? Boolean(d.hornPreferred) : flares.has(x.value),
              );
            }),
          ),
      ),
  );
  return modal.addLabelComponents(...labels);
}

type Fields = {
  getRadioGroup(id: string, required?: boolean): string | null;
  getCheckboxGroup(id: string): readonly string[];
  getStringSelectValues?(id: string): readonly string[];
};
const safe = <T>(f: () => T, fallback: T): T => {
  try {
    return f();
  } catch {
    return fallback;
  }
};

/** Turn the submitted modal into a signup request body. */
export function parseSignupForm(fields: Fields, ships: string[], displayName: string) {
  const valid = new Set(ships);
  const groups = shipGroups(ships);
  const attendance = ATTENDANCE.find((a) => a.value === safe(() => fields.getRadioGroup("status"), null)) ?? ATTENDANCE[0];
  const picked = groups.flatMap((_, i) => [...safe(() => fields.getCheckboxGroup(`ships_${i}`), [] as readonly string[])]);
  const preferredRaw = [
    ...safe(() => fields.getCheckboxGroup("preferred"), [] as readonly string[]),
    ...safe(() => fields.getStringSelectValues?.("preferred") ?? [], [] as readonly string[]),
  ];
  const preferred = [...new Set(preferredRaw)].filter((s) => valid.has(s)).slice(0, 2);
  // A preferred ship is obviously one you can bring.
  const selected = [...new Set([...picked, ...preferred])].filter((s) => valid.has(s));
  const duties = new Set(safe(() => fields.getCheckboxGroup("duties"), [] as readonly string[]));
  const hornCapable = duties.has("HORN") || duties.has("HORN_PREF");
  const needsShips = attendance.status === "ATTENDING" || attendance.status === "LATE";
  return {
    error: needsShips && !selected.length ? "Tick at least one ship you can bring, or choose Waitlist or Tensioning." : null,
    body: {
      displayName,
      status: attendance.status,
      lateMinutes: attendance.late,
      ships: selected,
      preferredShips: preferred,
      hornCapable,
      hornPreferred: duties.has("HORN_PREF"),
      flareCapabilities: ["Red Flare", "Gold Flare"].filter((f) => duties.has(f)),
    },
    attendanceLabel: attendance.label,
  };
}
