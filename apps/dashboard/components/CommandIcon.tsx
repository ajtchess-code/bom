import type { SVGProps, ReactNode } from "react";

// Dependency-free outline icons using the open-source Lucide visual language (ISC).

export type IconName="home"|"music"|"sentinel"|"admin"|"search"|"bell"|"shield"|"palette"|"copy"|"arrow"|"activity"|"settings"|"user"|"users"|"radio"|"database"|"backup"|"health"|"queue"|"history"|"book"|"ship"|"map"|"hammer"|"battle"|"feedback"|"sun"|"moon"|"plus"|"star"|"menu"|"close"|"chevronDown";

const paths:Record<IconName,ReactNode>={
  home:<><path d="M3 10.7 12 3l9 7.7"/><path d="M5.5 9.8V21h13V9.8"/><path d="M9.5 21v-6h5v6"/></>,
  music:<><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></>,
  sentinel:<><path d="M12 2.7 20 6v5.3c0 5.1-3.2 8.4-8 10-4.8-1.6-8-4.9-8-10V6l8-3.3Z"/><path d="m8.8 12 2.1 2.1 4.5-5"/></>,
  admin:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.97 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.52-1.03H3v-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 10 3.05V3h4v.05a1.7 1.7 0 0 0 1.03 1.52 1.7 1.7 0 0 0 1.88-.34l.06-.06L19.8 7l-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/></>,
  search:<><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
  bell:<><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  shield:<><path d="M12 2.7 20 6v5.3c0 5.1-3.2 8.4-8 10-4.8-1.6-8-4.9-8-10V6l8-3.3Z"/></>,
  palette:<><path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5H12a1.5 1.5 0 0 1 0-3h3a6 6 0 0 0 0-12h-3Z"/><circle cx="7.5" cy="9" r=".7"/><circle cx="10" cy="6.5" r=".7"/><circle cx="14" cy="6.5" r=".7"/></>,
  copy:<><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
  arrow:<path d="M5 12h14m-5-5 5 5-5 5"/>,
  activity:<><path d="M3 12h4l2-6 4 12 2-6h6"/></>,
  settings:<><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.08-1l2-1.55-2-3.46-2.47.99a7 7 0 0 0-1.73-1L14.34 3h-4.68l-.38 2.98a7 7 0 0 0-1.73 1L5.08 6 3.08 9.45 5.08 11a7 7 0 0 0 0 2l-2 1.55 2 3.46 2.47-.99a7 7 0 0 0 1.73 1l.38 2.98h4.68l.38-2.98a7 7 0 0 0 1.73-1l2.47.99 2-3.46L18.92 13c.05-.33.08-.66.08-1Z"/></>,
  user:<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  users:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  radio:<><circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.7 5.7a9 9 0 0 0 0 12.6M18.3 5.7a9 9 0 0 1 0 12.6"/></>,
  database:<><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></>,
  backup:<><path d="M4 8h11a5 5 0 1 1-4.7 6.7"/><path d="m4 8 3-3M4 8l3 3"/></>,
  health:<><path d="M3 12h4l2-5 4 10 2-5h6"/></>,
  queue:<><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".7"/><circle cx="4" cy="12" r=".7"/><circle cx="4" cy="18" r=".7"/></>,
  history:<><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
  book:<><path d="M4 4.5c2.7-.8 5.3-.3 8 1.5v14c-2.7-1.8-5.3-2.3-8-1.5v-14Z"/><path d="M20 4.5c-2.7-.8-5.3-.3-8 1.5v14c2.7-1.8 5.3-2.3 8-1.5v-14Z"/></>,
  ship:<><path d="M3 15.5 5.5 20h13l2.5-4.5-9-3.5-9 3.5Z"/><path d="M7 13V7h8l2 6M11 7V3h3v4M4.5 20c1.3 1 2.7 1 4 0 1.3 1 2.7 1 4 0 1.3 1 2.7 1 4 0"/></>,
  map:<><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3V6Z"/><path d="M8 3v15M16 6v15"/></>,
  hammer:<><path d="m14 4 6 6-3 3-6-6 3-3Z"/><path d="m12 9-8 8a2.1 2.1 0 0 0 3 3l8-8"/><path d="m5 4 3-1 3 3-2 2-4-4Z"/></>,
  battle:<><path d="m6 3 12 18M18 3 6 21"/><path d="M4 5h4M16 5h4M4 19h4M16 19h4"/></>,
  feedback:<><path d="M4 4h16v12H8l-4 4V4Z"/><path d="M8 8h8M8 12h5"/></>,
  sun:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></>,
  moon:<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/>,
  plus:<><path d="M12 5v14M5 12h14"/></>,
  star:<path d="m12 2.8 2.82 5.72 6.31.92-4.57 4.45 1.08 6.28L12 17.2l-5.64 2.97 1.08-6.28-4.57-4.45 6.31-.92L12 2.8Z"/>,
  menu:<><path d="M4 7h16M4 12h16M4 17h16"/></>,
  close:<><path d="m6 6 12 12M18 6 6 18"/></>,
  chevronDown:<path d="m6 9 6 6 6-6"/>
};

export default function CommandIcon({name,size=20,...props}:{name:IconName;size?:number}&SVGProps<SVGSVGElement>){
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
