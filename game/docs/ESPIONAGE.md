# The Whisper Court

The Whisper Court is the realm's bounded intelligence service. It is managed from
the **WHISPERS** tab and resolves once at the annual rollover. It never runs per
frame or per tick.

## Agents

- Up to six agents serve at once.
- An agent is a living adult resident from the world, not a generated token card.
- Recruiting costs 14 gold; every agent draws a 3 gold yearly wage.
- Guile is the resident's average learning, trade and command skill.
- Agents can be dismissed at any time; the recruit cost is not refunded.

## Desks

| Desk | Target | Success builds | Real effect |
| --- | --- | --- | --- |
| Foreign court | A named neighbouring realm | Foreign insight | Lowers raid damage in `combat.js` by up to 18% |
| Noble houses | A named noble house | Noble insight | An exposed plot raises that house's loyalty |
| Market watch | The realm | Market insight | Improves buy and sell terms; seizes contraband gold |
| City watch | The realm | Watch strength | Steadies morale |
| Counter-intelligence | The realm | — | Lowers suspicion before missions resolve |

Foreign and noble desks require a named target. The other desks work the realm
itself. Each field agent attempts one mission per year.

## Suspicion and exposure

- Every field mission adds suspicion; failures add more.
- Counter-intelligence agents subtract suspicion before missions resolve.
- At 50 or more suspicion, a failed mission can cost the agent and trigger a
  diplomatic incident: the target realm's relation with the crown falls.
- Unpaid wages lower loyalty and can drive an agent out of the court.

## Rival counter-intelligence

The court is not invisible. Active missions and suspicion build **rival
pressure**; counter-intelligence agents reduce it. Once pressure passes 25, a
foreign court may turn a field agent. A turned agent stays on the roster but
files false reports, leaks gold and raises rival pressure further. Cover grows
with successes and falls after failures; a report that cannot be corroborated
is the warning.

**SCREEN THE COURT** costs 18 gold, can be ordered once a year, and unmasks
every turned agent, restoring cover and a little loyalty. The panel shows rival
pressure, the last screening result, false reports and gold leaked, but never
reveals which agent is turned until the player screens.

## Insight

Foreign, market, noble and watch insight are capped at 100 and fade by 12% each
year (watch strength fades by 10%). Missions add to the faded base, so an idle
court slowly loses its edge. The player sees the exact effect of each reading in
the WHISPERS panel: raid warning, market terms, plots exposed and street calm.

## Persistence

`state.espionage` stores agents, reports, annual history, insight, suspicion and
totals. It is additive and optional: current saves keep schema 12. A save
without the block normalizes to a quiet empty court with zero insight, so legacy
realms gain no retroactive agents or effects.

The annual pass is registered in `simulation.js` after the noble houses and
realms it reads, and is bounded to the six-agent roster plus the report and
history limits.
