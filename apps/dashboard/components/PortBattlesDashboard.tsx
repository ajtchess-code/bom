"use client";
import ScheduleMessagePreview from "./DiscordPayloadPreview";
import SavedViewControl from "./SavedViewControl";
import BattleCoordination from "./BattleCoordination";
import BattleHourButtons from "./BattleHourButtons";
import CancelPortBattle from "./CancelPortBattle";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PortBattleInvitations from "./PortBattleInvitations";
import TerritoryMap from "./TerritoryMap";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { emitInspector, emitRecent, emitToast, usePersistedState } from "@/lib/dashboardQoL";
import { api, fmt, rateLabel } from "./port-battles/helpers";
import { CreateBattle, ManageBattleModal } from "./port-battles/BattleForms";
import { AssignedCaptain, Captain } from "./port-battles/Captains";
import {
  ArchiveModal,
  FleetTemplateModal,
  PbAnalyticsModal,
  PbResetModal,
  TacticalBriefModal,
} from "./port-battles/Modals";
import { DetailedSignup, GuestSignupModal, PreferredShipsModal, TargetsButton } from "./port-battles/Signup";

type Props = {
  mapData?: any;
  initialBattles: any[];
  ports: any[];
  catalogue: any;
  builds: any[];
  admin: boolean;
  admiralty: boolean;
  signupAllowed: boolean;
  viewer: { id: string; name: string };
  initialPreferences: any;
  initialConfig?: any;
};
export default function PortBattlesDashboard({
  mapData,
  initialBattles,
  ports,
  catalogue,
  builds,
  admin: hasManager,
  admiralty,
  signupAllowed,
  viewer,
  initialPreferences,
  initialConfig,
}: Props) {
  const params = useSearchParams();
  const [battles, setBattles] = useState(initialBattles);
  const [resetOpen, setResetOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(params.get("battle"));
  useEffect(() => {
    const id = params.get("battle");
    if (id) setSelectedId(id);
  }, [params]);
  const [draftShips, setDraftShips] = useState<Record<string, string>>({});
  useEffect(() => {
    const close = (e: Event) => {
      document.querySelectorAll<HTMLDetailsElement>(".pbToolMenu[open]").forEach((el) => {
        if (e.type === "keydown" ? (e as KeyboardEvent).key === "Escape" : !el.contains(e.target as Node))
          el.open = false;
      });
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  const [detail, setDetail] = useState<any>(null);
  const [notice, setNotice] = useState("");
  const [signupOpen, setSignupOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [preferences, setPreferences] = useState(initialPreferences ?? { rates: {}, horn_preferred: false });
  const [dragId, setDragId] = useState<string | null>(null);
  const [bulkSelected, setBulkSelected] = useState<string[]>([]);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveQuery, setArchiveQuery] = useState("");
  const [archiveRows, setArchiveRows] = useState<any[]>([]);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [serverTemplates, setServerTemplates] = useState<any[]>([]);
  const [pbConfig, setPbConfig] = useState<any>(
    initialConfig ?? {
      ports,
      guilds: [],
      preferredShipCatalog: {},
      defaultShipTargets: {},
    },
  );
  const [tacticalOpen, setTacticalOpen] = useState(false);
  const [tacticalData, setTacticalData] = useState<any>(null);
  const [tacticalRole, setTacticalRole] = useState("ALL");
  const [poolQuery, setPoolQuery] = useState("");
  const [poolFilter, setPoolFilter] = useState("all");
  const [mutationBusy, setMutationBusy] = useState(false);
  const selectionRef = useRef(selectedId);
  selectionRef.current = selectedId;
  const requestRef = useRef(0);
  const assignmentRef = useRef(false);
  const admin = hasManager && (!pbConfig.pbOnly || detail?.manager === true);
  useEffect(() => {
    if (params.get("preferences") === "1") setPrefsOpen(true);
    if (params.get("schedule") === "1" && hasManager) setCreateOpen(true);
  }, [params, hasManager]);
  const battle = battles.find((b) => b.id === selectedId);
  const pbPorts = pbConfig?.ports?.length ? pbConfig.ports : ports;
  const rateShips = useMemo(() => {
    if (!battle) return [];
    const allowed = pbConfig?.preferredShipCatalog?.[String(battle.rate)] ?? null;
    return (catalogue.ships ?? [])
      .filter(
        (s: any) =>
          Number(s.rate ?? s.level) === Number(battle.rate) &&
          (!Array.isArray(allowed) || allowed.includes(s.name)),
      )
      .map((s: any) => s.name)
      .sort();
  }, [battle, catalogue, pbConfig]);
  const pbBuilds = builds.filter(
    (b: any) => b.is_pb_build && (!battle || catalogue.ships.find((s: any) => s.id === b.ship_key)?.name),
  );
  async function refreshList() {
    setBattles(await api("/port-battles"));
  }
  async function load(id: string | null) {
    const request = ++requestRef.current;
    if (!id) {
      setDetail(null);
      return;
    }
    try {
      const next = await api(`/port-battles/${id}`);
      if (request !== requestRef.current || selectionRef.current !== id) return;
      setDetail(next);
      setBattles((rows) => rows.map((row) => (row.id === id ? { ...row, ...next.battle } : row)));
    } catch (e: any) {
      if (selectionRef.current === id) setNotice(e.message);
    }
  }
  useEffect(() => {
    if (selectedId && !battles.some((b) => b.id === selectedId)) setSelectedId(null);
  }, [battles, selectedId]);
  useEffect(() => {
    setDetail(null);
    setBulkSelected([]);
    void load(selectedId);
    const b = battles.find((x: any) => x.id === selectedId);
    if (b)
      emitRecent({
        kind: "battle",
        key: b.id,
        label: `Battle of ${b.port_name}`,
        href: "/dashboard/port-battles",
        metadata: {
          detail: [b.attacker, b.defender].filter(Boolean).join(" vs "),
        },
      });
  }, [selectedId]);
  useEffect(() => {
    void api("/port-battle-templates")
      .then(setServerTemplates)
      .catch(() => {});
    void api("/pb-config")
      .then(setPbConfig)
      .catch(() => {});
  }, []);
  useEffect(() => {
    const id = params.get("battle");
    if (id && id !== selectedId && battles.some((b: any) => String(b.id) === id)) setSelectedId(id);
  }, [params, battles]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && !mutationBusy && !manageOpen && !signupOpen)
        void load(selectionRef.current);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [mutationBusy, manageOpen, signupOpen]);
  async function quick(status: string) {
    if (!battle) return;
    try {
      let late = 0;
      if (status === "LATE") {
        const n = prompt(
          "How many minutes late?",
          String(detail?.signups?.find((x: any) => x.user_id === viewer.id)?.late_minutes || 5),
        );
        if (n === null) return;
        late = Math.max(5, Math.min(60, Number(n) || 5));
      }
      const self = detail?.signups?.find((x: any) => x.user_id === viewer.id);
      const profile =
        preferences?.rates?.[String(battle.rate)] ?? preferences?.rates?.[`${battle.rate}th`] ?? {};
      const ships = self?.ships?.length
        ? self.ships
        : (profile.ships ?? []).filter((x: string) => rateShips.includes(x));
      await api(`/port-battles/${battle.id}/signup`, {
        method: "POST",
        body: JSON.stringify({
          displayName: viewer.name,
          status,
          ships,
          preferredShips: self?.preferred_ships ?? profile.preferred ?? [],
          hornCapable: self?.horn_capable ?? preferences?.horn_capable ?? false,
          hornPreferred: self?.horn_preferred ?? preferences?.horn_preferred ?? false,
          flareCapabilities: self?.flare_capabilities ?? [],
          lateMinutes: late,
        }),
      });
      setNotice(
        status === "WAITLIST"
          ? "You are on the waitlist."
          : status === "LATE"
            ? `Marked Running Late (+${late}).`
            : "Attending saved.",
      );
      await load(battle.id);
    } catch (e: any) {
      setNotice(e.message);
    }
  }
  async function oneClickSignup() {
    if (!battle) return;
    const existing = detail?.signups?.some((x: any) => String(x.user_id) === viewer.id);
    if (existing) {
      setNotice("You are already signed up. Your ship choices and availability were preserved.");
      return;
    }
    const profile = preferences?.rates?.[String(battle.rate)] ?? {},
      ships = (profile.ships ?? []).filter((x: string) => rateShips.includes(x));
    if (!ships.length) {
      setNotice("Save your playable ships for this rate under Preferred Ships before using 1-Click Signup.");
      return;
    }
    try {
      await api(`/port-battles/${battle.id}/signup`, {
        method: "POST",
        body: JSON.stringify({
          onlyIfAbsent: true,
          displayName: viewer.name,
          status: "ATTENDING",
          ships,
          preferredShips: (profile.preferred ?? []).filter((x: string) => ships.includes(x)),
          hornCapable: Boolean(preferences.horn_capable && preferences.horn_requirements_ack),
          hornPreferred: Boolean(
            preferences.horn_preferred && preferences.horn_capable && preferences.horn_requirements_ack,
          ),
        }),
      });
      setNotice("Signed up using your saved ship preferences.");
      await load(battle.id);
    } catch (e: any) {
      setNotice(e.message);
    }
  }
  async function saveDetailed(form: any) {
    if (!battle) return;
    await api(`/port-battles/${battle.id}/signup`, {
      method: "POST",
      body: JSON.stringify({ ...form, displayName: viewer.name }),
    });
    setSignupOpen(false);
    await load(battle.id);
  }
  async function assign(signup: any, patch: any) {
    if (!battle || battle.status === "FINISHED") return;
    if (assignmentRef.current) {
      setNotice("Please wait for the current roster change to finish.");
      return;
    }
    if (patch.confirmedShip && !(signup.ships ?? []).includes(patch.confirmedShip)) {
      setNotice(`${signup.display_name} has not selected ${patch.confirmedShip} as a playable ship.`);
      return;
    }
    assignmentRef.current = true;
    setMutationBusy(true);
    try {
      await api(`/port-battles/${battle.id}/assignments/${signup.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...patch,
          assignmentVersion: signup.assignment_version,
        }),
      });
      await load(battle.id);
    } catch (e: any) {
      setNotice(
        e.status === 409
          ? "That captain changed in another officer session. The board has been refreshed."
          : e.message,
      );
      await load(battle.id);
    } finally {
      assignmentRef.current = false;
      setMutationBusy(false);
    }
  }
  async function undoLastAssignment() {
    if (!battle) return;
    try {
      await api(`/port-battles/${battle.id}/undo-last-assignment`, {
        method: "POST",
      });
      await load(battle.id);
      emitToast("Last roster assignment restored.", { tone: "success" });
    } catch (e: any) {
      emitToast(e.message ?? "Nothing to undo.", { tone: "warning" });
    }
  }
  async function autoPlaceSelected() {
    if (!battle || !detail || !bulkSelected.length || !canEdit || assignmentRef.current) return;
    assignmentRef.current = true;
    setMutationBusy(true);
    try {
      const selected = detail.signups.filter((x: any) => bulkSelected.includes(x.id) && !x.confirmed_ship);
      const counts: Record<string, number> = {};
      for (const s of detail.signups.filter((x: any) => x.confirmed_ship))
        counts[s.confirmed_ship] = (counts[s.confirmed_ship] ?? 0) + 1;
      let placed = 0,
        failed = 0,
        skipped = 0;
      for (const s of selected) {
        const candidates = [...(s.preferred_ships ?? []), ...(s.ships ?? [])].filter(
          (x: string, i: number, a: string[]) =>
            a.indexOf(x) === i && rateShips.includes(x) && (s.ships ?? []).includes(x),
        );
        if (!candidates.length) {
          skipped++;
          continue;
        }
        const ship =
          draftShips[s.id] ||
          candidates.sort((a: string, b: string) => {
            const av = Number(targets[a] ?? 0) - Number(counts[a] ?? 0),
              bv = Number(targets[b] ?? 0) - Number(counts[b] ?? 0);
            return bv - av;
          })[0];
        try {
          await api(`/port-battles/${battle.id}/assignments/${s.id}`, {
            method: "PUT",
            body: JSON.stringify({
              confirmedShip: ship,
              status: "ATTENDING",
              assignmentVersion: s.assignment_version,
            }),
          });
          counts[ship] = (counts[ship] ?? 0) + 1;
          placed++;
        } catch {
          failed++;
        }
      }
      setBulkSelected([]);
      await load(battle.id);
      emitToast(
        `${placed} captain${placed === 1 ? "" : "s"} placed.${skipped ? ` ${skipped} need ship choices.` : ""}${failed ? ` ${failed} could not be placed; refresh and retry.` : ""}`,
        {
          tone: placed ? "success" : "warning",
        },
      );
    } finally {
      assignmentRef.current = false;
      setMutationBusy(false);
    }
  }
  async function dropTo(ship: string | null, status = "ATTENDING") {
    if (!dragId || !detail || !canEdit || mutationBusy || assignmentRef.current) return;
    const ids = bulkSelected.includes(dragId) ? bulkSelected : [dragId];
    assignmentRef.current = true;
    setMutationBusy(true);
    let failed = 0;
    try {
      for (const id of ids) {
        const s = detail.signups.find((x: any) => x.id === id);
        if (!s) continue;
        const chosen =
          status === "WAITLIST"
            ? null
            : draftShips[id] ||
              ship ||
              (s.preferred_ships ?? []).find((x: string) => (s.ships ?? []).includes(x)) ||
              (s.ships ?? [])[0];
        if (status !== "WAITLIST" && (!chosen || !(s.ships ?? []).includes(chosen))) {
          failed++;
          continue;
        }
        try {
          await api(`/port-battles/${battle.id}/assignments/${s.id}`, {
            method: "PUT",
            body: JSON.stringify({ confirmedShip: chosen, status, assignmentVersion: s.assignment_version }),
          });
        } catch {
          failed++;
        }
      }
      await load(battle.id);
      setBulkSelected([]);
      if (failed) setNotice(`${failed} Captains Could Not Be Placed. Check Ship Choices And Fleet Capacity.`);
    } finally {
      assignmentRef.current = false;
      setMutationBusy(false);
      setDragId(null);
    }
  }
  async function saveTargets(values: Record<string, number>) {
    if (!battle) return;
    await api(`/port-battles/${battle.id}/targets`, {
      method: "PUT",
      body: JSON.stringify({ shipTargets: values, revision: battle.revision }),
    });
    await refreshList();
    await load(battle.id);
  }
  async function savePreferences(next: any) {
    await api("/pb-preferences", {
      method: "PUT",
      body: JSON.stringify({
        rates: next.rates,
        hornCapable: next.horn_capable,
        hornPreferred: next.horn_preferred,
        hornRequirementsAck: next.horn_requirements_ack,
      }),
    });
    setPreferences(next);
    setPrefsOpen(false);
    setNotice("Preferred ships saved. Quick signups can now reuse them.");
  }
  async function addGuest(form: any) {
    if (!battle) return;
    await api(`/port-battles/${battle.id}/guests`, {
      method: "POST",
      body: JSON.stringify(form),
    });
    setGuestOpen(false);
    await load(battle.id);
    setNotice(`Added ${form.name} to the signup.`);
  }
  async function manageBattle(form: any) {
    if (!battle) return;
    await api(`/port-battles/${battle.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...form, revision: battle.revision }),
    });
    setManageOpen(false);
    await refreshList();
    await load(battle.id);
    setNotice("Port Battle updated.");
  }
  async function copyPreviousRoster() {
    if (!battle) return;
    if (
      !confirm(
        "Copy the most recent finished roster for this rate into this battle? Existing captain assignments may be updated.",
      )
    )
      return;
    try {
      const r = await api(`/port-battles/${battle.id}/copy-previous-roster`, {
        method: "POST",
      });
      await load(battle.id);
      setNotice(
        `Copied ${r.copied} captains from ${r.sourceBattle?.portName ?? "the previous roster"}${r.warnings?.length ? ` · ${r.warnings.length} warnings` : ""}.`,
      );
    } catch (e: any) {
      setNotice(e.message);
    }
  }
  async function searchArchive(q = archiveQuery) {
    try {
      const rows = await api(`/port-battle-archive?q=${encodeURIComponent(q)}`);
      setArchiveRows(rows);
      setArchiveOpen(true);
    } catch (e: any) {
      setNotice(e.message);
    }
  }
  async function openAnalytics() {
    try {
      setAnalytics(await api("/port-battle-analytics"));
      setAnalyticsOpen(true);
    } catch (e: any) {
      setNotice(e.message);
    }
  }
  async function openTactical(role = "ALL") {
    if (!battle) return;
    try {
      setTacticalRole(role);
      setTacticalData(await api(`/port-battles/${battle.id}/tactical-briefs`));
      setTacticalOpen(true);
    } catch (e: any) {
      setNotice(e.message);
    }
  }
  async function saveServerTemplate(name: string, notes = "") {
    if (!battle) return;
    await api("/port-battle-templates", {
      method: "POST",
      body: JSON.stringify({
        name,
        rate: battle.rate,
        teamSize: battle.team_size,
        shipTargets: targets,
        commanderSlots: detail?.battle?.commander_slots ?? {},
        notes,
      }),
    });
    setServerTemplates(await api("/port-battle-templates"));
    emitToast("Fleet template saved.", { tone: "success" });
  }
  async function applyServerTemplate(t: any) {
    if (!battle) return;
    await saveTargets(t.ship_targets ?? {});
    setTemplateOpen(false);
    emitToast(`Applied ${t.name}.`, { tone: "success" });
  }
  async function recordAttendance(signup: any, outcome: string) {
    if (!battle || !signup?.user_id) return;
    let minutesLate = 0,
      note = "";
    if (outcome === "LATE") {
      const v = prompt(
        "Minutes late:",
        String(signup.attendance_outcome?.minutes_late ?? signup.late_minutes ?? 5),
      );
      if (v === null) return;
      minutesLate = Math.max(0, Math.min(240, Number(v) || 0));
    }
    if (outcome === "CANCELLED" || outcome === "NO_SHOW") {
      note =
        prompt(
          outcome === "CANCELLED" ? "Optional cancellation note:" : "Optional no-show note:",
          signup.attendance_outcome?.note ?? "",
        ) ?? "";
    }
    try {
      await api(`/port-battles/${battle.id}/attendance/${signup.user_id}`, {
        method: "PUT",
        body: JSON.stringify({ outcome, minutesLate, note }),
      });
      await load(battle.id);
      emitToast(`Attendance marked ${outcome.replaceAll("_", " ").toLowerCase()}.`, { tone: "success" });
    } catch (e: any) {
      setNotice(e.message);
    }
  }
  async function createBattle(form: any) {
    const port = pbPorts.find((p: any) => p.name === form.portName);
    if (!port) {
      setNotice("Choose a valid Port Battle port.");
      return;
    }
    const r = await api("/port-battles", {
      method: "POST",
      body: JSON.stringify({
        signupGuild: form.signupGuild,
        portName: port.name,
        attacker: form.attacker,
        defender: form.defender,
        startsAt: form.startsAt,
        shipTargets: pbConfig?.defaultShipTargets?.[port.name] ?? {},
      }),
    });
    setCreateOpen(false);
    await refreshList();
    setSelectedId(r.id);
  }
  function inspectBattle() {
    if (!battle) return;
    emitInspector({
      kind: "Port Battle",
      title: `Battle of ${battle.port_name}`,
      subtitle: `${battle.attacker || "Attacker"} vs ${battle.defender || "Defender"}`,
      href: `/dashboard/port-battles?battle=${encodeURIComponent(String(battle.id))}`,
      fields: [
        { label: "Rate", value: rateLabel(battle.rate) },
        { label: "Format", value: `${battle.team_size}v${battle.team_size}` },
        { label: "Starts", value: fmt(battle.starts_at) },
        { label: "Status", value: battle.status },
        {
          label: "Confirmed",
          value: `${confirmed.length}/${battle.team_size}`,
        },
        { label: "Waitlist", value: waitlist.length },
      ],
      actions: [
        {
          label: "Open battle",
          href: `/dashboard/port-battles?battle=${encodeURIComponent(String(battle.id))}`,
          primary: true,
        },
      ],
    });
  }
  function inspectCaptain(s: any) {
    const fields: any[] = [
      {
        label: "Playable ships",
        value: (s.ships ?? []).join(", ") || "None selected",
      },
      {
        label: "Preferred",
        value: (s.preferred_ships ?? []).join(", ") || "None selected",
      },
      { label: "Horn Capable", value: s.horn_capable ? "Yes" : "No" },
      {
        label: "Flare volunteering",
        value: (s.flare_capabilities ?? []).join(", ") || "None",
      },
      { label: "Flare duty", value: s.flare_duty ?? "None" },
      {
        label: "Running Late",
        value: Number(s.late_minutes) > 0 ? `${s.late_minutes} minutes` : "No",
      },
      { label: "Formation", value: s.formation ?? "Not assigned" },
      { label: "Commander duty", value: s.commander_duty ?? "None" },
    ];
    if (admin && s.participation_priority)
      fields.push({
        label: "Recent participation",
        value: `Signed up ${s.participation_priority.signedUp}, not confirmed ${s.participation_priority.missed}, confirmed ${s.participation_priority.confirmed} across the last ${s.participation_priority.window} completed battles. Advisory only.`,
      });
    if (admin)
      fields.push({
        label: "Reliability",
        value: s.reliability == null ? "Not enough recorded outcomes" : `${s.reliability}%`,
      });
    emitInspector({
      kind: "Captain",
      title: String(s.display_name ?? "Captain"),
      subtitle: s.confirmed_ship
        ? `Assigned to ${s.confirmed_ship}`
        : s.signup_status === "WAITLIST"
          ? "Waitlist"
          : "Signup pool",
      fields,
    });
  }
  const signups = detail?.signups ?? [],
    confirmed = signups.filter((x: any) => x.confirmed_ship),
    pending = signups.filter((x: any) => !x.confirmed_ship && x.signup_status !== "WAITLIST"),
    waitlist = signups.filter((x: any) => !x.confirmed_ship && x.signup_status === "WAITLIST"),
    targets = detail?.battle?.ship_targets ?? battle?.ship_targets ?? {};
  const targetShips = [
    ...new Set([...Object.keys(targets), ...confirmed.map((x: any) => x.confirmed_ship), ...rateShips]),
  ].filter(Boolean);
  const self = signups.find((x: any) => x.user_id === viewer.id);
  const targetShortfall = Object.entries(targets).reduce(
      (n, [ship, target]: any) =>
        n + Math.max(0, Number(target || 0) - confirmed.filter((x: any) => x.confirmed_ship === ship).length),
      0,
    ),
    lateCount = signups.filter((x: any) => Number(x.late_minutes) > 0).length,
    hornCount = confirmed.filter((x: any) => x.horn_duty).length,
    flareCount = confirmed.filter((x: any) => x.flare_duty).length,
    commandCount = confirmed.filter((x: any) => x.commander_duty).length,
    rosterReady = Boolean(battle && confirmed.length >= Number(battle.team_size));
  const shipShortages = Object.entries(targets)
    .map(([ship, target]: any) => ({
      ship,
      missing: Math.max(
        0,
        Number(target || 0) - confirmed.filter((x: any) => x.confirmed_ship === ship).length,
      ),
    }))
    .filter((x) => x.missing > 0);
  const requiredCommanderSlots = Object.keys(detail?.battle?.commander_slots ?? {});
  const missingRoles = [
    !confirmed.some((x: any) => x.horn_duty === "Primary Horn") ? "Primary Horn" : null,
    ...requiredCommanderSlots.filter(
      (role: string) => !confirmed.some((x: any) => x.commander_duty === role),
    ),
  ].filter(Boolean);
  const readinessScore = battle
    ? Math.max(
        0,
        Math.round(
          100 *
            (0.55 * Math.min(1, confirmed.length / Math.max(1, Number(battle.team_size))) +
              0.25 *
                (targetShortfall === 0
                  ? 1
                  : Math.max(0, 1 - targetShortfall / Math.max(1, Number(battle.team_size)))) +
              0.2 * (missingRoles.length === 0 ? 1 : 0.5)),
        ),
      )
    : 0;
  const canEdit = admin && ["OPEN", "CLOSED"].includes(battle?.status);
  const matchesPool = (captain: any) => {
    const q = poolQuery.trim().toLowerCase();
    if (q && !`${captain.display_name} ${(captain.ships ?? []).join(" ")}`.toLowerCase().includes(q))
      return false;
    return (
      poolFilter === "all" ||
      (poolFilter === "ships" && (captain.ships ?? []).length > 0) ||
      (poolFilter === "missing" && !(captain.ships ?? []).length) ||
      (poolFilter === "priority" && Number(captain.participation_priority?.missed) > 0) ||
      (poolFilter === "horn" && captain.horn_capable) ||
      (poolFilter === "late" && Number(captain.late_minutes) > 0)
    );
  };
  const visiblePending = pending.filter(matchesPool),
    visibleWaitlist = waitlist.filter(matchesPool);
  return (
    <div className="pbExperience">
      <header className="pbCommandHeading">
        <div>
          <span className="eyebrow">FLEET OPERATIONS</span>
          <h1>Port Battles</h1>
          <p>Build the fleet. Give every captain a place.</p>
        </div>
        <div className="controlRow">
          <button className="outlineButton" onClick={() => setPrefsOpen(true)}>
            Preferred Ships
          </button>
          {admiralty && (
            <>
              <button
                className="outlineButton"
                onClick={async () => {
                  try {
                    const info = await api("/pb-reconcile/preview");
                    if (
                      !confirm(
                        `Reconcile Discord panels for ${info.active} live battles and ${info.retiredWithCards} retired records with stored cards? This won't cancel battles.`,
                      )
                    )
                      return;
                    await api("/pb-reconcile", { method: "POST" });
                    setNotice(
                      "Discord panel reconciliation queued. Recheck after the next controller sweep.",
                    );
                  } catch (e: any) {
                    setNotice(`Reconcile failed: ${e.message}`);
                  }
                }}
              >
                Reconcile Discord Panels
              </button>
              <button className="outlineButton" onClick={() => setResetOpen(true)}>
                Reset Active Battles
              </button>
            </>
          )}
          {hasManager && (
            <button className="goldButton" onClick={() => setCreateOpen(true)}>
              Schedule Battle
            </button>
          )}
          <details className="pbToolMenu">
            <summary>More Tools</summary>
            <div>
              {!pbConfig.pbOnly && (
                <>
                  <Link href="/dashboard/ship-builder">PB Builds</Link>
                  <Link href="/dashboard/after-action-reports">After Action Reports</Link>
                </>
              )}
            </div>
          </details>
        </div>
      </header>
      {notice && (
        <button className="notice" role="status" onClick={() => setNotice("")}>
          {notice}
        </button>
      )}
      {!selectedId && (
        <div className="pbOverview">
          <aside className="panel pbBattleList">
            <h2>Scheduled Battles</h2>
            {battles
              .filter((b) => ["OPEN", "CLOSED"].includes(b.status))
              .map((b) => (
                <button className="outlineButton" key={b.id} onClick={() => setSelectedId(b.id)}>
                  <b>Battle of {b.port_name}</b>
                  <span>
                    {b.attacker} vs {b.defender}
                  </span>
                  <small>{fmt(b.starts_at)}</small>
                </button>
              ))}
            {!battles.some((b) => ["OPEN", "CLOSED"].includes(b.status)) && (
              <p className="uiEmpty">No Port Battles Scheduled</p>
            )}
            <Link href="/dashboard/after-action-reports">After Action Reports →</Link>
          </aside>
          <TerritoryMap
            mapData={mapData}
            battles={battles}
            config={pbConfig}
            manager={hasManager && !pbConfig.pbOnly}
          />
        </div>
      )}
      {selectedId && (
        <button className="outlineButton" onClick={() => setSelectedId(null)}>
          ← All Port Battles
        </button>
      )}
      {!selectedId ? null : !battles.length ? (
        <section className="panel pbEmptyWorkspace">
          <div className="pbEmptyGlyph" aria-hidden="true">
            ⚔
          </div>
          <div className="pbEmptyCopy">
            <span className="cardKicker">FLEET SCHEDULE</span>
            <h2>No Port Battles Scheduled</h2>
            <p>
              When a battle is scheduled, its signup status, roster planning, ship targets, assignments and
              Discord preview will all appear here.
            </p>
            <div className="pbEmptyActions">
              {hasManager && (
                <button className="goldButton" onClick={() => setCreateOpen(true)}>
                  Schedule Port Battle
                </button>
              )}
              <button className="outlineButton" onClick={() => setPrefsOpen(true)}>
                Set Preferred Ships
              </button>
              {!pbConfig.pbOnly && (
                <Link className="outlineButton" href="/dashboard/ship-builder">
                  Browse PB Builds
                </Link>
              )}
            </div>
          </div>
        </section>
      ) : (
        <div className="pbShell pbPlanningShell">
          <section className="pbScheduleBar">
            <label>
              Current Battle
              <select
                aria-label="Current Battle"
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {battles.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.port_name} · {b.signup_guild || "BOM"} · {fmt(b.starts_at)} · {b.status}
                  </option>
                ))}
              </select>
            </label>
            <details className="pbScheduleDetails">
              <summary>Browse Schedule · {battles.length}</summary>
              <div>
                {battles.map((b) => (
                  <button
                    className={selectedId === b.id ? "active" : ""}
                    key={b.id}
                    onClick={() => setSelectedId(b.id)}
                  >
                    <b>{b.port_name}</b>
                    <span>
                      {b.attacker || "Attacker"} vs {b.defender || "Defender"}
                    </span>
                    <small>{fmt(b.starts_at)}</small>
                  </button>
                ))}
              </div>
            </details>
            <button
              className="outlineButton"
              disabled={mutationBusy}
              onClick={() =>
                void Promise.all([refreshList(), load(selectedId)]).catch((e) => setNotice(e.message))
              }
            >
              ↻ Refresh Board
            </button>
          </section>
          <main>
            {battle && detail?.battle?.id === battle.id ? (
              <>
                {admin && !pbConfig.pbOnly && battle.status === "OPEN" && (
                  <PortBattleInvitations battleId={battle.id} />
                )}
                <section className="pbBattleHeader panel">
                  <div className="pbBattleIdentity">
                    <span className="cardKicker">
                      {battle.signup_guild || "BOM"} · {battle.status}
                    </span>
                    <h2>Battle of {battle.port_name}</h2>
                    <p>
                      <strong>{battle.attacker || "Attacker"}</strong> <span>vs</span>{" "}
                      <strong>{battle.defender || "Defender"}</strong> · {rateLabel(battle.rate)} ·{" "}
                      {battle.team_size}v{battle.team_size} · {fmt(battle.starts_at)}
                    </p>
                  </div>
                  <div className="pbBattleCount">
                    <b>
                      {confirmed.length}
                      <span>/{battle.team_size}</span>
                    </b>
                    <small>Confirmed · {Math.max(0, battle.team_size - confirmed.length)} Places Open</small>
                  </div>
                  <div className="pbBattleActions">
                    <details className="pbToolMenu">
                      <summary>My Signup{self ? " · Signed Up" : ""}</summary>
                      <div>
                        {battle.status === "OPEN" ? (
                          <>
                            <button
                              disabled={!signupAllowed}
                              title={
                                !signupAllowed
                                  ? "Signups require the configured guild role for this battle. Ask an officer to review your roles."
                                  : undefined
                              }
                              onClick={() => void oneClickSignup()}
                            >
                              1-Click Signup
                            </button>
                            <button
                              disabled={!signupAllowed}
                              title={
                                !signupAllowed
                                  ? "Signups require the configured guild role for this battle. Ask an officer to review your roles."
                                  : undefined
                              }
                              onClick={() => setSignupOpen(true)}
                            >
                              Detailed Signup
                            </button>
                            <button
                              disabled={!signupAllowed}
                              title={
                                !signupAllowed
                                  ? "Signups require the configured guild role for this battle. Ask an officer to review your roles."
                                  : undefined
                              }
                              onClick={() => void quick("LATE")}
                            >
                              Running Late
                            </button>
                            <button
                              disabled={!signupAllowed}
                              title={
                                !signupAllowed
                                  ? "Signups require the configured guild role for this battle. Ask an officer to review your roles."
                                  : undefined
                              }
                              onClick={() => void quick("WAITLIST")}
                            >
                              Join Waitlist
                            </button>
                          </>
                        ) : (
                          <small>Signups are closed.</small>
                        )}
                      </div>
                    </details>
                    {admin && (
                      <>
                        <button
                          className="outlineButton"
                          onClick={() => void undoLastAssignment()}
                          disabled={!canEdit || mutationBusy}
                        >
                          ↶ Undo
                        </button>
                        <details className="pbToolMenu">
                          <summary>Fleet Tools</summary>
                          <div>
                            {!pbConfig.pbOnly && (
                              <>
                                <button
                                  disabled={!canEdit || mutationBusy}
                                  onClick={() => void copyPreviousRoster()}
                                >
                                  Copy Previous Roster
                                </button>
                                <button
                                  disabled={!canEdit || mutationBusy}
                                  onClick={() => setTemplateOpen(true)}
                                >
                                  Fleet Templates
                                </button>
                                <button onClick={() => void openTactical("ALL")}>Tactical Briefs</button>
                              </>
                            )}
                            <button onClick={() => setManageOpen(true)}>Manage Battle / AAR</button>
                          </div>
                        </details>
                      </>
                    )}
                    <button className="outlineButton" onClick={inspectBattle}>
                      Battle Details
                    </button>
                    {admin && ["OPEN", "CLOSED", "CANCELLED"].includes(battle.status) && (
                      <CancelPortBattle battle={battle} onChanged={() => window.location.reload()} />
                    )}
                  </div>
                </section>
                <section className="pbReadinessCompact" aria-label="Fleet readiness">
                  <div className="pbReadinessSignals">
                    <span className={rosterReady ? "ready" : "attention"}>
                      {Math.max(0, battle.team_size - confirmed.length)} Places Open
                    </span>
                    <span className={missingRoles.length ? "attention" : "ready"}>
                      {missingRoles.length ? missingRoles.join(" · ") + " Missing" : "Command Roles Covered"}
                    </span>
                    <span className={targetShortfall ? "attention" : "ready"}>
                      {targetShortfall ? `${targetShortfall} Target Ships Needed` : "Ship Targets Covered"}
                    </span>
                    {lateCount > 0 && <span>{lateCount} Running Late</span>}
                    <span>{waitlist.length} Waitlisted</span>
                  </div>
                  <details>
                    <summary>Readiness - {readinessScore}%</summary>
                    <p>
                      {shipShortages.length
                        ? shipShortages.map((x) => `${x.ship} ×${x.missing}`).join(" · ")
                        : "All ship targets are covered."}
                    </p>
                    <p>
                      {hornCount} Horn duties · {flareCount} flare duties · {commandCount} commanders. Targets
                      are guidance; officers control assignments.
                    </p>
                  </details>
                </section>
                <BattleCoordination
                  battle={battle}
                  manager={admin && !pbConfig.pbOnly}
                  onChanged={() => void load(battle.id)}
                />
                <section className="pbRosterBoard">
                  <div className="panel pbPool">
                    <div className="panelHead">
                      <div>
                        <h3>Signup Pool</h3>
                        <SavedViewControl
                          section="pb-pool"
                          state={{ query: poolQuery, filter: poolFilter }}
                          onApply={(s) => {
                            setPoolQuery(String(s.query ?? ""));
                            setPoolFilter(
                              ["all", "ships", "missing", "priority", "horn", "late"].includes(s.filter)
                                ? s.filter
                                : "all",
                            );
                          }}
                        />
                      </div>
                      <div className="controlRow">
                        {admin && bulkSelected.length > 0 && (
                          <button className="tinyButton" onClick={() => void autoPlaceSelected()}>
                            Auto-Place {bulkSelected.length}
                          </button>
                        )}
                        {canEdit && (
                          <button className="tinyButton" onClick={() => setGuestOpen(true)}>
                            Add Guest
                          </button>
                        )}
                        <b>{pending.length}</b>
                      </div>
                    </div>
                    <div className="pbPoolFilters">
                      <input
                        aria-label="Search signup pool"
                        placeholder="Search captain or ship…"
                        value={poolQuery}
                        onChange={(e) => setPoolQuery(e.target.value)}
                      />
                      <select
                        aria-label="Filter signup pool"
                        value={poolFilter}
                        onChange={(e) => setPoolFilter(e.target.value)}
                      >
                        <option value="all">All Captains</option>
                        <option value="ships">Playable Ships Selected</option>
                        <option value="missing">Needs Ship Choices</option>
                        <option value="priority">Missed Recent Fleets</option>
                        <option value="horn">Horn Capable</option>
                        <option value="late">Running Late</option>
                      </select>
                      <small>
                        {visiblePending.length} of {pending.length} captains shown
                        {mutationBusy ? " · Saving…" : ""}
                      </small>
                    </div>
                    {!visiblePending.length && (
                      <p className="muted">
                        {pending.length
                          ? "No captains match these filters."
                          : "All current signups are assigned or Waitlisted."}
                      </p>
                    )}
                    {visiblePending.map((s: any) => (
                      <Captain
                        key={s.id}
                        signup={s}
                        draggable={canEdit && !mutationBusy}
                        selected={bulkSelected.includes(s.id)}
                        onSelect={() =>
                          setBulkSelected((x) =>
                            x.includes(s.id) ? x.filter((id) => id !== s.id) : [...x, s.id],
                          )
                        }
                        onDrag={() => setDragId(s.id)}
                        onInspect={() => inspectCaptain(s)}
                        availableShips={rateShips}
                        onAssignShip={
                          canEdit && !mutationBusy
                            ? (ship: string) => setDraftShips((x) => ({ ...x, [s.id]: ship }))
                            : undefined
                        }
                        draftShip={draftShips[s.id] ?? ""}
                        onQuickAssign={
                          canEdit && !mutationBusy
                            ? () => {
                                const ship = [...(s.preferred_ships ?? []), ...(s.ships ?? [])].find(
                                  (x: string) => rateShips.includes(x) && (s.ships ?? []).includes(x),
                                );
                                if (ship)
                                  void assign(s, {
                                    confirmedShip: ship,
                                    status: "ATTENDING",
                                  });
                                else
                                  setNotice(`${s.display_name} has no playable ship selected for this rate.`);
                              }
                            : undefined
                        }
                      />
                    ))}
                    <div
                      className="pbDropZone wait"
                      onDragOver={(e) => {
                        if (canEdit) e.preventDefault();
                      }}
                      onDrop={() => void dropTo(null, "WAITLIST")}
                    >
                      <b>Waitlist</b>

                      {visibleWaitlist.map((s: any) => (
                        <Captain
                          key={s.id}
                          signup={s}
                          draggable={canEdit && !mutationBusy}
                          selected={false}
                          onSelect={() => {}}
                          onDrag={() => setDragId(s.id)}
                          onInspect={() => inspectCaptain(s)}
                          availableShips={rateShips}
                          onAssignShip={
                            canEdit && !mutationBusy
                              ? (ship: string) => void assign(s, { confirmedShip: ship, status: "ATTENDING" })
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  </div>
                  <div className="panel pbFleet">
                    <div className="panelHead">
                      <div>
                        <h3>Confirmed Fleet</h3>
                        <span>Drag/drop assignments · click controls to refine duties</span>
                      </div>
                      {canEdit && (
                        <TargetsButton
                          key={battle.id}
                          ships={rateShips}
                          current={targets}
                          teamSize={battle.team_size}
                          rate={battle.rate}
                          onSave={saveTargets}
                        />
                      )}
                    </div>
                    <div className="pbShipColumns">
                      {targetShips
                        .filter(
                          (ship: string) =>
                            confirmed.some((x: any) => x.confirmed_ship === ship) ||
                            Number(targets[ship] ?? 0) > 0,
                        )
                        .map((shipName: string) => {
                          const rows = confirmed.filter((x: any) => x.confirmed_ship === shipName),
                            target = targets[shipName];
                          return (
                            <section
                              key={shipName}
                              className="pbShipGroup"
                              onDragOver={(e) => {
                                if (canEdit) e.preventDefault();
                              }}
                              onDrop={() => void dropTo(shipName)}
                            >
                              <header>
                                <b>{shipName}</b>
                                <span>
                                  {rows.length}
                                  {target != null ? `/${target}` : ""}
                                </span>
                              </header>
                              {rows.map((s: any) => (
                                <AssignedCaptain
                                  key={s.id}
                                  signup={s}
                                  admin={admin}
                                  finished={battle.status === "FINISHED"}
                                  tacticalAllowed={!pbConfig.pbOnly}
                                  builds={pbBuilds}
                                  onDrag={() => setDragId(s.id)}
                                  onChange={(p) => assign(s, p)}
                                  onAttendance={(outcome) => recordAttendance(s, outcome)}
                                  onInspect={() => inspectCaptain(s)}
                                  availableShips={rateShips}
                                  onAssignShip={
                                    canEdit && !mutationBusy
                                      ? (ship: string) =>
                                          void assign(s, { confirmedShip: ship, status: "ATTENDING" })
                                      : undefined
                                  }
                                  onTactical={(role) => void openTactical(role)}
                                />
                              ))}
                              {canEdit && (
                                <div className={`pbEmptyDrop pbSingleDrop ${dragId ? "dropActive" : ""}`}>
                                  Drop a captain here
                                  {target != null && Number(target) > rows.length
                                    ? ` · ${Number(target) - rows.length} needed`
                                    : ""}
                                </div>
                              )}
                            </section>
                          );
                        })}
                      {!confirmed.length && (
                        <div className="pbBoardEmpty">
                          No confirmed captains yet. Drag a captain here or double-click a signup to place
                          them; ship targets are planning guidance, not hard limits.
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </>
            ) : (
              <section className="panel pbSelectionEmpty">
                <div>
                  <span className="cardKicker">PORT BATTLE</span>
                  <h2>{selectedId ? "Loading battle…" : "Select a Battle"}</h2>
                  <p className="muted">
                    Choose a scheduled battle from the left to open its signup and roster workspace.
                  </p>
                </div>
              </section>
            )}
          </main>
        </div>
      )}
      {resetOpen && admiralty && (
        <PbResetModal
          onClose={() => setResetOpen(false)}
          onReset={async () => {
            await refreshList();
            setSelectedId(null);
            setDetail(null);
          }}
        />
      )}
      {signupOpen && battle && (
        <DetailedSignup
          battle={battle}
          ships={rateShips}
          current={self}
          profile={preferences}
          onClose={() => setSignupOpen(false)}
          onSave={saveDetailed}
        />
      )}{" "}
      {createOpen && hasManager && (
        <CreateBattle
          activeBattles={battles}
          ports={pbPorts}
          guilds={pbConfig?.guilds ?? []}
          ownerTags={pbConfig.pbOnly ? pbConfig.alliedPB?.managerTags : undefined}
          gameTimeOffsetMinutes={Number(pbConfig?.gameTimeOffsetMinutes ?? 60)}
          onClose={() => setCreateOpen(false)}
          onSubmit={createBattle}
        />
      )}{" "}
      {prefsOpen && (
        <PreferredShipsModal
          catalogue={catalogue}
          allowed={pbConfig?.preferredShipCatalog ?? {}}
          current={preferences}
          onClose={() => setPrefsOpen(false)}
          onSave={savePreferences}
        />
      )}{" "}
      {guestOpen && admin && battle && (
        <GuestSignupModal ships={rateShips} onClose={() => setGuestOpen(false)} onSave={addGuest} />
      )}{" "}
      {manageOpen && admin && battle && (
        <ManageBattleModal
          allowOwnerChange={!pbConfig.pbOnly}
          battle={{ ...battle, review: detail?.review }}
          ports={pbPorts}
          guilds={pbConfig?.guilds ?? []}
          gameTimeOffsetMinutes={Number(pbConfig?.gameTimeOffsetMinutes ?? 60)}
          onClose={() => setManageOpen(false)}
          onSave={manageBattle}
        />
      )}{" "}
      {archiveOpen && (
        <ArchiveModal
          query={archiveQuery}
          setQuery={setArchiveQuery}
          rows={archiveRows}
          onSearch={searchArchive}
          onClose={() => setArchiveOpen(false)}
        />
      )}{" "}
      {analyticsOpen && analytics && (
        <PbAnalyticsModal data={analytics} onClose={() => setAnalyticsOpen(false)} />
      )}{" "}
      {templateOpen && admin && battle && (
        <FleetTemplateModal
          templates={serverTemplates.filter((x: any) => !x.rate || Number(x.rate) === Number(battle.rate))}
          battle={battle}
          onApply={applyServerTemplate}
          onSave={saveServerTemplate}
          onClose={() => setTemplateOpen(false)}
        />
      )}{" "}
      {tacticalOpen && admin && battle && tacticalData && (
        <TacticalBriefModal
          battle={battle}
          data={tacticalData}
          initialRole={tacticalRole}
          onClose={() => setTacticalOpen(false)}
          onRefresh={async () => setTacticalData(await api(`/port-battles/${battle.id}/tactical-briefs`))}
        />
      )}
    </div>
  );
}
