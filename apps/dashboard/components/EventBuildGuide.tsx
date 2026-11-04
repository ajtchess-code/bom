"use client";
import EventItemIcon from "./EventItemIcon";
import EventCraftingCost from "./EventCraftingCost";
import { useState } from "react";
function Ship({ ship, n, tied }: { ship: any; n: number; tied?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <li>
      <span className="eventShipRank">{tied ? "=" : n}</span>
      {ship.image && !failed ? (
        <img src={ship.image} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="eventShipPlaceholder" aria-hidden="true">
          ⚓
        </span>
      )}
      <div>
        <b>{ship.name}</b>
        <EventCraftingCost ships={[ship]} />
      </div>
    </li>
  );
}
export default function EventBuildGuide({ guide, crew }: { guide: any[]; crew: string }) {
  return (
    <section id="halloween-ship-guide" tabIndex={-1} className="opsCard eventBuildGuide eventAnchor">
      <div>
        <span className="eventBadge tagPRIORITIZE">STANDARD EVENT BUILD</span>
        <h2>Standard Event Build</h2>
        <p>{crew}</p>
      </div>
      <div className="eventExampleImages">
        <figure>
          <a href="/event-guide/event-build-2026-10-24.png" target="_blank" rel="noreferrer">
            <img
              src="/event-guide/event-build-2026-10-24.png"
              alt="Huracan example event build: 2 Imperial Bombards, 85 42-pdr Carronades, 85 48-pdr Colossus, 9,500 Carcass Shells, 88 Seamen and 234 Mercenaries"
            />
          </a>
          <figcaption>Huracan example · adapt this setup to your event ship · open for full size</figcaption>
        </figure>
        <figure>
          <a href="/event-guide/event-crew-2026-10-24.png" target="_blank" rel="noreferrer">
            <img
              src="/event-guide/event-crew-2026-10-24.png"
              alt="Huracan crew example: 88 Seamen for 70% work speed, 234 Mercenaries, no Musketeers or Soldiers"
            />
          </a>
          <figcaption>
            <b>70% Work Speed (Seamen)</b> · Huracan example: 88 Seamen + 234 Mercenaries
          </figcaption>
        </figure>
      </div>
      <section className="eventPumpkinGuide">
        <span className="eventBadge tagPREFERRED">PUMPKIN COLLECTION</span>
        <h3>Speed build · Flying Cloud example</h3>
        <p>
          Whaling and collecting Pumpkins are highly useful for this event. Killing Ghost Ships is not a good
          use of farming time. For dedicated Pumpkin runs, prioritize a very fast ship such as a Flying Cloud.
        </p>
        <figure>
          <a href="/event-guide/flying-cloud-pumpkins-2026-10-24.png" target="_blank" rel="noreferrer">
            <img
              loading="lazy"
              src="/event-guide/flying-cloud-pumpkins-2026-10-24.png"
              width="415"
              height="345"
              alt="Speed-built Flying Cloud: Raiding Sails, Lightweight Hull, Reinforced Masts, Responsive Rudder, Double Hold, Blue Lantern with 6 percent speed, 100 Seamen, Second Lieutenant, Redhead, Lucky One, Sail Handler and Pilot"
            />
          </a>
          <figcaption>
            Flying Cloud speed build · dedicated Pumpkin collection · open for full size
          </figcaption>
        </figure>
        <h4>Reported Pumpkin drops</h4>
        <div className="eventPumpkinDrops">
          {["Insurance", "Construction Licenses", "Heavy Shot", "Voodoo Skulls", "Escudo"].map((name) => (
            <span key={name}>
              <EventItemIcon name={name} />
              {name}
            </span>
          ))}
        </div>
        <small>
          Possible rewards, not guaranteed drops. Opening a suspicious Pumpkin may also bring a nasty
          surprise.
        </small>
      </section>
      <details>
        <summary>Viable event ships · preferred order by rate</summary>
        <div className="eventShipGuideGrid">
          {guide.map((g) => (
            <section key={g.rate}>
              <h3>{g.rate}</h3>
              <ol>
                {g.ships.map((ship: any, n: number) => (
                  <Ship key={ship.name} ship={ship} n={n + 1} tied={g.tied?.includes(ship.name)} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      </details>
    </section>
  );
}
