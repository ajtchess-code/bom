"use client";
import ScheduleMessagePreview from "../DiscordPayloadPreview";
import SavedViewControl from "../SavedViewControl";
import BattleCoordination from "../BattleCoordination";
import BattleHourButtons from '../BattleHourButtons';
import CancelPortBattle from "../CancelPortBattle";
import { useEffect, useMemo, useRef, useState } from "react";
import {createPortal} from "react-dom";
import PortBattleInvitations from "../PortBattleInvitations";
import TerritoryMap from "../TerritoryMap";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  emitInspector,
  emitRecent,
  emitToast,
  usePersistedState,
} from "@/lib/dashboardQoL";


export function CaptainIdentity({signup,onInspect}:{signup:any;onInspect:()=>void}){const initials=String(signup.display_name??'?').replace(/\[[^\]]*\]/g,'').trim().split(/\s+/).slice(0,2).map((x:string)=>x[0]).join('');return <button type="button" className="pbCaptainIdentity" onClick={onInspect}><span className="pbCaptainAvatar">{signup.avatar_url?<img src={signup.avatar_url} alt="" onError={e=>{e.currentTarget.style.display='none'}}/>:initials}</span><span><b>{signup.display_name}</b>{Number(signup.late_minutes)>0&&<small>Running Late · +{signup.late_minutes} min</small>}</span></button>}
export function Captain({signup,draggable,onDrag,selected,onSelect,onInspect,onQuickAssign,availableShips=[],onAssignShip,draftShip=""}:{signup:any;draggable:boolean;onDrag:()=>void;selected:boolean;onSelect:()=>void;onInspect:()=>void;onQuickAssign?:()=>void;availableShips?:string[];onAssignShip?:(ship:string)=>void;draftShip?:string}){
 const ships=(signup.ships??[]).filter((ship:string)=>availableShips.includes(ship)),missed=Number(signup.participation_priority?.missed??0);
 return <article className={`pbCaptain ${missed?'pbPriorityCaptain':''} ${selected?'selected':''} ${!ships.length?'pbNeedsShips':''}`} draggable={draggable&&ships.length>0} onDragStart={onDrag} onClick={e=>{if(draggable&&ships.length&&!(e.target as HTMLElement).closest('button,input,select,a'))onSelect();}} >
 <div className="pbCaptainTop">{draggable&&<input className="pbBulkCheck" type="checkbox" disabled={!ships.length} checked={selected} onChange={onSelect} aria-label={`Select ${signup.display_name} for bulk placement`}/>}<CaptainIdentity signup={signup} onInspect={draggable?onSelect:onInspect}/></div>
 <div className="pbCaptainShips">{ships.length?ships.map((ship:string)=><span key={ship}>{(signup.preferred_ships??[]).includes(ship)?'★ ':''}{ship}</span>):<span className="pbMissingShips">Needs Ship Choices · not assignable</span>}</div>
 <div className="pbCaptainBadges">{missed>0&&<span className="pbPriorityBadge" title={`Signed up but not confirmed in ${missed} of the last ${signup.participation_priority?.window??3} completed battles`}>Missed {missed} recent fleet{missed===1?'':'s'}</span>}{signup.horn_capable&&<span>📯 Horn Capable</span>}{signup.flare_capabilities?.length>0&&<span title={signup.flare_capabilities.join(', ')}>🚩 {signup.flare_capabilities.length} flare options</span>}</div>
 {onAssignShip&&ships.length>0&&<select className="pbQuickAssign" aria-label={`Assign ${signup.display_name} to ship`} value={draftShip} onChange={e=>{if(e.target.value)onAssignShip(e.target.value)}}><option value="">Choose Ship…</option>{ships.map((ship:string)=><option key={ship} value={ship}>{ship}</option>)}</select>}
 </article>;
}
export function AssignedCaptain({
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
