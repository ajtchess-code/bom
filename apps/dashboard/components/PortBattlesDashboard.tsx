"use client";
import ScheduleMessagePreview from "./DiscordPayloadPreview";
import SavedViewControl from "./SavedViewControl";
import BattleCoordination from "./BattleCoordination";
import BattleHourButtons from './BattleHourButtons';
import CancelPortBattle from "./CancelPortBattle";
import { useEffect, useMemo, useRef, useState } from "react";
import {createPortal} from "react-dom";
import PortBattleInvitations from "./PortBattleInvitations";
import TerritoryMap from "./TerritoryMap";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  emitInspector,
  emitRecent,
  emitToast,
  usePersistedState,
} from "@/lib/dashboardQoL";

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
const base = "/api/internal/wosb";
async function api(path: string, init: RequestInit = {}) {
  const h = new Headers(init.headers);
  if (init.body && !h.has("content-type"))
    h.set("content-type", "application/json");
  const r = await fetch(`${base}${path}`, {
    ...init,
    headers: h,
    cache: "no-store",
  });
  const t = await r.text();
  let j: any = {};
  try {
    j = t ? JSON.parse(t) : {};
  } catch {
    j = { error: t };
  }
  if (!r.ok)
    throw Object.assign(
      new Error(j.message ?? j.error ?? `Request failed (${r.status})`),
      { status: r.status, data: j },
    );
  return j;
}
function fmt(v: any) {
  return v
    ? new Date(v).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Time TBD";
}
function rateLabel(r: any) {
  const n = Number(r);
  return n
    ? `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"} Rate`
    : "Rate TBD";
}
function localDateKey(d = new Date()) {
  const y = d.getFullYear(),
    m = String(d.getMonth() + 1).padStart(2, "0"),
    day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function shiftedLocalDate(offsetDays = 0) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return localDateKey(d);
}
function gameSelectionToIso(date: string, hour: number, offsetMinutes: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(
    y,
    m - 1,
    d,
    Number(hour) || 0,
    Number(offsetMinutes) || 0,
    0,
    0,
  ).toISOString();
}
function gameSelectionFromIso(value: any, offsetMinutes: number) {
  const shifted = new Date(
    new Date(value).getTime() - (Number(offsetMinutes) || 0) * 60000,
  );
  return { date: localDateKey(shifted), hour: shifted.getHours() };
}
function cleanName(v: any) {
  return String(v ?? "").trim();
}
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
  const [resetOpen,setResetOpen]=useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(params.get("battle"));
  useEffect(()=>{const id=params.get('battle');if(id)setSelectedId(id)},[params]);
  const [draftShips,setDraftShips]=useState<Record<string,string>>({});
  useEffect(()=>{const close=(e:Event)=>{document.querySelectorAll<HTMLDetailsElement>('.pbToolMenu[open]').forEach(el=>{if(e.type==='keydown'?(e as KeyboardEvent).key==='Escape':!el.contains(e.target as Node))el.open=false;});};document.addEventListener('pointerdown',close);document.addEventListener('keydown',close);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',close);};},[]);
  const [detail, setDetail] = useState<any>(null);
  const [notice, setNotice] = useState("");
  const [signupOpen, setSignupOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [preferences, setPreferences] = useState(
    initialPreferences ?? { rates: {}, horn_preferred: false },
  );
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
  const [poolQuery,setPoolQuery]=useState('');
  const [poolFilter,setPoolFilter]=useState('all');
  const [mutationBusy,setMutationBusy]=useState(false);
  const selectionRef=useRef(selectedId);selectionRef.current=selectedId;
  const requestRef=useRef(0);
  const assignmentRef=useRef(false);
  const admin = hasManager && (!pbConfig.pbOnly || detail?.manager === true);
  useEffect(() => {
    if (params.get("preferences") === "1") setPrefsOpen(true);
    if (params.get("schedule") === "1" && hasManager) setCreateOpen(true);
  }, [params, hasManager]);
  const battle = battles.find((b) => b.id === selectedId);
  const pbPorts = pbConfig?.ports?.length ? pbConfig.ports : ports;
  const rateShips = useMemo(() => {
    if (!battle) return [];
    const allowed =
      pbConfig?.preferredShipCatalog?.[String(battle.rate)] ?? null;
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
    (b: any) =>
      b.is_pb_build &&
      (!battle || catalogue.ships.find((s: any) => s.id === b.ship_key)?.name),
  );
  async function refreshList() {
    setBattles(await api("/port-battles"));
  }
  async function load(id:string|null){
    const request=++requestRef.current;if(!id){setDetail(null);return;}
    try{const next=await api(`/port-battles/${id}`);if(request!==requestRef.current||selectionRef.current!==id)return;setDetail(next);setBattles(rows=>rows.map(row=>row.id===id?{...row,...next.battle}:row));}
    catch(e:any){if(selectionRef.current===id)setNotice(e.message);}
  }
  useEffect(()=>{if(selectedId&&!battles.some(b=>b.id===selectedId))setSelectedId(null);},[battles,selectedId]);
  useEffect(() => {
    setDetail(null);setBulkSelected([]);void load(selectedId);
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
    if (
      id &&
      id !== selectedId &&
      battles.some((b: any) => String(b.id) === id)
    )
      setSelectedId(id);
  }, [params, battles]);
  useEffect(()=>{const onVisible=()=>{if(document.visibilityState==='visible'&&!mutationBusy&&!manageOpen&&!signupOpen)void load(selectionRef.current);};document.addEventListener('visibilitychange',onVisible);return()=>document.removeEventListener('visibilitychange',onVisible);},[mutationBusy,manageOpen,signupOpen]);
  async function quick(status: string) {
    if (!battle) return;
    try{
    let late = 0;
    if (status === "LATE") {
      const n = prompt(
        "How many minutes late?",
        String(
          detail?.signups?.find((x: any) => x.user_id === viewer.id)
            ?.late_minutes || 5,
        ),
      );
      if (n === null) return;
      late = Math.max(5, Math.min(60, Number(n) || 5));
    }
    const self = detail?.signups?.find((x: any) => x.user_id === viewer.id);
    const profile =
      preferences?.rates?.[String(battle.rate)] ??
      preferences?.rates?.[`${battle.rate}th`] ??
      {};
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
        hornPreferred:
          self?.horn_preferred ?? preferences?.horn_preferred ?? false,
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
    }catch(e:any){setNotice(e.message);}
  }
  async function oneClickSignup() {
    if (!battle) return;
    const existing = detail?.signups?.some(
      (x: any) => String(x.user_id) === viewer.id,
    );
    if (existing) {
      setNotice(
        "You are already signed up. Your ship choices and availability were preserved.",
      );
      return;
    }
    const profile = preferences?.rates?.[String(battle.rate)] ?? {},
      ships = (profile.ships ?? []).filter((x: string) =>
        rateShips.includes(x),
      );
    if (!ships.length) {
      setNotice(
        "Save your playable ships for this rate under Preferred Ships before using 1-Click Signup.",
      );
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
          preferredShips: (profile.preferred ?? []).filter((x: string) =>
            ships.includes(x),
          ),
          hornCapable: Boolean(
            preferences.horn_capable && preferences.horn_requirements_ack,
          ),
          hornPreferred: Boolean(
            preferences.horn_preferred &&
              preferences.horn_capable &&
              preferences.horn_requirements_ack,
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
    if (!battle||battle.status==='FINISHED') return;
    if(assignmentRef.current){setNotice('Please wait for the current roster change to finish.');return;}
    if(patch.confirmedShip&&!(signup.ships??[]).includes(patch.confirmedShip)){setNotice(`${signup.display_name} has not selected ${patch.confirmedShip} as a playable ship.`);return;}
    assignmentRef.current=true;setMutationBusy(true);
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
    }finally{assignmentRef.current=false;setMutationBusy(false);}
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
    assignmentRef.current=true;setMutationBusy(true);try{
    const selected = detail.signups.filter(
      (x: any) => bulkSelected.includes(x.id) && !x.confirmed_ship,
    );
    const counts: Record<string, number> = {};
    for (const s of detail.signups.filter((x: any) => x.confirmed_ship))
      counts[s.confirmed_ship] = (counts[s.confirmed_ship] ?? 0) + 1;
    let placed = 0,failed=0,skipped=0;
    for (const s of selected) {
      const candidates = [
        ...(s.preferred_ships ?? []),
        ...(s.ships ?? []),
      ].filter(
        (x: string, i: number, a: string[]) =>
          a.indexOf(x) === i && rateShips.includes(x) && (s.ships??[]).includes(x),
      );
      if (!candidates.length) {skipped++;continue;}
      const ship = draftShips[s.id] || candidates.sort((a: string, b: string) => {
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
      } catch {failed++;}
    }
    setBulkSelected([]);
    await load(battle.id);
    emitToast(`${placed} captain${placed === 1 ? "" : "s"} placed.${skipped?` ${skipped} need ship choices.`:""}${failed?` ${failed} could not be placed; refresh and retry.`:""}`, {
      tone: placed ? "success" : "warning",
    });}finally{assignmentRef.current=false;setMutationBusy(false);}
  }
  async function dropTo(ship: string | null, status = "ATTENDING") {
    if (!dragId || !detail || !canEdit || mutationBusy || assignmentRef.current) return;
    const ids=bulkSelected.includes(dragId)?bulkSelected:[dragId];
    assignmentRef.current=true;setMutationBusy(true);
    let failed=0;
    try{for(const id of ids){const s=detail.signups.find((x:any)=>x.id===id);if(!s)continue;
      const chosen=status==='WAITLIST'?null:(draftShips[id]||ship||(s.preferred_ships??[]).find((x:string)=>(s.ships??[]).includes(x))||(s.ships??[])[0]);
      if(status!=='WAITLIST'&&(!chosen||!(s.ships??[]).includes(chosen))){failed++;continue;}
      try{await api(`/port-battles/${battle.id}/assignments/${s.id}`,{method:'PUT',body:JSON.stringify({confirmedShip:chosen,status,assignmentVersion:s.assignment_version})});}catch{failed++;}
    }await load(battle.id);setBulkSelected([]);if(failed)setNotice(`${failed} Captains Could Not Be Placed. Check Ship Choices And Fleet Capacity.`);
    }finally{assignmentRef.current=false;setMutationBusy(false);setDragId(null);}
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
      body: JSON.stringify({...form,revision:battle.revision}),
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
        String(
          signup.attendance_outcome?.minutes_late ?? signup.late_minutes ?? 5,
        ),
      );
      if (v === null) return;
      minutesLate = Math.max(0, Math.min(240, Number(v) || 0));
    }
    if (outcome === "CANCELLED" || outcome === "NO_SHOW") {
      note =
        prompt(
          outcome === "CANCELLED"
            ? "Optional cancellation note:"
            : "Optional no-show note:",
          signup.attendance_outcome?.note ?? "",
        ) ?? "";
    }
    try {
      await api(`/port-battles/${battle.id}/attendance/${signup.user_id}`, {
        method: "PUT",
        body: JSON.stringify({ outcome, minutesLate, note }),
      });
      await load(battle.id);
      emitToast(
        `Attendance marked ${outcome.replaceAll("_", " ").toLowerCase()}.`,
        { tone: "success" },
      );
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
        value:
          s.reliability == null
            ? "Not enough recorded outcomes"
            : `${s.reliability}%`,
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
    pending = signups.filter(
      (x: any) => !x.confirmed_ship && x.signup_status !== "WAITLIST",
    ),
    waitlist = signups.filter(
      (x: any) => !x.confirmed_ship && x.signup_status === "WAITLIST",
    ),
    targets = detail?.battle?.ship_targets ?? battle?.ship_targets ?? {};
  const targetShips = [
    ...new Set([
      ...Object.keys(targets),
      ...confirmed.map((x: any) => x.confirmed_ship),
      ...rateShips,
    ]),
  ].filter(Boolean);
  const self = signups.find((x: any) => x.user_id === viewer.id);
  const targetShortfall = Object.entries(targets).reduce(
      (n, [ship, target]: any) =>
        n +
        Math.max(
          0,
          Number(target || 0) -
            confirmed.filter((x: any) => x.confirmed_ship === ship).length,
        ),
      0,
    ),
    lateCount = signups.filter((x: any) => Number(x.late_minutes) > 0).length,
    hornCount = confirmed.filter((x: any) => x.horn_duty).length,
    flareCount = confirmed.filter((x: any) => x.flare_duty).length,
    commandCount = confirmed.filter((x: any) => x.commander_duty).length,
    rosterReady = Boolean(
      battle && confirmed.length >= Number(battle.team_size),
    );
  const shipShortages = Object.entries(targets)
    .map(([ship, target]: any) => ({
      ship,
      missing: Math.max(
        0,
        Number(target || 0) -
          confirmed.filter((x: any) => x.confirmed_ship === ship).length,
      ),
    }))
    .filter((x) => x.missing > 0);
  const requiredCommanderSlots = Object.keys(
    detail?.battle?.commander_slots ?? {},
  );
  const missingRoles = [
    !confirmed.some((x:any)=>x.horn_duty==='Primary Horn') ? "Primary Horn" : null,
    ...requiredCommanderSlots.filter(
      (role: string) => !confirmed.some((x: any) => x.commander_duty === role),
    ),
  ].filter(Boolean);
  const readinessScore = battle
    ? Math.max(
        0,
        Math.round(
          100 *
            (0.55 *
              Math.min(
                1,
                confirmed.length / Math.max(1, Number(battle.team_size)),
              ) +
              0.25 *
                (targetShortfall === 0
                  ? 1
                  : Math.max(
                      0,
                      1 -
                        targetShortfall / Math.max(1, Number(battle.team_size)),
                    )) +
              0.2 * (missingRoles.length === 0 ? 1 : 0.5)),
        ),
      )
    : 0;
  const canEdit=admin&&['OPEN','CLOSED'].includes(battle?.status);
  const matchesPool=(captain:any)=>{
    const q=poolQuery.trim().toLowerCase();if(q&&!`${captain.display_name} ${(captain.ships??[]).join(' ')}`.toLowerCase().includes(q))return false;
    return poolFilter==='all'||(poolFilter==='ships'&&(captain.ships??[]).length>0)||(poolFilter==='missing'&&!(captain.ships??[]).length)||(poolFilter==='priority'&&Number(captain.participation_priority?.missed)>0)||(poolFilter==='horn'&&captain.horn_capable)||(poolFilter==='late'&&Number(captain.late_minutes)>0);
  };
  const visiblePending=pending.filter(matchesPool),visibleWaitlist=waitlist.filter(matchesPool);
  return (
    <div className="pbExperience">
      <header className="pbCommandHeading"><div><span className="eyebrow">FLEET OPERATIONS</span><h1>Port Battles</h1><p>Build the fleet. Give every captain a place.</p></div><div className="controlRow"><button className="outlineButton" onClick={()=>setPrefsOpen(true)}>Preferred Ships</button>{admiralty&&<><button className="outlineButton" onClick={async()=>{try{const info=await api('/pb-reconcile/preview');if(!confirm(`Reconcile Discord panels for ${info.active} live battles and ${info.retiredWithCards} retired records with stored cards? This won't cancel battles.`))return;await api('/pb-reconcile',{method:'POST'});setNotice('Discord panel reconciliation queued. Recheck after the next controller sweep.');}catch(e:any){setNotice(`Reconcile failed: ${e.message}`);}}}>Reconcile Discord Panels</button><button className="outlineButton" onClick={()=>setResetOpen(true)}>Reset Active Battles</button></>}{hasManager&&<button className="goldButton" onClick={()=>setCreateOpen(true)}>Schedule Battle</button>}<details className="pbToolMenu"><summary>More Tools</summary><div>{!pbConfig.pbOnly&&<><Link href="/dashboard/ship-builder">PB Builds</Link><Link href="/dashboard/after-action-reports">After Action Reports</Link></>}</div></details></div></header>
      {notice && (
        <button className="notice" role="status" onClick={() => setNotice("")}>
          {notice}
        </button>
      )}
      {!selectedId&&<div className="pbOverview"><aside className="panel pbBattleList"><h2>Scheduled Battles</h2>{battles.filter(b=>['OPEN','CLOSED'].includes(b.status)).map(b=><button className="outlineButton" key={b.id} onClick={()=>setSelectedId(b.id)}><b>Battle of {b.port_name}</b><span>{b.attacker} vs {b.defender}</span><small>{fmt(b.starts_at)}</small></button>)}{!battles.some(b=>['OPEN','CLOSED'].includes(b.status))&&<p>No Port Battles Scheduled</p>}<Link href="/dashboard/after-action-reports">After Action Reports →</Link></aside><TerritoryMap mapData={mapData} battles={battles} config={pbConfig} manager={hasManager&&!pbConfig.pbOnly}/></div>}
      {selectedId&&<button className="outlineButton" onClick={()=>setSelectedId(null)}>← All Port Battles</button>}
      {!selectedId ? null : !battles.length ? (
        <section className="panel pbEmptyWorkspace">
          <div className="pbEmptyGlyph" aria-hidden="true">
            ⚔
          </div>
          <div className="pbEmptyCopy">
            <span className="cardKicker">FLEET SCHEDULE</span>
            <h2>No Port Battles Scheduled</h2>
            <p>
              When a battle is scheduled, its signup status, roster planning,
              ship targets, assignments and Discord preview will all appear
              here.
            </p>
            <div className="pbEmptyActions">
              {hasManager && (
                <button
                  className="goldButton"
                  onClick={() => setCreateOpen(true)}
                >
                  Schedule Port Battle
                </button>
              )}
              <button
                className="outlineButton"
                onClick={() => setPrefsOpen(true)}
              >
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
        <div className="pbShell pbPlanningShell"><section className="pbScheduleBar"><label>Current Battle<select aria-label="Current Battle" value={selectedId??''} onChange={e=>setSelectedId(e.target.value)}>{battles.map(b=><option key={b.id} value={b.id}>{b.port_name} · {b.signup_guild||'BOM'} · {fmt(b.starts_at)} · {b.status}</option>)}</select></label><details className="pbScheduleDetails"><summary>Browse Schedule · {battles.length}</summary><div>{battles.map(b=><button className={selectedId===b.id?'active':''} key={b.id} onClick={()=>setSelectedId(b.id)}><b>{b.port_name}</b><span>{b.attacker||'Attacker'} vs {b.defender||'Defender'}</span><small>{fmt(b.starts_at)}</small></button>)}</div></details><button className="outlineButton" disabled={mutationBusy} onClick={()=>void Promise.all([refreshList(),load(selectedId)]).catch(e=>setNotice(e.message))}>↻ Refresh Board</button></section>
          <main>
            {battle && detail?.battle?.id===battle.id ? (
              <>
                {admin && !pbConfig.pbOnly && battle.status === "OPEN" && (
                  <PortBattleInvitations battleId={battle.id} />
                )}
                <section className="pbBattleHeader panel"><div className="pbBattleIdentity"><span className="cardKicker">{battle.signup_guild||'BOM'} · {battle.status}</span><h2>Battle of {battle.port_name}</h2><p><strong>{battle.attacker||'Attacker'}</strong> <span>vs</span> <strong>{battle.defender||'Defender'}</strong> · {rateLabel(battle.rate)} · {battle.team_size}v{battle.team_size} · {fmt(battle.starts_at)}</p></div><div className="pbBattleCount"><b>{confirmed.length}<span>/{battle.team_size}</span></b><small>Confirmed · {Math.max(0,battle.team_size-confirmed.length)} Places Open</small></div><div className="pbBattleActions"><details className="pbToolMenu"><summary>My Signup{self?' · Signed Up':''}</summary><div>{battle.status==='OPEN'?<><button disabled={!signupAllowed} title={!signupAllowed?"Signups require the configured guild role for this battle. Ask an officer to review your roles.":undefined} onClick={()=>void oneClickSignup()}>1-Click Signup</button><button disabled={!signupAllowed} title={!signupAllowed?"Signups require the configured guild role for this battle. Ask an officer to review your roles.":undefined} onClick={()=>setSignupOpen(true)}>Detailed Signup</button><button disabled={!signupAllowed} title={!signupAllowed?"Signups require the configured guild role for this battle. Ask an officer to review your roles.":undefined} onClick={()=>void quick('LATE')}>Running Late</button><button disabled={!signupAllowed} title={!signupAllowed?"Signups require the configured guild role for this battle. Ask an officer to review your roles.":undefined} onClick={()=>void quick('WAITLIST')}>Join Waitlist</button></>:<small>Signups are closed.</small>}</div></details>{admin&&<><button className="outlineButton" onClick={()=>void undoLastAssignment()} disabled={!canEdit||mutationBusy}>↶ Undo</button><details className="pbToolMenu"><summary>Fleet Tools</summary><div>{!pbConfig.pbOnly&&<><button disabled={!canEdit||mutationBusy} onClick={()=>void copyPreviousRoster()}>Copy Previous Roster</button><button disabled={!canEdit||mutationBusy} onClick={()=>setTemplateOpen(true)}>Fleet Templates</button><button onClick={()=>void openTactical('ALL')}>Tactical Briefs</button></>}<button onClick={()=>setManageOpen(true)}>Manage Battle / AAR</button></div></details></>}<button className="outlineButton" onClick={inspectBattle}>Battle Details</button>{admin&&['OPEN','CLOSED','CANCELLED'].includes(battle.status)&&<CancelPortBattle battle={battle} onChanged={()=>window.location.reload()}/>}</div></section>
                <section className="pbReadinessCompact" aria-label="Fleet readiness"><div className="pbReadinessSignals"><span className={rosterReady?'ready':'attention'}>{Math.max(0,battle.team_size-confirmed.length)} Places Open</span><span className={missingRoles.length?'attention':'ready'}>{missingRoles.length?missingRoles.join(' · ')+' Missing':'Command Roles Covered'}</span><span className={targetShortfall?'attention':'ready'}>{targetShortfall?`${targetShortfall} Target Ships Needed`:'Ship Targets Covered'}</span>{lateCount>0&&<span>{lateCount} Running Late</span>}<span>{waitlist.length} Waitlisted</span></div><details><summary>Readiness - {readinessScore}%</summary><p>{shipShortages.length?shipShortages.map(x=>`${x.ship} ×${x.missing}`).join(' · '):'All ship targets are covered.'}</p><p>{hornCount} Horn duties · {flareCount} flare duties · {commandCount} commanders. Targets are guidance; officers control assignments.</p></details></section>
                <BattleCoordination battle={battle} manager={admin&&!pbConfig.pbOnly} onChanged={()=>void load(battle.id)}/>
                <section className="pbRosterBoard">
                  <div className="panel pbPool">
                    <div className="panelHead">
                      <div>
                        <h3>Signup Pool</h3><SavedViewControl section="pb-pool" state={{query:poolQuery,filter:poolFilter}} onApply={s=>{setPoolQuery(String(s.query??''));setPoolFilter(['all','ships','missing','priority','horn','late'].includes(s.filter)?s.filter:'all')}}/>
                        
                      </div>
                      <div className="controlRow">
                        {admin && bulkSelected.length > 0 && (
                          <button
                            className="tinyButton"
                            onClick={() => void autoPlaceSelected()}
                          >
                            Auto-Place {bulkSelected.length}
                          </button>
                        )}
                        {canEdit && (
                          <button
                            className="tinyButton"
                            onClick={() => setGuestOpen(true)}
                          >
                            Add Guest
                          </button>
                        )}
                        <b>{pending.length}</b>
                      </div>
                    </div>
                    <div className="pbPoolFilters"><input aria-label="Search signup pool" placeholder="Search captain or ship…" value={poolQuery} onChange={e=>setPoolQuery(e.target.value)}/><select aria-label="Filter signup pool" value={poolFilter} onChange={e=>setPoolFilter(e.target.value)}><option value="all">All Captains</option><option value="ships">Playable Ships Selected</option><option value="missing">Needs Ship Choices</option><option value="priority">Missed Recent Fleets</option><option value="horn">Horn Capable</option><option value="late">Running Late</option></select><small>{visiblePending.length} of {pending.length} captains shown{mutationBusy?' · Saving…':''}</small></div>
                  {!visiblePending.length&&<p className="muted">{pending.length?'No captains match these filters.':'All current signups are assigned or Waitlisted.'}</p>}
                  {visiblePending.map((s: any) => (
                      <Captain
                        key={s.id}
                        signup={s}
                        draggable={canEdit&&!mutationBusy}
                        selected={bulkSelected.includes(s.id)}
                        onSelect={() =>
                          setBulkSelected((x) =>
                            x.includes(s.id)
                              ? x.filter((id) => id !== s.id)
                              : [...x, s.id],
                          )
                        }
                        onDrag={() => setDragId(s.id)}
                        onInspect={() => inspectCaptain(s)}
                      availableShips={rateShips} onAssignShip={canEdit&&!mutationBusy?(ship:string)=>setDraftShips(x=>({...x,[s.id]:ship})):undefined} draftShip={draftShips[s.id]??''}
                        onQuickAssign={
                          canEdit&&!mutationBusy
                            ? () => {
                                const ship = [
                                  ...(s.preferred_ships ?? []),
                                  ...(s.ships ?? []),
                                ].find((x: string) => rateShips.includes(x)&&(s.ships??[]).includes(x));
                                if (ship)
                                  void assign(s, {
                                    confirmedShip: ship,
                                    status: "ATTENDING",
                                  });
                                else
                                  setNotice(
                                    `${s.display_name} has no playable ship selected for this rate.`,
                                  );
                              }
                            : undefined
                        }
                      />
                    ))}
                    <div
                      className="pbDropZone wait"
                      onDragOver={(e) => {if(canEdit)e.preventDefault();}}
                      onDrop={() => void dropTo(null, "WAITLIST")}
                    >
                      <b>Waitlist</b>
                      
                      {visibleWaitlist.map((s: any) => (
                        <Captain
                          key={s.id}
                          signup={s}
                          draggable={canEdit&&!mutationBusy}
                          selected={false}
                          onSelect={() => {}}
                          onDrag={() => setDragId(s.id)}
                          onInspect={() => inspectCaptain(s)}
                      availableShips={rateShips} onAssignShip={canEdit&&!mutationBusy?(ship:string)=>void assign(s,{confirmedShip:ship,status:'ATTENDING'}):undefined}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="panel pbFleet">
                    <div className="panelHead">
                      <div>
                        <h3>Confirmed Fleet</h3>
                        <span>
                          Drag/drop assignments · click controls to refine
                          duties
                        </span>
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
                        .filter((ship: string) => confirmed.some((x: any) => x.confirmed_ship === ship)||Number(targets[ship]??0)>0)
                        .map((shipName: string) => {
                          const rows = confirmed.filter(
                              (x: any) => x.confirmed_ship === shipName,
                            ),
                            target = targets[shipName];
                          return (
                            <section
                              key={shipName}
                              className="pbShipGroup"
                              onDragOver={(e) => {if(canEdit)e.preventDefault();}}
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
                                  onAttendance={(outcome) =>
                                    recordAttendance(s, outcome)
                                  }
                                  onInspect={() => inspectCaptain(s)}
                      availableShips={rateShips} onAssignShip={canEdit&&!mutationBusy?(ship:string)=>void assign(s,{confirmedShip:ship,status:'ATTENDING'}):undefined}
                                  onTactical={(role) => void openTactical(role)}
                                />
                              ))}
                              {canEdit&&<div className={`pbEmptyDrop pbSingleDrop ${dragId?'dropActive':''}`}>Drop a captain here{target!=null&&Number(target)>rows.length?` · ${Number(target)-rows.length} needed`:''}</div>}
                            </section>
                          );
                        })}
                      {!confirmed.length && (
                        <div className="pbBoardEmpty">
                          No confirmed captains yet. Drag a captain here or
                          double-click a signup to place them; ship targets are
                          planning guidance, not hard limits.
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
                  <h2>{selectedId?'Loading battle…':'Select a Battle'}</h2>
                  <p className="muted">
                    Choose a scheduled battle from the left to open its signup
                    and roster workspace.
                  </p>
                </div>
              </section>
            )}
          </main>
        </div>
      )}
      {resetOpen && admiralty && <PbResetModal onClose={()=>setResetOpen(false)} onReset={async()=>{await refreshList();setSelectedId(null);setDetail(null);}}/>}
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
          ownerTags={
            pbConfig.pbOnly ? pbConfig.alliedPB?.managerTags : undefined
          }
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
        <GuestSignupModal
          ships={rateShips}
          onClose={() => setGuestOpen(false)}
          onSave={addGuest}
        />
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
        <PbAnalyticsModal
          data={analytics}
          onClose={() => setAnalyticsOpen(false)}
        />
      )}{" "}
      {templateOpen && admin && battle && (
        <FleetTemplateModal
          templates={serverTemplates.filter(
            (x: any) => !x.rate || Number(x.rate) === Number(battle.rate),
          )}
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
          onRefresh={async () =>
            setTacticalData(
              await api(`/port-battles/${battle.id}/tactical-briefs`),
            )
          }
        />
      )}
    </div>
  );
}
function PbResetModal({onClose,onReset}:{onClose:()=>void;onReset:()=>Promise<void>}){
 const [preview,setPreview]=useState<any>(null);
 const [phrase,setPhrase]=useState('');
 const [job,setJob]=useState<any>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{void api('/pb-reset/preview').then(setPreview).catch((e:any)=>setError(e.message));},[]);
 useEffect(()=>{
  if(!job?.id||['COMPLETED','PARTIAL','FAILED'].includes(String(job.status)))return;
  const timer=setInterval(()=>{void api(`/pb-reset/status/${job.id}`).then(setJob).catch((e:any)=>setError(e.message));},2500);
  return ()=>clearInterval(timer);
 },[job?.id,job?.status]);
 async function perform(){if(phrase!=='RESET ACTIVE BATTLES'||!preview)return;setBusy(true);setError('');try{
  const outcome=await api('/pb-reset',{method:'POST',body:JSON.stringify({confirmation:phrase,expectedIds:preview.ids})});
  setJob({id:outcome.jobId,status:'QUEUED',affected_battles:preview.active,removed_discord_messages:0,cleanup_errors:[]});
  await onReset();
  emitToast(`${outcome.cleared} active battle${outcome.cleared===1?'':'s'} cleared. Discord cleanup queued.`,{tone:'success'});
 }catch(e:any){setError(e.message??'Reset failed. Re-open preview.');void api('/pb-reset/preview').then(setPreview).catch(()=>{});}finally{setBusy(false);}}
 const done=['COMPLETED','PARTIAL','FAILED'].includes(String(job?.status));
 return <div className="modalBackdrop" role="presentation"><section className="panel pbModal" role="dialog" aria-modal="true" aria-labelledby="pb-reset-title">
  <div className="panelHead"><div><span className="cardKicker">ADMIRALTY · DESTRUCTIVE OPERATION</span><h2 id="pb-reset-title">Reset Active Port Battles</h2><p>Cancel every open/closed Port Battle, set the live count to zero, and remove obsolete Discord signup, roster and schedule cards. Historic attendance and reviews are preserved.</p></div><button className="iconCloseButton" type="button" onClick={onClose} aria-label="Close">×</button></div>
  {preview?<div className="pbResetReview"><p><b>{preview.count} active battle{preview.count===1?'':'s'}</b> currently recorded. The bot will also scan for orphaned messages from battles deleted earlier.</p>
   {preview.active.map((b:any)=><p key={b.id}><b>{b.port_name}</b> · {b.status} · {b.starts_at?new Date(b.starts_at).toLocaleString():'No time set'}</p>)}
   <p className="muted">Discord channels: Signup {preview.channels?.signup?`#${preview.channels.signup}`:'Not configured'} · Roster {preview.channels?.roster?`#${preview.channels.roster}`:'Not configured'} · Schedule {preview.channels?.schedule?`#${preview.channels.schedule}`:'Not configured'}</p>
  </div>:<p>Loading the current fleet and Discord panel settings…</p>}
  {preview?.lastJob&&!job&&<div className="pbResetReport"><p><b>Previous reset:</b> {preview.lastJob.status} · {Number(preview.lastJob.removed_discord_messages??0)} Discord messages removed</p>{(preview.lastJob.cleanup_errors??[]).map((e:string,i:number)=><p key={i} className="notice">{e}</p>)}</div>}
  {!job&&<><label>Enter <b>RESET ACTIVE BATTLES</b> to confirm<input value={phrase} onChange={e=>setPhrase(e.target.value)} autoComplete="off" placeholder="RESET ACTIVE BATTLES"/></label><p className="muted">This is not a database purge. You can still review historical battles, but cancelled records will no longer appear in the active schedule.</p></>}
  {job&&<div className="pbResetReport"><p><strong>Cleanup status:</strong> {job.status==='QUEUED'?'Queued for bot':job.status==='RUNNING'?'Cleaning Discord…':job.status}</p><p><b>{Number(job.removed_discord_messages??0)}</b> Discord messages removed</p>{(job.cleanup_errors??[]).map((e:string,i:number)=><p key={i} className="notice">{e}</p>)}{job.status==='PARTIAL'&&<p>Some messages could not be removed. Check the error report and rerun after fixing permissions.</p>}</div>}
  {error&&<p role="alert" className="notice">{error}</p>}
  <div className="controlRow"><button type="button" className="outlineButton" onClick={onClose}>{done?'Close':'Cancel / Close'}</button>{!job&&<button type="button" className="goldButton" disabled={busy||!preview||phrase!=='RESET ACTIVE BATTLES'} onClick={()=>void perform()}>{busy?'Submitting…':'Reset All Active Battles'}</button>}</div>
 </section></div>;
}

function CaptainIdentity({signup,onInspect}:{signup:any;onInspect:()=>void}){const initials=String(signup.display_name??'?').replace(/\[[^\]]*\]/g,'').trim().split(/\s+/).slice(0,2).map((x:string)=>x[0]).join('');return <button type="button" className="pbCaptainIdentity" onClick={onInspect}><span className="pbCaptainAvatar">{signup.avatar_url?<img src={signup.avatar_url} alt="" onError={e=>{e.currentTarget.style.display='none'}}/>:initials}</span><span><b>{signup.display_name}</b>{Number(signup.late_minutes)>0&&<small>Running Late · +{signup.late_minutes} min</small>}</span></button>}
function Captain({signup,draggable,onDrag,selected,onSelect,onInspect,onQuickAssign,availableShips=[],onAssignShip,draftShip=""}:{signup:any;draggable:boolean;onDrag:()=>void;selected:boolean;onSelect:()=>void;onInspect:()=>void;onQuickAssign?:()=>void;availableShips?:string[];onAssignShip?:(ship:string)=>void;draftShip?:string}){
 const ships=(signup.ships??[]).filter((ship:string)=>availableShips.includes(ship)),missed=Number(signup.participation_priority?.missed??0);
 return <article className={`pbCaptain ${missed?'pbPriorityCaptain':''} ${selected?'selected':''} ${!ships.length?'pbNeedsShips':''}`} draggable={draggable&&ships.length>0} onDragStart={onDrag} onClick={e=>{if(draggable&&ships.length&&!(e.target as HTMLElement).closest('button,input,select,a'))onSelect();}} >
 <div className="pbCaptainTop">{draggable&&<input className="pbBulkCheck" type="checkbox" disabled={!ships.length} checked={selected} onChange={onSelect} aria-label={`Select ${signup.display_name} for bulk placement`}/>}<CaptainIdentity signup={signup} onInspect={draggable?onSelect:onInspect}/></div>
 <div className="pbCaptainShips">{ships.length?ships.map((ship:string)=><span key={ship}>{(signup.preferred_ships??[]).includes(ship)?'★ ':''}{ship}</span>):<span className="pbMissingShips">Needs Ship Choices · not assignable</span>}</div>
 <div className="pbCaptainBadges">{missed>0&&<span className="pbPriorityBadge" title={`Signed up but not confirmed in ${missed} of the last ${signup.participation_priority?.window??3} completed battles`}>Missed {missed} recent fleet{missed===1?'':'s'}</span>}{signup.horn_capable&&<span>📯 Horn Capable</span>}{signup.flare_capabilities?.length>0&&<span title={signup.flare_capabilities.join(', ')}>🚩 {signup.flare_capabilities.length} flare options</span>}</div>
 {onAssignShip&&ships.length>0&&<select className="pbQuickAssign" aria-label={`Assign ${signup.display_name} to ship`} value={draftShip} onChange={e=>{if(e.target.value)onAssignShip(e.target.value)}}><option value="">Choose Ship…</option>{ships.map((ship:string)=><option key={ship} value={ship}>{ship}</option>)}</select>}
 </article>;
}
function AssignedCaptain({
  signup,
  admin,
  finished,
  tacticalAllowed = true,
  builds,
  onDrag,
  onChange,
  onAttendance,
  onInspect,
  onTactical,
  availableShips=[],
  onAssignShip,
}: {
  availableShips?:string[];
  onAssignShip?:(ship:string)=>void;
  signup: any;
  admin: boolean;
  finished: boolean;
  tacticalAllowed?: boolean;
  builds: any[];
  onDrag: () => void;
  onChange: (p: any) => void;
  onAttendance: (outcome: string) => void;
  onInspect: () => void;
  onTactical: (role: string) => void;
}) {
  const priority = signup.participation_priority;
  const history = (signup.recent_assignments ?? [])
    .map((x: any) => `${x.port_name}: ${x.confirmed_ship}`)
    .join(" · ");
  const attendance = signup.attendance_outcome?.outcome ?? "";
  const tacticalRole =
    signup.commander_duty ||
    signup.horn_duty ||
    signup.flare_duty ||
    signup.formation ||
    "ALL";
  return (
    <article
      className={`pbAssigned ${attendance ? `attendance-${String(attendance).toLowerCase()}` : ""}`}
      draggable={admin && !finished}
      onDragStart={onDrag}
      title={history ? `Recent PBs — ${history}` : ""}
    >
      <div className="pbAssignedHead"><CaptainIdentity signup={signup} onInspect={onInspect}/><div className="pbAssignedActions">{admin&&!finished&&tacticalAllowed&&<button type="button" className="pbMapDmButton goldButton" onClick={()=>onTactical(tacticalRole)} aria-label={`Tactical map for ${signup.display_name}`}>DM Map</button>}{admin&&!finished&&<button type="button" title="Return to signup pool" aria-label={`Unconfirm ${signup.display_name}`} onClick={()=>onChange({confirmedShip:null,status:'ATTENDING'})}>↩</button>}</div></div>
      <div className="pbAssignmentBadges">{[signup.formation,signup.commander_duty].filter(Boolean).map((d:string)=><span key={d}>{d}</span>)}</div>
      {onAssignShip&&<select className="pbQuickAssign" value={signup.confirmed_ship??''} aria-label={`Reassign ${signup.display_name} to ship`} onChange={e=>onAssignShip(e.target.value)}>{(signup.ships??[]).filter((ship:string)=>availableShips.includes(ship)||ship===signup.confirmed_ship).map((ship:string)=><option key={ship} value={ship}>{ship}</option>)}</select>}
      <div className="pbDutyIconStrip">
        {signup.horn_duty && (
          <img
            className="pbDutyIcon"
            src="/wosb/pb/duties/horn.png"
            title={signup.horn_duty}
            alt={signup.horn_duty}
          />
        )}
        {signup.flare_duty && (
          <img
            className="pbDutyIcon"
            src={`/wosb/pb/duties/${String(signup.flare_duty).toLowerCase().replace(" ", "-")}.png`}
            title={signup.flare_duty}
            alt={signup.flare_duty}
          />
        )}
      </div>
      <details className="pbDutyDetails">
        <summary className="goldButton">
          + Formation &amp; Duties
        </summary>
        <div className="pbDutyControls">
          <select
            disabled={!admin || finished}
            aria-label={`Formation for ${signup.display_name}`} value={signup.formation ?? ""}
            onChange={(e) => onChange({ formation: e.target.value || null })}
          >
            <option value="">Formation</option>
            <option value="Mainline">Mainline</option>
            <option value="Flank">Flank</option>
            <option value="Edge">Edge</option>
          </select>
          <select
            disabled={!admin || finished || signup.horn_capable !== true}
            aria-label={`Horn duty for ${signup.display_name}`} value={signup.horn_duty ?? ""}
            onChange={(e) => onChange({ hornDuty: e.target.value || null })}
          >
            <option value="">No Horn</option>
            <option value="Primary Horn">Primary Horn</option>
            <option value="Secondary Horn">Secondary Horn</option>
          </select>
          <select
            aria-label="Flare duty"
            disabled={!admin || finished}
            value={signup.flare_duty ?? ""}
            onChange={(e) => onChange({ flareDuty: e.target.value || null })}
          >
            <option value="">No Flare Duty</option>
            {["Red Flare", "Gold Flare", "Blue Flare"]
              .filter(
                (color) =>
                  (signup.flare_capabilities ?? []).includes(color) ||
                  signup.flare_duty === color,
              )
              .map((color) => (
                <option value={color} key={color}>
                  {color}
                </option>
              ))}
          </select>
          <select
            disabled={!admin || finished}
            aria-label={`Commander duty for ${signup.display_name}`} value={signup.commander_duty ?? ""}
            onChange={(e) =>
              onChange({ commanderDuty: e.target.value || null })
            }
          >
            <option value="">No Commander</option>
            <option value="Fleet Commander">Fleet Commander</option>
            <option value="Flank Commander">Flank Commander</option>
            <option value="Siege Commander">Siege Commander</option>
          </select>
          <select
            disabled={!admin || finished}
            aria-label={`Build for ${signup.display_name}`} value={signup.build_id ?? ""}
            onChange={(e) => onChange({ buildId: e.target.value || null })}
          >
            <option value="">Recommended Build</option>
            {builds.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {admin && finished && signup.user_id && (
            <select
              className="pbAttendanceSelect"
              value={attendance}
              onChange={(e) => onAttendance(e.target.value)}
            >
              <option value="">Record Attendance…</option>
              <option value="ATTENDED">Attended</option>
              <option value="LATE">Late</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="NO_SHOW">No-Show</option>
              <option value="WAITLIST">Waitlist</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
          )}
        </div>
      </details>
    </article>
  );
}
function ArchiveModal({
  query,
  setQuery,
  rows,
  onSearch,
  onClose,
}: {
  query: string;
  setQuery: (v: string) => void;
  rows: any[];
  onSearch: (q?: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="modalBackdrop">
      <section className="panel pbModal pbArchiveModal">
        <div className="panelHead">
          <div>
            <span className="cardKicker">BATTLE ARCHIVE</span>
            <h2>Search Port Battle History</h2>
            <p>Search by port, opponent, attacker, defender or captain.</p>
          </div>
          <button className="iconCloseButton" onClick={onClose}>×</button>
        </div>
        <form
          className="pbArchiveSearch"
          onSubmit={(e) => {
            e.preventDefault();
            void onSearch(query);
          }}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Aruba, DVS, captain name…"
          />
          <button className="goldButton">Search</button>
        </form>
        <div className="pbArchiveResults">
          {rows.map((r) => (
            <article key={r.id}>
              <span>
                <b>Battle of {r.port_name}</b>
                <small>
                  {r.attacker || "Attacker"} vs {r.defender || "Defender"} ·{" "}
                  {fmt(r.starts_at)}
                </small>
              </span>
              <em>
                {r.result && r.result !== "UNKNOWN" ? `${r.result} · ` : ""}
                {r.confirmed_count}/{r.team_size} confirmed
              </em>
            </article>
          ))}
          {!rows.length && (
            <p className="muted">No matching finished battles.</p>
          )}
        </div>
      </section>
    </div>
  );
}
function PbAnalyticsModal({
  data,
  onClose,
}: {
  data: any;
  onClose: () => void;
}) {
  return (
    <div className="modalBackdrop">
      <section className="panel pbModal pbAnalyticsModal">
        <div className="panelHead">
          <div>
            <span className="cardKicker">OFFICER ANALYTICS</span>
            <h2>Fleet Reliability & Commander Dashboard</h2>
            <p>
              Attendance and outcome data are officer-only planning context, not
              public rankings.
            </p>
          </div>
          <button className="iconCloseButton" onClick={onClose}>×</button>
        </div>
        <div className="pbAnalyticsGrid">
          <article>
            <h3>Reliability</h3>
            {(data.reliability ?? []).slice(0, 30).map((r: any) => (
              <div key={r.user_id}>
                <span>
                  <b>{r.display_name || r.user_id}</b>
                  <small>
                    {r.recorded} recorded · {r.cancelled} cancelled ·{" "}
                    {r.no_show} no-show
                  </small>
                </span>
                <strong>
                  {r.reliability == null ? "—" : `${r.reliability}%`}
                </strong>
              </div>
            ))}
            {!data.reliability?.length && (
              <p className="muted">
                Attendance outcomes will appear after officers record them.
              </p>
            )}
          </article>
          <article className="pbCommanderAnalytics">
            <h3>Commander History</h3>
            {(data.commanders ?? []).map((r: any) => (
              <div key={r.user_id ?? r.display_name}>
                <span>
                  <b>{r.display_name || r.user_id || "Guest"}</b>
                  <small>
                    {r.commander_assignments} battles · avg roster{" "}
                    {r.avg_roster_size ?? "—"} · {r.late ?? 0} late ·{" "}
                    {r.no_show ?? 0} no-show
                  </small>
                  {r.recurring_issues?.length > 0 && (
                    <em>
                      Recurring:{" "}
                      {r.recurring_issues
                        .map((x: any) => `${x.tag} ×${x.count}`)
                        .join(" · ")}
                    </em>
                  )}
                </span>
                <strong>
                  {r.win_rate == null ? "No result data" : `${r.win_rate}% win`}
                </strong>
              </div>
            ))}
            {!data.commanders?.length && (
              <p className="muted">No finished commander assignments yet.</p>
            )}
          </article>
          <article>
            <h3>Recurring Battle Issues</h3>
            {(data.issues ?? []).map((r: any) => (
              <div key={r.tag}>
                <span>
                  <b>{r.tag}</b>
                  <small>Recorded in finished battle reviews</small>
                </span>
                <strong>{r.count}×</strong>
              </div>
            ))}
            {!data.issues?.length && (
              <p className="muted">
                Record issue tags when finishing battles to reveal recurring
                patterns.
              </p>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
function TacticalBriefModal({
  battle,
  data,
  initialRole,
  onClose,
  onRefresh,
}: {
  battle: any;
  data: any;
  initialRole: string;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const roles = data.roles ?? [
    "ALL",
    "Mainline",
    "Flank",
    "Edge",
    "Primary Horn",
    "Secondary Horn",
    "Red Flare",
    "Gold Flare",
    "Blue Flare",
    "Fleet Commander",
    "Flank Commander",
    "Siege Commander",
  ];
  const [role, setRole] = useState(
    roles.includes(initialRole) ? initialRole : "ALL",
  );
  const existing = useMemo(
    () => data.briefs?.find((x: any) => x.role_key === role) ?? null,
    [data.briefs, role],
  );
  const [planId, setPlanId] = useState(
    existing?.source_plan_id ?? data.plans?.[0]?.id ?? "",
  );
  const [title, setTitle] = useState(
    existing?.title ?? `${role} · ${battle.port_name}`,
  );
  const [instructions, setInstructions] = useState(
    existing?.instructions ?? "",
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const next = data.briefs?.find((x: any) => x.role_key === role);
    setPlanId(next?.source_plan_id ?? data.plans?.[0]?.id ?? "");
    setTitle(next?.title ?? `${role} · ${battle.port_name}`);
    setInstructions(next?.instructions ?? "");
  }, [role, data, battle.port_name]);
  const plan = data.plans?.find((x: any) => x.id === planId);
  async function save(send = false) {
    setBusy(true);
    try {
      await api(
        `/port-battles/${battle.id}/tactical-briefs/${encodeURIComponent(role)}`,
        {
          method: "PUT",
          body: JSON.stringify({ planId, title, instructions }),
        },
      );
      await onRefresh();
      if (send) {
        await api(
          `/port-battles/${battle.id}/tactical-briefs/${encodeURIComponent(role)}/dispatch`,
          { method: "POST" },
        );
        emitToast(
          `Tactical brief queued for ${role === "ALL" ? "the confirmed fleet" : role}.`,
          { tone: "success" },
        );
      } else emitToast("Tactical brief saved.", { tone: "success" });
    } catch (e: any) {
      emitToast(e.message ?? "Could not save tactical brief.", {
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modalBackdrop">
      <section className="panel pbModal pbTacticalModal">
        <div className="panelHead">
          <div>
            <span className="cardKicker">TACTICAL MAP DM</span>
            <h2>Battle of {battle.port_name}</h2>
            <p>
              Reuse a Battle Prep drawing, add role instructions, then DM the
              annotated map to the confirmed captains assigned to that duty.
            </p>
          </div>
          <button type="button" className="dangerGhost pbDismiss" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="formGrid">
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r: string) => (
                <option key={r} value={r}>
                  {r === "ALL" ? "Entire Confirmed Fleet" : r}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tactical Plan
            <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Choose Battle Prep Plan…</option>
              {(data.plans ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.title || p.port_name} · v{p.version}
                </option>
              ))}
            </select>
          </label>
        </div>
        {plan ? (
          <div className="pbTacticalPreview">
            <img
              src={`/wosb/prep-maps/${encodeURIComponent(plan.map_key || "")}.png`}
              alt=""
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
            <div>
              <b>{plan.title}</b>
              <small>
                {plan.drawing?.length ?? 0} drawing elements · Port:{" "}
                {plan.port_name}
              </small>
            </div>
          </div>
        ) : (
          <div className="pbTacticalEmpty">
            <b>No tactical plan selected.</b>
            <span>
              Create or update the map drawing in Battle Prep, then return
              here to send it to the role.
            </span>
            <Link className="outlineButton" href="/dashboard/battle-prep">
              Open Battle Prep
            </Link>
          </div>
        )}
        <label>
          DM Title
          <input
            value={title}
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Instructions
          <textarea
            value={instructions}
            maxLength={4000}
            rows={6}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Formation, positioning, first turn, target priorities, fallback instructions…"
          />
        </label>
        <div className="pbTacticalNote">
          <b>Who Gets This?</b>
          <span>
            {role === "ALL"
              ? "Every confirmed Discord captain."
              : `Confirmed captains whose formation, Horn duty, or commander duty matches “${role}”.`}{" "}
            Non-Discord guests are skipped automatically.
          </span>
        </div>
        <div className="controlRow">
          <button type="button" className="outlineButton" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="outlineButton"
            disabled={busy || !planId || !title.trim()}
            onClick={() => void save(false)}
          >
            Save Brief
          </button>
          <button
            type="button"
            className="goldButton"
            disabled={busy || !planId || !title.trim()}
            onClick={() => void save(true)}
          >
            Save & DM Role
          </button>
        </div>
      </section>
    </div>
  );
}
function FleetTemplateModal({
  templates,
  battle,
  onApply,
  onSave,
  onClose,
}: {
  templates: any[];
  battle: any;
  onApply: (x: any) => void;
  onSave: (name: string, notes?: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(
    `${rateLabel(battle.rate)} ${battle.team_size}v${battle.team_size}`,
  );
  return (
    <div className="modalBackdrop">
      <section className="panel pbModal">
        <div className="panelHead">
          <div>
            <span className="cardKicker">FLEET DOCTRINE</span>
            <h2>Roster Templates</h2>
            <p>
              Reusable server-side ship targets and commander slot doctrine.
            </p>
          </div>
          <button className="iconCloseButton" onClick={onClose}>×</button>
        </div>
        <div className="pbTemplateList">
          {templates.map((t) => (
            <button key={t.id} onClick={() => void onApply(t)}>
              <span>
                <b>{t.name}</b>
                <small>
                  {rateLabel(t.rate)} · {t.team_size}v{t.team_size}
                </small>
              </span>
              <em>Apply →</em>
            </button>
          ))}
          {!templates.length && (
            <p className="muted">No saved fleet templates for this rate yet.</p>
          )}
        </div>
        <div className="pbTemplateCreate">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name"
          />
          <button
            className="goldButton"
            disabled={!name.trim()}
            onClick={() => void onSave(name.trim())}
          >
            Save Current Doctrine
          </button>
        </div>
      </section>
    </div>
  );
}
function DetailedSignup({
  battle,
  ships,
  current,
  profile,
  onClose,
  onSave,
}: {
  battle: any;
  ships: string[];
  current: any;
  profile: any;
  onClose: () => void;
  onSave: (v: any) => void;
}) {
  const saved = profile?.rates?.[String(battle.rate)] ?? {};
  const [picked, setPicked] = useState<string[]>(
    current?.ships ?? saved.ships ?? [],
  );
  const [preferred, setPreferred] = useState<string[]>(
    current?.preferred_ships ?? saved.preferred ?? [],
  );
  const [horn, setHorn] = useState<boolean>(
    current?.horn_capable ?? profile?.horn_capable ?? false,
  );
  const [hornPreferred, setHornPreferred] = useState<boolean>(
    current?.horn_preferred ?? profile?.horn_preferred ?? false,
  );
  const [flareCaps, setFlareCaps] = useState<string[]>(
    Array.isArray(current?.flare_capabilities)
      ? current.flare_capabilities
      : [],
  );
  const [status, setStatus] = useState(current?.signup_status ?? "ATTENDING");
  const [late, setLate] = useState(Number(current?.late_minutes ?? 0));
  return (
    <div className="modalBackdrop">
      <form
        className="panel pbModal"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave({
            ships: picked,
            preferredShips: preferred,
            hornCapable: horn,
            hornPreferred: horn ? hornPreferred : false,
            flareCapabilities: flareCaps,
            status,
            lateMinutes: status === "LATE" ? late : 0,
          });
        }}
      >
        <div className="panelHead">
          <div>
            <span className="cardKicker">DETAILED SIGNUP</span>
            <h2>Battle of {battle.port_name}</h2>
          </div>
          <button type="button" className="dangerGhost pbDismiss" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ATTENDING">Attending</option>
            <option value="LATE">Running Late</option>
            <option value="WAITLIST">Waitlist</option>
          </select>
        </label>
        {status === "LATE" && (
          <label>
            Minutes Late
            <input
              type="number"
              min={5}
              max={60}
              value={late || 5}
              onChange={(e) => setLate(Number(e.target.value))}
            />
          </label>
        )}
        <fieldset>
          <legend>Select All Ships You Can Play</legend>
          <div className="pbShipChecklist">
            {ships.map((s) => (
              <label key={s}>
                <input
                  type="checkbox"
                  checked={picked.includes(s)}
                  onChange={() => {
                    setPicked((p) =>
                      p.includes(s) ? p.filter((x) => x !== s) : [...p, s],
                    );
                    setPreferred((p) => p.filter((x) => x !== s));
                  }}
                />
                {s}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Preferred Ships · Up To Two</legend>
          <div className="pbShipChecklist">
            {picked.map((s) => (
              <label key={s}>
                <input
                  type="checkbox"
                  checked={preferred.includes(s)}
                  onChange={() =>
                    setPreferred((p) =>
                      p.includes(s)
                        ? p.filter((x) => x !== s)
                        : p.length < 2
                          ? [...p, s]
                          : p,
                    )
                  }
                />
                {s}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="pbHornRequirements compact">
          <label className="checkLine">
            <input
              type="checkbox"
              checked={horn}
              onChange={(e) => {
                setHorn(e.target.checked);
                if (!e.target.checked) setHornPreferred(false);
              }}
            />
            <span>
              <b>I Am Willing To / Can Play Horn</b>
              <small>
                Horn players use Filling Ration in slot 2 (C), Horn in slot 3
                (V), and maintain 300 of each. Configure full Horn eligibility
                in Preferred Ships.
              </small>
            </span>
          </label>
          {horn && (
            <label className="checkLine">
              <input
                type="checkbox"
                checked={hornPreferred}
                onChange={(e) => setHornPreferred(e.target.checked)}
              />
              <span>
                <b>I Generally Prefer Horn Duty</b>
                <small>
                  Leave this off when you can play Horn but would rather fill
                  another duty.
                </small>
              </span>
            </label>
          )}
        </div>
        <fieldset className="pbFlareSignup">
          <legend>Signal Flare Duties · Volunteer</legend>
          <p>
            Choose every signal flare color you can handle. Admiralty assigns a
            single flare duty when confirming the fleet.
          </p>
          <div className="pbFlareChoices">
            {["Red Flare", "Gold Flare", "Blue Flare"].map((color) => (
              <label key={color}>
                <input
                  type="checkbox"
                  checked={flareCaps.includes(color)}
                  onChange={() =>
                    setFlareCaps((xs) =>
                      xs.includes(color)
                        ? xs.filter((x) => x !== color)
                        : [...xs, color],
                    )
                  }
                />
                <img
                  className="pbDutyIcon"
                  src={`/wosb/pb/duties/${color.toLowerCase().replace(" ", "-")}.png`}
                  alt=""
                />
                {color}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="controlRow">
          <button type="button" className="outlineButton" onClick={onClose}>
            Cancel
          </button>
          <button className="goldButton" disabled={!picked.length}>
            Save Signup
          </button>
        </div>
      </form>
    </div>
  );
}
function TargetsButton({
  ships,
  current,
  teamSize,
  rate,
  onSave,
}: {
  ships: string[];
  current: any;
  teamSize: number;
  rate: number;
  onSave: (v: any) => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [values, setValues] = useState<Record<string, number>>({ ...current }),
    [templates, setTemplates] = useState<any[]>([]);
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  const key = `bom:pb-target-templates:${rate}:${teamSize}`;
  useEffect(() => {
    if (!open) return;
    try {
      setTemplates(JSON.parse(localStorage.getItem(key) || "[]"));
    } catch {
      setTemplates([]);
    }
  }, [open, key]);
  function saveTemplate() {
    const name = prompt(
      "Template name",
      `${rateLabel(rate)} ${teamSize}v${teamSize}`,
    )?.trim();
    if (!name) return;
    const next = [
      { name, values: { ...values } },
      ...templates.filter((x: any) => x.name !== name),
    ].slice(0, 8);
    setTemplates(next);
    localStorage.setItem(key, JSON.stringify(next));
  }
  function removeTemplate(name: string) {
    const next = templates.filter((x: any) => x.name !== name);
    setTemplates(next);
    localStorage.setItem(key, JSON.stringify(next));
  }
  return (
    <>
      <button className="outlineButton" onClick={() => {setValues({...current});setError('');setOpen(true);}}>
        Ship Targets
      </button>
      {open && createPortal(
        <div className="modalBackdrop">
          <form
            className="panel pbModal"
            onSubmit={async(e) => {
              e.preventDefault();if(saving)return;setSaving(true);setError('');
              try{await onSave(values);setOpen(false);}catch(e:any){setError(e.message||'Could not save targets.');}finally{setSaving(false);}
            }}
          >
            {error&&<p role="alert">{error}</p>}
            <fieldset disabled={saving} style={{border:0,padding:0,margin:0,minWidth:0}}>
            <div className="panelHead">
              <div>
                <h2>Ship Targets</h2>
                <span>
                  Total{" "}
                  {Object.values(values).reduce<number>(
                    (a, b) => a + Number(b || 0),
                    0,
                  )}
                  /{teamSize}
                </span>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            {templates.length > 0 && (
              <div className="pbTargetTemplates">
                <span>Saved templates</span>
                {templates.map((t: any) => (
                  <div key={t.name}>
                    <button
                      type="button"
                      onClick={() => setValues({ ...t.values })}
                    >
                      {t.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${t.name}`}
                      onClick={() => removeTemplate(t.name)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="controlRow pbTargetQuick">
              <button
                type="button"
                className="tinyButton"
                onClick={saveTemplate}
              >
                Save current as template
              </button>
              <button
                type="button"
                className="tinyButton"
                onClick={() => setValues({})}
              >
                Clear targets
              </button>
            </div>
            <div className="pbTargetGrid">
              {ships.map((s) => (
                <label key={s}>
                  <span>{s}</span>
                  <span className="pbTargetStepper">
                    <button
                      type="button"
                      onClick={() =>
                        setValues((v) => ({
                          ...v,
                          [s]: Math.max(0, Number(v[s] ?? 0) - 1),
                        }))
                      }
                    >
                      −1
                    </button>
                    <output>{values[s] ?? 0}</output>
                    <button
                      type="button"
                      onClick={() =>
                        setValues((v) => ({
                          ...v,
                          [s]: Math.min(teamSize, Number(v[s] ?? 0) + 1),
                        }))
                      }
                    >
                      +1
                    </button>
                  </span>
                </label>
              ))}
            </div>
            <button
              className="goldButton"
              disabled={
                Object.values(values).reduce<number>(
                  (a, b) => a + Number(b || 0),
                  0,
                ) > teamSize
              }
            >
              Save Targets
            </button>
          </fieldset></form>
        </div>,document.body
      )}
    </>
  );
}
function CreateBattle({
  activeBattles,
  ports,
  guilds,
  ownerTags,
  gameTimeOffsetMinutes,
  onClose,
  onSubmit,
}: {
  activeBattles: any[];
  ports: any[];
  guilds: any[];
  ownerTags?: string[];
  gameTimeOffsetMinutes: number;
  onClose: () => void;
  onSubmit: (v: any) => void;
}) {
  const [signupGuild, setSignupGuild] = useState(ownerTags?.[0] ?? "BOM");
  const [portName, setPortName] = useState(""),
    [attacker, setAttacker] = useState("BOM"),
    [defender, setDefender] = useState(""),
    [date, setDate] = useState(shiftedLocalDate()),
    [hour, setHour] = useState(19);
  useEffect(() => {
    if (ownerTags?.length && !ownerTags.includes(signupGuild))
      setSignupGuild(ownerTags[0]);
  }, [ownerTags, signupGuild]);
  const port = ports.find((p: any) => p.name === portName);
  return (
    <div className="modalBackdrop">
      <form
        className="panel pbModal"
        onSubmit={(e) => {
          e.preventDefault();
          if (!port) return;
          void onSubmit({
            signupGuild,
            portName: port.name,
            attacker,
            defender,
            startsAt: gameSelectionToIso(date, hour, gameTimeOffsetMinutes),
          });
        }}
      >
        <div className="panelHead">
          <div>
            <span className="cardKicker">SCHEDULE</span>
            <h2>Schedule Port Battle</h2>
          </div>
          <button type="button" className="dangerGhost pbDismiss" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <label>
          Signup guild
          <select
            aria-label="Signup guild"
            value={signupGuild}
            onChange={(e) => setSignupGuild(e.target.value)}
          >
            {(
              ownerTags ?? [
                "BOM",
                ...guilds
                  .filter((g) => g.allied && g.tag !== "BOM")
                  .map((g) => g.tag),
              ]
            ).map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
        <label>
          Port
          <select
            required
            value={portName}
            onChange={(e) => setPortName(e.target.value)}
          >
            <option value="">Choose Port…</option>
            {ports.map((p: any) => (
              <option key={p.entityKey ?? p.name} value={p.name}>
                {p.name} · {rateLabel(p.rate)} · {p.size}v{p.size}
              </option>
            ))}
          </select>
        </label>
        {port && (
          <div className="pbDerivedPort">
            <span>
              <small>Rate</small>
              <b>{rateLabel(port.rate)}</b>
            </span>
            <span>
              <small>Team Size</small>
              <b>
                {port.size}v{port.size}
              </b>
            </span>
          </div>
        )}
        <GuildSelector
          label="Attacker"
          value={attacker}
          onChange={setAttacker}
          guilds={guilds}
        />
        <GuildSelector
          label="Defender"
          value={defender}
          onChange={setDefender}
          guilds={guilds}
        />
        <label>
          Battle Date
          <div className="pbDateQuick">
            <button
              type="button"
              className={date === shiftedLocalDate() ? "active" : ""}
              onClick={() => setDate(shiftedLocalDate())}
            >
              Today
            </button>
            <button
              type="button"
              className={date === shiftedLocalDate(1) ? "active" : ""}
              onClick={() => setDate(shiftedLocalDate(1))}
            >
              Tomorrow
            </button>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Battle Time · In-Game
          <BattleHourButtons value={hour} onChange={setHour}/>
          <small>
            Choose the hour exactly as it appears in-game. BOM applies the
            configured clock offset, then Discord displays the resulting instant
            correctly for every viewer.
          </small>
        </label>
        {port&&<ScheduleMessagePreview active={activeBattles} guilds={guilds} battle={{id:'preview',port_name:port.name,rate:port.rate,team_size:port.size??port.team_size,attacker,defender,signup_guild:signupGuild,status:'OPEN',starts_at:gameSelectionToIso(date,hour,gameTimeOffsetMinutes)}}/>}
        <div className="controlRow">
          <button type="button" className="outlineButton" onClick={onClose}>
            Cancel
          </button>
          <button
            className="goldButton"
            disabled={!portName || !attacker || !defender}
          >
            Schedule Port Battle
          </button>
        </div>
      </form>
    </div>
  );
}
function GuildSelector({
  label,
  value,
  onChange,
  guilds,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  guilds: any[];
}) {
  return (
    <label>
      {label}
      <div className="pbGuildQuick">
        {["BOM", "FAT", "DPS"].map((tag) => (
          <button
            type="button"
            className={value === tag ? "active" : ""}
            key={tag}
            onClick={() => onChange(tag)}
          >
            {tag}
          </button>
        ))}
      </div>
      <select value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Choose Guild…</option>
        {guilds.map((g: any) => (
          <option key={g.reference||g.tag} value={g.reference||g.tag}>
            {g.tag}
            {g.name && g.name !== g.tag ? ` · ${g.name}` : ""}
            {g.faction ? ` · ${g.faction}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
function PreferredShipsModal({
  catalogue,
  allowed,
  current,
  onClose,
  onSave,
}: {
  catalogue: any;
  allowed: any;
  current: any;
  onClose: () => void;
  onSave: (v: any) => void;
}) {
  const ships = catalogue?.ships ?? [],
    rates = [1, 2, 3, 4, 5, 6, 7],
    initial: any = {};
  for (const rate of rates) {
    const old = current?.rates?.[String(rate)] ?? {};
    initial[String(rate)] = {
      ships: [...(old.ships ?? [])],
      preferred: [...(old.preferred ?? [])],
    };
  }
  const [draft, setDraft] = useState<any>({
      rates: initial,
      horn_capable: Boolean(current?.horn_capable),
      horn_preferred: Boolean(current?.horn_preferred),
      horn_requirements_ack: Boolean(current?.horn_requirements_ack),
    }),
    [rate, setRate] = useState(1);
  const options = ships
      .filter(
        (s: any) =>
          Number(s.rate ?? s.level) === rate &&
          (!Array.isArray(allowed?.[String(rate)]) ||
            allowed[String(rate)].includes(s.name)),
      )
      .sort((a: any, b: any) => a.name.localeCompare(b.name)),
    entry = draft.rates[String(rate)] ?? { ships: [], preferred: [] };
  function toggleShip(name: string) {
    setDraft((d: any) => {
      const e = d.rates[String(rate)] ?? { ships: [], preferred: [] },
        has = e.ships.includes(name),
        nextShips = has
          ? e.ships.filter((x: string) => x !== name)
          : [...e.ships, name],
        nextPreferred = e.preferred.filter((x: string) =>
          nextShips.includes(x),
        );
      return {
        ...d,
        rates: {
          ...d.rates,
          [String(rate)]: { ships: nextShips, preferred: nextPreferred },
        },
      };
    });
  }
  function togglePref(name: string) {
    setDraft((d: any) => {
      const e = d.rates[String(rate)],
        has = e.preferred.includes(name),
        preferred = has
          ? e.preferred.filter((x: string) => x !== name)
          : e.preferred.length < 2
            ? [...e.preferred, name]
            : e.preferred;
      return {
        ...d,
        rates: { ...d.rates, [String(rate)]: { ...e, preferred } },
      };
    });
  }
  return (
    <div className="modalBackdrop">
      <form
        className="panel pbModal preferredModal"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(draft);
        }}
      >
        <div className="panelHead">
          <div>
            <span className="cardKicker">PLAYER PROFILE</span>
            <h2>Preferred Ships</h2>
            <span>
              Save your playable fleet once and reuse it in quick Port Battle
              signups.
            </span>
          </div>
          <button type="button" className="dangerGhost pbDismiss" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="buildTabs">
          {rates.map((r) => (
            <button
              type="button"
              key={r}
              className={rate === r ? "active" : ""}
              onClick={() => setRate(r)}
            >
              {rateLabel(r)}
            </button>
          ))}
        </div>
        <fieldset>
          <legend>Ships you can play</legend>
          <div className="pbShipChecklist pbVisualShipChecklist">
            {options.map((ship: any) => (
              <label
                key={ship.name}
                className={entry.ships.includes(ship.name) ? "selected" : ""}
              >
                <input
                  type="checkbox"
                  checked={entry.ships.includes(ship.name)}
                  onChange={() => toggleShip(ship.name)}
                />
                <img src={ship.image || "/wosb/navigation/ships.png"} alt="" />
                <span>
                  <b>{ship.name}</b>
                  <small>{ship.class ?? ship.type ?? `Rate ${rate}`}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Preferred ships · choose up to two</legend>
          <div className="pbShipChecklist pbPreferredChecklist">
            {entry.ships.map((name: string) => {
              const ship = ships.find((x: any) => x.name === name);
              return (
                <label
                  key={name}
                  className={entry.preferred.includes(name) ? "selected" : ""}
                >
                  <input
                    type="checkbox"
                    checked={entry.preferred.includes(name)}
                    onChange={() => togglePref(name)}
                  />
                  {ship?.image && <img src={ship.image} alt="" />}
                  <span>
                    <b>{name}</b>
                    <small>
                      {entry.preferred.includes(name)
                        ? "★ Preferred"
                        : "Mark preferred"}
                    </small>
                  </span>
                </label>
              );
            })}
            {!entry.ships.length && (
              <p className="muted">Choose playable ships above first.</p>
            )}
          </div>
        </fieldset>
        <div className="pbHornRequirements">
          <label className="checkLine pbHornPreference">
            <input
              type="checkbox"
              checked={draft.horn_capable}
              onChange={(e) =>
                setDraft((d: any) => ({
                  ...d,
                  horn_capable: e.target.checked,
                  horn_preferred: e.target.checked ? d.horn_preferred : false,
                  horn_requirements_ack: e.target.checked
                    ? d.horn_requirements_ack
                    : false,
                }))
              }
            />
            <span>
              <b>I Am Willing To / Can Play Horn</b>
              <small>
                Horn duty requires the Captain Skill that unlocks the additional
                consumable slot (<b>F</b>).
              </small>
            </span>
          </label>
          {draft.horn_capable && (
            <>
              <p>
                <strong>Required Horn loadout:</strong> Filling Ration in
                consumable slot 2 (<b>C</b>) and Horn in consumable slot 3 (
                <b>V</b>). Maintain at least <strong>300 Horns</strong> and{" "}
                <strong>300 Filling Rations</strong>. BOM reimburses the supply
                cost of running Horn.
              </p>
              <label className="checkLine">
                <input
                  type="checkbox"
                  checked={draft.horn_requirements_ack}
                  onChange={(e) =>
                    setDraft((d: any) => ({
                      ...d,
                      horn_requirements_ack: e.target.checked,
                    }))
                  }
                />
                <span>
                  <b>I Meet The Horn Requirements</b>
                  <small>
                    I have the additional consumable slot and will maintain the
                    required stock.
                  </small>
                </span>
              </label>
              <label className="checkLine">
                <input
                  type="checkbox"
                  checked={draft.horn_preferred}
                  onChange={(e) =>
                    setDraft((d: any) => ({
                      ...d,
                      horn_preferred: e.target.checked,
                    }))
                  }
                />
                <span>
                  <b>I Generally Prefer Horn Duty</b>
                  <small>
                    Leave this off if you can play Horn but generally prefer not
                    to.
                  </small>
                </span>
              </label>
            </>
          )}
        </div>
        <div className="controlRow">
          <button type="button" className="outlineButton" onClick={onClose}>
            Cancel
          </button>
          <button
            className="goldButton"
            disabled={draft.horn_capable && !draft.horn_requirements_ack}
          >
            Save Preferred Ships
          </button>
        </div>
      </form>
    </div>
  );
}
function GuestSignupModal({
  ships,
  onClose,
  onSave,
}: {
  ships: string[];
  onClose: () => void;
  onSave: (v: any) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]),
    [preferred, setPreferred] = useState<string[]>([]),
    [flares, setFlares] = useState<string[]>([]);
  return (
    <div className="modalBackdrop">
      <form
        className="panel pbModal"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          void onSave({
            name: String(fd.get("name") ?? ""),
            status: String(fd.get("status") ?? "ATTENDING"),
            ships: picked,
            preferredShips: preferred,
            hornCapable: fd.get("horn") === "on",
            flareCapabilities: flares,
            lateMinutes: Number(fd.get("late") ?? 0),
          });
        }}
      >
        <div className="panelHead">
          <div>
            <span className="cardKicker">OFFICER TOOL</span>
            <h2>Add Non-Discord Player</h2>
          </div>
          <button type="button" className="dangerGhost pbDismiss" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <label>
          Captain name
          <input name="name" required maxLength={80} />
        </label>
        <div className="formGrid">
          <label>
            Status
            <select name="status">
              <option value="ATTENDING">Attending</option>
              <option value="WAITLIST">Waitlist</option>
              <option value="LATE">Running Late</option>
            </select>
          </label>
          <label>
            Minutes late
            <input
              name="late"
              type="number"
              min={0}
              max={60}
              defaultValue={0}
            />
          </label>
        </div>
        <fieldset>
          <legend>Ships they can play</legend>
          <div className="pbShipChecklist">
            {ships.map((name) => (
              <label key={name}>
                <input
                  type="checkbox"
                  checked={picked.includes(name)}
                  onChange={() => {
                    setPicked((p) =>
                      p.includes(name)
                        ? p.filter((x) => x !== name)
                        : [...p, name],
                    );
                    setPreferred((p) => p.filter((x) => x !== name));
                  }}
                />
                {name}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Preferred · up to two</legend>
          <div className="pbShipChecklist">
            {picked.map((name) => (
              <label key={name}>
                <input
                  type="checkbox"
                  checked={preferred.includes(name)}
                  onChange={() =>
                    setPreferred((p) =>
                      p.includes(name)
                        ? p.filter((x) => x !== name)
                        : p.length < 2
                          ? [...p, name]
                          : p,
                    )
                  }
                />
                {name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="checkLine">
          <input name="horn" type="checkbox" /> Can play Horn
        </label>
        <fieldset className="pbFlareSignup">
          <legend>Signal Flare volunteering</legend>
          <div className="pbFlareChoices">
            {["Red Flare", "Gold Flare", "Blue Flare"].map((color) => (
              <label key={color}>
                <input
                  type="checkbox"
                  checked={flares.includes(color)}
                  onChange={() =>
                    setFlares((v) =>
                      v.includes(color)
                        ? v.filter((x) => x !== color)
                        : [...v, color],
                    )
                  }
                />
                <img
                  className="pbDutyIcon"
                  src={`/wosb/pb/duties/${color.toLowerCase().replace(" ", "-")}.png`}
                  alt=""
                />
                {color}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="controlRow">
          <button type="button" className="outlineButton" onClick={onClose}>
            Cancel
          </button>
          <button className="goldButton" disabled={!picked.length}>
            Add Player
          </button>
        </div>
      </form>
    </div>
  );
}
function ManageBattleModal({
  allowOwnerChange = true,
  battle,
  ports,
  guilds,
  gameTimeOffsetMinutes,
  onClose,
  onSave,
}: {
  allowOwnerChange?: boolean;
  battle: any;
  ports: any[];
  guilds: any[];
  gameTimeOffsetMinutes: number;
  onClose: () => void;
  onSave: (v: any) => void;
}) {
  const shown = battle.starts_at
      ? gameSelectionFromIso(battle.starts_at, gameTimeOffsetMinutes)
      : { date: shiftedLocalDate(), hour: 19 },
    review = battle.review ?? {};
  const [portName, setPortName] = useState(battle.port_name),
    [attacker, setAttacker] = useState(battle.attacker ?? ""),
    [defender, setDefender] = useState(battle.defender ?? ""),
    [date, setDate] = useState(shown.date),
    [hour, setHour] = useState(shown.hour);
  const port = ports.find((p: any) => p.name === portName);
  return (
    <div className="modalBackdrop">
      <form
        className="panel pbModal"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget),
            issueTags = String(fd.get("issueTags") ?? "")
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean);
          void onSave({
            signupGuild: String(
              fd.get("signupGuild") ?? battle.signup_guild ?? "BOM",
            ),
            portName,
            attacker,
            defender,
            startsAt: gameSelectionToIso(date, hour, gameTimeOffsetMinutes),
            status: String(fd.get("status") ?? battle.status),
            result: String(fd.get("result") ?? review.result ?? "UNKNOWN"),
            issueTags,
            reviewNotes: String(fd.get("reviewNotes") ?? ""),
          });
        }}
      >
        <div className="panelHead">
          <div>
            <span className="cardKicker">OFFICER TOOL</span>
            <h2>Manage Battle</h2>
          </div>
          <button type="button" className="dangerGhost pbDismiss" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {allowOwnerChange && (
          <label>
            Signup guild
            <select
              aria-label="Signup guild"
              name="signupGuild"
              defaultValue={battle.signup_guild ?? "BOM"}
            >
              {[
                ...new Set([
                  "BOM",
                  battle.signup_guild ?? "BOM",
                  ...guilds.filter((g) => g.allied).map((g) => g.tag),
                ]),
              ].map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Port
          <select
            value={portName}
            onChange={(e) => setPortName(e.target.value)}
          >
            {ports.map((p: any) => (
              <option key={p.entityKey ?? p.name} value={p.name}>
                {p.name} · {rateLabel(p.rate)} · {p.size}v{p.size}
              </option>
            ))}
          </select>
        </label>
        {port && (
          <div className="pbDerivedPort">
            <span>
              <small>Rate</small>
              <b>{rateLabel(port.rate)}</b>
            </span>
            <span>
              <small>Team Size</small>
              <b>
                {port.size}v{port.size}
              </b>
            </span>
          </div>
        )}
        <GuildSelector
          label="Attacker"
          value={attacker}
          onChange={setAttacker}
          guilds={guilds}
        />
        <GuildSelector
          label="Defender"
          value={defender}
          onChange={setDefender}
          guilds={guilds}
        />
        <label>
          Battle Date
          <div className="pbDateQuick">
            <button type="button" onClick={() => setDate(shiftedLocalDate())}>
              Today
            </button>
            <button type="button" onClick={() => setDate(shiftedLocalDate(1))}>
              Tomorrow
            </button>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Battle Time · In-Game
          <BattleHourButtons value={hour} onChange={setHour}/>
        </label>
        <label>
          Status
          <select name="status" defaultValue={battle.status}>
            <option value="OPEN">Open Signup</option>
            <option value="CLOSED">Closed Signup</option>
            <option value="FINISHED">Finished</option>
          </select>
        </label>
        <fieldset className="pbBattleReviewFields">
          <legend>Finished Battle Review · Officer Only</legend>
          <div className="formGrid">
            <label>
              Result
              <select name="result" defaultValue={review.result ?? "UNKNOWN"}>
                <option value="UNKNOWN">Not Recorded</option>
                <option value="WIN">Win</option>
                <option value="LOSS">Loss</option>
                <option value="DRAW">Draw</option>
              </select>
            </label>
            <label>
              Issue Tags
              <input
                name="issueTags"
                defaultValue={(review.issue_tags ?? []).join(", ")}
                placeholder="positioning, focus fire, mines…"
              />
            </label>
          </div>
          <label>
            Review Note
            <textarea name="reviewNotes" defaultValue={review.notes ?? ""} />
          </label>
        </fieldset>
        <div className="controlRow">
          <button type="button" className="outlineButton" onClick={onClose}>
            Cancel
          </button>
          <button className="goldButton">Save Battle</button>
        </div>
      </form>
    </div>
  );
}
