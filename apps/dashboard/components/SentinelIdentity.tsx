"use client";
import { useState } from "react";

type Props = { id?: string | null; context: any; kind?: "person" | "target" };
function resolve(id: string, context: any) {
  const member = context?.members?.find((x: any) => String(x.id) === String(id));
  if (member)
    return {
      primary:
        member.username && member.username !== member.name
          ? `${member.name} (${member.username})`
          : member.name,
      secondary: member.bot ? "Discord bot" : "Discord user",
    };
  const role = context?.roles?.find((x: any) => String(x.id) === String(id));
  if (role) return { primary: `@${role.name}`, secondary: "Discord role" };
  const channel = context?.channels?.find((x: any) => String(x.id) === String(id));
  if (channel) return { primary: `#${channel.name}`, secondary: "Discord channel" };
  if (!/^\d{15,22}$/.test(String(id))) return { primary: String(id), secondary: "BOM system / service" };
  return { primary: "Unknown or former Discord user", secondary: "Discord ID" };
}
export default function SentinelIdentity({ id, context }: Props) {
  const [copied, setCopied] = useState(false);
  if (!id) return <span className="sentinelIdentity unknown">Unknown</span>;
  const info = resolve(String(id), context);
  async function copy() {
    try {
      await navigator.clipboard.writeText(String(id));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }
  return (
    <span className="sentinelIdentity">
      <span>
        <b>{info.primary}</b>
        <small>
          {info.secondary} · <code>{id}</code>
        </small>
      </span>
      <button type="button" onClick={copy} title={`Copy ${id}`}>
        {copied ? "Copied" : "Copy ID"}
      </button>
    </span>
  );
}
