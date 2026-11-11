"use client";
// One-page port battle cheat sheet, laid out to print on a single sheet or sit on a second screen.
const b = (n: string) => `/wosb/builds/${n}.png`;

export default function CheatSheet() {
  return (
    <section className="wpPlanner cheat">
      <div className="cheatBar">
        <div>
          <p className="gwEyebrow">PORT BATTLE CHEAT SHEET</p>
          <h2>Port battle cheat sheet</h2>
        </div>
        <button type="button" className="whCta" onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </div>
      <div className="cheatSheet">
        <article>
          <h3>Ammo</h3>
          <p className="cheatIcons">
            <img src={b("ammunition-saxon-shots")} alt="" /> <b>Saxon</b> for broadsides (fires add damage)
          </p>
          <p className="cheatIcons">
            <img src={b("ammunition-heavy-shots")} alt="" /> <b>Heavy</b> for bow, stern and finishing
          </p>
          <p>Swap ammo only right after a volley.</p>
        </article>
        <article>
          <h3>Consumables</h3>
          <ol>
            <li>Phosphorus + Large plates + Bronze patches</li>
            <li>Large smoke + Large plates + Bronze patches</li>
            <li>Large smoke + Large plates + Berserk's patch</li>
          </ol>
          <p>Smoke cuts fire, mortar and stern damage. Patch often, not at full health.</p>
        </article>
        <article>
          <h3>Aiming</h3>
          <ul>
            <li>
              <b>Left click</b>: broadside
            </li>
            <li>
              <b>Right click</b>: bow or stern (big penetration bonus there)
            </li>
            <li>Right click pauses other guns' reload. Armorer helps.</li>
            <li>Spyglass marker: orange = out of range, white = in range</li>
          </ul>
        </article>
        <article>
          <h3>Staying alive</h3>
          <ul>
            <li>
              Angle about <b>40°</b> when taking fire
            </li>
            <li>
              Pull back at <b>40% health</b>
            </li>
            <li>Repair at speed 1 when not firing or being hit</li>
            <li>Reverse out near max range; turn out if deep in range</li>
            <li>
              <b>Never</b> show your stern
            </li>
          </ul>
        </article>
        <article>
          <h3>Positions</h3>
          <ul>
            <li>
              <b>Main line</b>: push towers and fort, hold their line
            </li>
            <li>
              <b>Flankers</b>: stop their flankers
            </li>
            <li>Stay at max range unless the team charges together</li>
            <li>Hit towers when you can; they don't heal</li>
            <li>Every sinking costs the team points</li>
          </ul>
        </article>
        <article>
          <h3>Hold (1st rate)</h3>
          <table>
            <tbody>
              <tr>
                <td>Wood</td>
                <td>~3,000</td>
              </tr>
              <tr>
                <td>Fabric</td>
                <td>~500</td>
              </tr>
              <tr>
                <td>Food</td>
                <td>~400</td>
              </tr>
              <tr>
                <td>Ammo</td>
                <td>80% Saxon / 20% Heavy</td>
              </tr>
              <tr>
                <td>Fire ships</td>
                <td>4–6</td>
              </tr>
              <tr>
                <td>Mines</td>
                <td>any</td>
              </tr>
            </tbody>
          </table>
          <p>Hold insurance: 40 scrolls (port shop). You get ~9 minutes to check.</p>
        </article>
        <article>
          <h3>Upgrades (heavy)</h3>
          <ul>
            <li>Tacking sails</li>
            <li>Ammunition cradles (~12% faster reload)</li>
            <li>Fortified gun ports (range)</li>
            <li>Repair arsenal (~20% stronger repairs)</li>
            <li>Optional: Combat arsenal</li>
          </ul>
        </article>
        <article>
          <h3>Ship types</h3>
          <ul>
            <li>
              <b>Heavy</b>: best for most players
            </li>
            <li>
              <b>Combat</b>: skilled flankers
            </li>
            <li>
              <b>Siege</b>: towers and fort
            </li>
            <li>
              <b>Fast</b>: leave at home
            </li>
          </ul>
        </article>
      </div>
      <p className="gwMuted cheatFoot">Band of Misfits · full detail in the New Player Guide, chapter 7.</p>
    </section>
  );
}
