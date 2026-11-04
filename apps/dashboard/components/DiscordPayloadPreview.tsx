"use client";
import { useEffect, useState } from "react";
import { schedulePanels } from "@bom/shared";
const url = (v: any) => {
  const s = String(v ?? "");
  return /^(https?:\/\/|\/)/i.test(s) ? s : undefined;
};
function Copy({ text }: { text: any }) {
  const value = String(text ?? "").replace(/<t:(\d+):[A-Za-z]>/g, (_, unix) =>
    new Date(Number(unix) * 1000).toLocaleString(),
  );
  return (
    <div className="discordPayloadCopy">
      {value.split("\n").map((line, i) => {
        const heading = line.match(/^(#{1,3}) (.*)$/);
        const content = (heading ? heading[2] : line)
          .split(/(\*\*.*?\*\*)/g)
          .map((p, j) => (p.startsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : p));
        return heading ? (
          <div key={i} className={"discordPayloadHeading level" + heading[1].length}>
            {content}
          </div>
        ) : (
          <div key={i}>{content.length ? content : "\u00a0"}</div>
        );
      })}
    </div>
  );
}
function Component({ item }: { item: any }) {
  if (!item) return null;
  switch (item.type) {
    case 17:
      return (
        <div
          className="discordPayloadContainer"
          style={{
            borderLeftColor: item.accent_color
              ? "#" + Number(item.accent_color).toString(16).padStart(6, "0")
              : undefined,
          }}
        >
          {(item.components ?? []).map((c: any, i: number) => (
            <Component key={i} item={c} />
          ))}
        </div>
      );
    case 10:
      return <Copy text={item.content} />;
    case 14:
      return <hr />;
    case 1:
      return (
        <div className="discordPayloadRow">
          {(item.components ?? []).map((c: any, i: number) => (
            <Component key={i} item={c} />
          ))}
        </div>
      );
    case 2:
      return <span className={"discordPayloadButton style" + item.style}>{item.label || "Button"}</span>;
    case 9:
      return (
        <div className="discordPayloadSection">
          <div>
            {(item.components ?? []).map((c: any, i: number) => (
              <Component key={i} item={c} />
            ))}
          </div>
          <Component item={item.accessory} />
        </div>
      );
    case 11:
      return url(item.media?.url) ? (
        <img className="discordPayloadThumbnail" src={url(item.media.url)} alt="Message thumbnail" />
      ) : null;
    case 12:
      return (
        <div className="discordPayloadGallery">
          {(item.items ?? []).map((m: any, i: number) =>
            url(m.media?.url) ? (
              <img key={i} src={url(m.media.url)} alt={m.description || "Message image"} />
            ) : null,
          )}
        </div>
      );
    default:
      return (
        <small>Component {item.type} · inspect the message in Discord for its interactive behavior.</small>
      );
  }
}
export function DiscordPayloadPreview({ payload }: { payload: any }) {
  return (
    <div className="discordPayloadPreview" aria-label="Discord message content preview">
      {payload.content && <Copy text={payload.content} />}{" "}
      {(payload.components ?? []).map((c: any, i: number) => (
        <Component key={i} item={c} />
      ))}
      {(payload.embeds ?? []).map((e: any, i: number) => (
        <div className="discordPayloadContainer" key={i}>
          <Copy text={e.title} />
          <Copy text={e.description} />
          {e.fields?.map((f: any, j: number) => (
            <div key={j}>
              <b>{f.name}</b>
              <Copy text={f.value} />
            </div>
          ))}
          {url(e.image?.url) && <img src={url(e.image.url)} alt="Embed image" />}
        </div>
      ))}
    </div>
  );
}
export default function ScheduleMessagePreview({
  battle,
  active,
  guilds,
}: {
  battle: any;
  active: any[];
  guilds: any[];
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const pages = schedulePanels([...active, battle], {
    base: window.location.origin,
    guildId: "preview",
    guilds,
  });
  return (
    <details className="scheduleMessagePreview">
      <summary>
        Preview Discord schedule · {pages.length} message{pages.length === 1 ? "" : "s"}
      </summary>
      <p>
        Uses the same schedule payload renderer as the bot. Discord controls and timestamps are shown as a
        read-only preview; final artwork and platform font rendering may differ.
      </p>
      {pages.map((p: any, i: number) => (
        <DiscordPayloadPreview key={i} payload={p} />
      ))}
    </details>
  );
}
