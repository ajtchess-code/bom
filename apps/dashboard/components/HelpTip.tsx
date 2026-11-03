"use client";
import {ReactNode} from "react";

export default function HelpTip({title,children}:{title:string;children:ReactNode}){
  return <span className="helpTip" tabIndex={0} aria-label={title}>
    <span className="helpTipMark" aria-hidden="true">?</span>
    <span className="helpTipBubble" role="tooltip"><b>{title}</b><span>{children}</span></span>
  </span>;
}
