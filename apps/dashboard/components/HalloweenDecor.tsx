/** Decorations occupy their own dividers and never cover controls or receive focus. */
function Spider() {
  return (
    <div className="halloweenSpiderDrop">
      <i className="halloweenSilk" />
      <svg className="halloweenSpider" viewBox="0 0 100 90">
        <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path
            className="spiderLegsLeft"
            d="M39 36L19 19L11 4M36 42L12 34L3 22M36 50L12 55L3 72M40 57L22 72L18 87"
          />
          <path
            className="spiderLegsRight"
            d="M61 36L81 19L89 4M64 42L88 34L97 22M64 50L88 55L97 72M60 57L78 72L82 87"
          />
        </g>
        <ellipse cx="50" cy="48" rx="21" ry="25" fill="currentColor" />
        <circle cx="50" cy="27" r="13" fill="currentColor" />
        <circle cx="44" cy="25" r="3" fill="#ffcf80" />
        <circle cx="56" cy="25" r="3" fill="#ffcf80" />
        <path d="M43 51Q50 58 57 51" fill="none" stroke="#b777df" strokeWidth="3" />
      </svg>
    </div>
  );
}
function Candy() {
  return (
    <svg className="halloweenCandyCluster" viewBox="0 0 260 200">
      <g transform="translate(150 30) rotate(20)">
        <path d="M0 44V155" stroke="#d6b5d9" strokeWidth="9" />
        <circle r="46" fill="#9e55a6" stroke="#efad55" strokeWidth="4" />
        <path
          d="M0 0C-5 -11 -21 -5 -17 8C-11 25 17 21 22 3C29 -23 -7 -38 -27 -17C-52 10 -25 43 6 39"
          fill="none"
          stroke="#ffd089"
          strokeWidth="11"
        />
      </g>
      <g transform="translate(68 138)">
        <ellipse rx="48" ry="39" fill="#b75325" />
        <ellipse rx="30" ry="40" fill="#e88837" />
        <ellipse rx="13" ry="40" fill="#f5a64b" />
        <path d="M0 -38Q-5 -55 7 -61" fill="none" stroke="#6e8053" strokeWidth="8" />
        <path d="M-27 -4L-17 -20L-10 -2M10 -2L17 -20L27 -4M-27 12L-13 26L0 19L13 26L27 12Z" fill="#3d2041" />
      </g>
    </svg>
  );
}
export default function HalloweenDecor() {
  return (
    <div className="halloweenDecor" aria-hidden="true">
      <svg className="halloweenCornerWeb" viewBox="0 0 240 240">
        <g fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M0 0L240 18M0 0L222 87M0 0L170 170M0 0L87 222M0 0L18 240" />
          {[0.25, 0.5, 0.75, 1].map((s) => (
            <path
              key={s}
              transform={`scale(${s})`}
              d="M240 18Q197 32 222 87Q173 91 170 170Q91 173 87 222Q32 197 18 240"
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
export function HalloweenDivider({ spider = false }: { spider?: boolean }) {
  return (
    <div className="eventThemeDivider" aria-hidden="true">
      <div className="eventDividerCandy">
        <Candy />
      </div>
      <i className="eventDividerLine" />
      {spider && <Spider />}
      <div className="eventDividerCandy right">
        <Candy />
      </div>
    </div>
  );
}
