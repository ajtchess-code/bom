"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LANGUAGES, normalizeLocale } from "@bom/shared";

const localeCountries: Record<string, string> = {
  "en-US": "US",
  es: "ES",
  ru: "RU",
  ko: "KR",
  "zh-CN": "CN",
  de: "DE",
  fr: "FR",
  "pt-BR": "BR",
  ja: "JP",
  it: "IT",
  pl: "PL",
  tr: "TR",
  uk: "UA",
  nl: "NL",
  sv: "SE",
  no: "NO",
  da: "DK",
  fi: "FI",
  cs: "CZ",
  el: "GR",
};

function FlagIcon({ code }: { code: string }) {
  const c = code.toUpperCase();
  const common = {
    width: 22,
    height: 16,
    viewBox: "0 0 22 16",
    role: "img",
    "aria-label": `${c} flag`,
    className: "languageFlag",
  } as const;
  if (c === "US")
    return (
      <svg {...common}>
        <rect width="22" height="16" fill="#fff" />
        <g fill="#b22234">
          {[0, 2, 4, 6, 8, 10, 12].map((y) => (
            <rect key={y} y={(y * 16) / 13} width="22" height={16 / 13} />
          ))}
        </g>
        <rect width="9.5" height="8.6" fill="#3c3b6e" />
        <g fill="#fff">
          {[1.3, 3.3, 5.3, 7.3].flatMap((y, ri) =>
            [1.4, 3.1, 4.8, 6.5, 8.2].map((x, ci) => <circle key={`${ri}-${ci}`} cx={x} cy={y} r=".42" />),
          )}
        </g>
      </svg>
    );
  if (c === "ES")
    return (
      <svg {...common}>
        <rect width="22" height="16" fill="#aa151b" />
        <rect y="4" width="22" height="8" fill="#f1bf00" />
        <rect x="7" y="6" width="1.5" height="4" fill="#aa151b" />
      </svg>
    );
  if (c === "RU")
    return (
      <svg {...common}>
        <rect width="22" height="16" fill="#fff" />
        <rect y="5.333" width="22" height="5.334" fill="#0039a6" />
        <rect y="10.667" width="22" height="5.333" fill="#d52b1e" />
      </svg>
    );
  if (c === "KR")
    return (
      <svg {...common}>
        <rect width="22" height="16" fill="#fff" />
        <circle cx="11" cy="8" r="3.3" fill="#cd2e3a" />
        <path d="M7.7 8a3.3 3.3 0 0 0 6.6 0c-1.7 1.4-3.1-1.4-4.7 0-1 .8-1.5.6-1.9 0z" fill="#0047a0" />
        <g stroke="#111" strokeWidth=".75">
          <path d="M3 3l3 1M2.7 4.3l3 1M16 11l3 1M15.7 12.3l3 1M16 4l3-1M16.3 5.3l3-1M3 12l3-1M2.7 10.7l3-1" />
        </g>
      </svg>
    );
  if (c === "CN")
    return (
      <svg {...common}>
        <rect width="22" height="16" fill="#de2910" />
        <text x="4.2" y="6" fontSize="4.7" fill="#ffde00" textAnchor="middle">
          ★
        </text>
        <g fill="#ffde00">
          <circle cx="8" cy="2.6" r=".65" />
          <circle cx="9.4" cy="4.3" r=".65" />
          <circle cx="9.1" cy="6.5" r=".65" />
          <circle cx="7.5" cy="7.9" r=".65" />
        </g>
      </svg>
    );
  if (c === "DE")
    return (
      <svg {...common}>
        <rect width="22" height="16" fill="#000" />
        <rect y="5.333" width="22" height="5.334" fill="#dd0000" />
        <rect y="10.667" width="22" height="5.333" fill="#ffce00" />
      </svg>
    );
  if (c === "FR")
    return (
      <svg {...common}>
        <rect width="22" height="16" fill="#fff" />
        <rect width="7.34" height="16" fill="#0055a4" />
        <rect x="14.66" width="7.34" height="16" fill="#ef4135" />
      </svg>
    );
  if (c === "BR")
    return (
      <svg {...common}>
        <rect width="22" height="16" fill="#009739" />
        <path d="M11 2.1L19 8l-8 5.9L3 8z" fill="#ffdf00" />
        <circle cx="11" cy="8" r="3.2" fill="#002776" />
        <path d="M8.3 7.4c1.7-.6 3.6-.3 5.5.7" fill="none" stroke="#fff" strokeWidth=".55" />
      </svg>
    );
  if (c === "JP")
    return (
      <svg {...common}>
        <rect width="22" height="16" fill="#fff" />
        <circle cx="11" cy="8" r="4" fill="#bc002d" />
      </svg>
    );
  if (c === "IT")
    return (
      <svg {...common}>
        <rect width="22" height="16" fill="#fff" />
        <rect width="7.34" height="16" fill="#009246" />
        <rect x="14.66" width="7.34" height="16" fill="#ce2b37" />
      </svg>
    );
  if (c === "PL")
    return (
      <svg {...common}>
        <rect width="22" height="16" fill="#fff" />
        <rect y="8" width="22" height="8" fill="#dc143c" />
      </svg>
    );
  if (c === "TR")
    return (
      <svg {...common}>
        <rect width="22" height="16" fill="#e30a17" />
        <circle cx="8.5" cy="8" r="4" fill="#fff" />
        <circle cx="9.8" cy="8" r="3.2" fill="#e30a17" />
        <text x="13.8" y="10" fontSize="4.8" fill="#fff" textAnchor="middle">
          ★
        </text>
      </svg>
    );
  if (c === "UA")
    return (
      <svg {...common}>
        <rect width="22" height="8" fill="#0057b7" />
        <rect y="8" width="22" height="8" fill="#ffd700" />
      </svg>
    );
  if (c === "NL")
    return (
      <svg {...common}>
        <rect width="22" height="16" fill="#fff" />
        <rect width="22" height="5.333" fill="#ae1c28" />
        <rect y="10.667" width="22" height="5.333" fill="#21468b" />
      </svg>
    );
  if (c === "SE")
    return (
      <svg {...common}>
        <rect width="22" height="16" fill="#006aa7" />
        <rect x="6" width="2.5" height="16" fill="#fecc00" />
        <rect y="6.75" width="22" height="2.5" fill="#fecc00" />
      </svg>
    );
  if (c === "NO")
    return (
      <svg {...common}>
        <rect width="22" height="16" fill="#ba0c2f" />
        <rect x="5.5" width="4" height="16" fill="#fff" />
        <rect y="6" width="22" height="4" fill="#fff" />
        <rect x="6.5" width="2" height="16" fill="#00205b" />
        <rect y="7" width="22" height="2" fill="#00205b" />
      </svg>
    );
  if (c === "DK")
    return (
      <svg {...common}>
        <rect width="22" height="16" fill="#c8102e" />
        <rect x="6" width="2" height="16" fill="#fff" />
        <rect y="7" width="22" height="2" fill="#fff" />
      </svg>
    );
  if (c === "FI")
    return (
      <svg {...common}>
        <rect width="22" height="16" fill="#fff" />
        <rect x="6" width="3" height="16" fill="#003580" />
        <rect y="6.5" width="22" height="3" fill="#003580" />
      </svg>
    );
  if (c === "CZ")
    return (
      <svg {...common}>
        <rect width="22" height="8" fill="#fff" />
        <rect y="8" width="22" height="8" fill="#d7141a" />
        <path d="M0 0l10 8L0 16z" fill="#11457e" />
      </svg>
    );
  if (c === "GR")
    return (
      <svg {...common}>
        <rect width="22" height="16" fill="#0d5eaf" />
        {[1, 3, 5, 7].map((i) => (
          <rect key={i} y={(i * 16) / 9} width="22" height={16 / 9} fill="#fff" />
        ))}
        <rect width="8.9" height="8.9" fill="#0d5eaf" />
        <rect x="3.55" width="1.8" height="8.9" fill="#fff" />
        <rect y="3.55" width="8.9" height="1.8" fill="#fff" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect width="22" height="16" rx="1" fill="#27313b" />
      <text x="11" y="10.8" textAnchor="middle" fontSize="6" fill="#dce4ec">
        {c}
      </text>
    </svg>
  );
}

export default function LanguageSelect({
  value,
  onChange,
  ariaLabel = "Language",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const normalized = normalizeLocale(value);
  const current = useMemo(() => LANGUAGES.find((l) => l.value === normalized) ?? LANGUAGES[0], [normalized]);
  const currentCountry = localeCountries[current.value] ?? current.value.split("-").at(-1) ?? "US";
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <div ref={root} className={`languageSelect ${open ? "open" : ""} ${className}`.trim()}>
      <button
        type="button"
        className="languageSelectButton"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((x) => !x)}
      >
        <FlagIcon code={currentCountry} />
        <span>{current.label}</span>
        <i aria-hidden="true">⌄</i>
      </button>
      {open && (
        <div className="languageMenu" role="listbox" aria-label={ariaLabel}>
          {LANGUAGES.map((language) => {
            const country = localeCountries[language.value] ?? language.value.split("-").at(-1) ?? "US";
            const selected = language.value === normalized;
            return (
              <button
                type="button"
                key={language.value}
                role="option"
                aria-selected={selected}
                className={selected ? "selected" : ""}
                onClick={() => {
                  onChange(language.value);
                  setOpen(false);
                }}
              >
                <FlagIcon code={country} />
                <span>
                  {language.label}
                  <small>{language.value}</small>
                </span>
                {selected && <b aria-hidden="true">✓</b>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
