"use client";
import { useState } from "react";
export default function GuildEmojiUploader({ onCreated }: { onCreated: (reaction: string) => void }) {
  const [name, setName] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState("");
  async function upload() {
    if (!file || !name.trim()) return;
    setBusy(true);
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
        throw new Error("Upload a PNG, JPG or WebP image.");
      if (file.size > 1024 * 1024) throw new Error("Image must be under 1 MB.");
      const img = new Image(),
        url = URL.createObjectURL(file);
      try {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Could not decode file"));
          img.src = url;
        });
        const c = document.createElement("canvas");
        c.width = c.height = 128;
        const cx = c.getContext("2d");
        if (!cx) throw new Error("Image conversion unavailable");
        const scale = Math.min(128 / img.naturalWidth, 128 / img.naturalHeight);
        cx.drawImage(
          img,
          (128 - img.naturalWidth * scale) / 2,
          (128 - img.naturalHeight * scale) / 2,
          img.naturalWidth * scale,
          img.naturalHeight * scale,
        );
        const data = c.toDataURL("image/png").split(",")[1];
        const r = await fetch("/api/internal/admin/automations/emoji", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, mime: "image/png", data }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `Discord returned ${r.status}`);
        onCreated(j.reaction);
        setMsg(`Created :${j.name}: in Discord and added it to reactions.`);
        setName("");
        setFile(null);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="guildEmojiUploader">
      <b>Upload & create a Discord emoji</b>
      <p className="muted">
        The image is centered at 128×128. Requires Discord permission to create guild expressions.
      </p>
      <div className="guildEmojiUploadRow">
        <input
          value={name}
          onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
          placeholder="emoji_name"
          maxLength={32}
        />
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          className="outlineButton"
          type="button"
          disabled={busy || !file || name.length < 2}
          onClick={() => void upload()}
        >
          {busy ? "Uploading…" : "Create emoji"}
        </button>
      </div>
      {msg && <small role="status">{msg}</small>}
    </div>
  );
}
