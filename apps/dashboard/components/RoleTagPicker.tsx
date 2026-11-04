"use client";
import { useMemo, useState } from "react";
type Role = { id: string; name: string };
export default function RoleTagPicker({
  roles,
  value,
  onChange,
  max = 20,
  placeholder = "Search roles; Enter to add",
  onRefresh,
}: {
  roles: Role[];
  value: string[];
  onChange: (ids: string[]) => void;
  max?: number;
  placeholder?: string;
  onRefresh?: () => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const chosen = new Set(value.map(String));
  const options = useMemo(
    () =>
      roles
        .filter(
          (role) =>
            !chosen.has(String(role.id)) && role.name.toLocaleLowerCase().includes(q.toLocaleLowerCase()),
        )
        .slice(0, 10),
    [roles, q, value],
  );
  function add(id: string) {
    if (chosen.has(id) || value.length >= max) return;
    onChange([...value, String(id)]);
    setQ("");
    setOpen(false);
  }
  return (
    <div className="roleTagPicker">
      <div className="roleTagList">
        {value.map((id) => (
          <span className="roleTag" key={id}>
            {roles.find((r) => String(r.id) === String(id))?.name ?? id}
            <button
              className="iconCloseButton"
              type="button"
              aria-label={`Remove ${roles.find((r) => String(r.id) === String(id))?.name ?? id}`}
              onClick={() => onChange(value.filter((r) => String(r) !== String(id)))}
            >
              ×
            </button>
          </span>
        ))}
        {!value.length && <small>No roles selected</small>}
      </div>
      <div className="roleTagInputWrap">
        <input
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          value={q}
          placeholder={placeholder}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 125)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (options[0]) add(String(options[0].id));
            }
            if (e.key === "Escape") setOpen(false);
          }}
        />
        {onRefresh && (
          <button
            type="button"
            className="roleTagRefresh"
            onMouseDown={(e) => e.preventDefault()}
            title="Refresh Discord roles"
            aria-label="Refresh Discord roles"
            onClick={onRefresh}
          >
            ↻
          </button>
        )}
        {open && options.length > 0 && (
          <div className="roleTagSuggestions" role="listbox">
            {options.map((r) => (
              <button
                type="button"
                role="option"
                aria-selected={false}
                key={r.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(String(r.id))}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <small>
        {value.length}/{max} roles · Press Enter to add
      </small>
    </div>
  );
}
