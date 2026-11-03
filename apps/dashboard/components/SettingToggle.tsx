"use client";
export default function SettingToggle({label,checked,onChange,description}:{label:string;checked:boolean;onChange:(checked:boolean)=>void;description?:string}){
 return <div className="membershipSettingToggle"><span><b>{label}</b>{description&&<small>{description}</small>}</span><button type="button" role="switch" aria-label={label} aria-checked={checked} onClick={()=>onChange(!checked)} className={`membershipToggleSwitch ${checked?'isOn':'isOff'}`}><span className="membershipToggleKnob"/><em>{checked?'On':'Off'}</em></button></div>;
}
