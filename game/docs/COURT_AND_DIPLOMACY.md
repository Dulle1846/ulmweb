# Royal court and living diplomacy

**Status:** implemented and published as a separate Freebuff Sites build on 2026-11-09; the Cloudflare Pages production branch and its `3.9.0` release were not changed.
**Production URL:** https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page
**Preview URL:** https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page
**Scope:** six named court offices, annual salaries and corruption, one faction petition per year, and appointed envoys to the four neighbour realms.

## Why this layer exists

Before this slice, government was a 44-line constitution switch, politics was a faction meter, and diplomacy was four relation numbers with one treaty slot. Those systems had labels but almost no people, cost or consequence. The court now gives the crown a real internal political layer: named residents hold offices, their traits and needs determine how well they serve, and their salaries and integrity have measurable effects on the economy, health, warfare and diplomacy.

## The six offices

| Office | Primary trait | Secondary trait | Concrete effect |
|---|---|---|---|
| Chancellor | Sociability | Patience | Stronger gift/treaty relation gains, better trade terms |
| Steward | Discipline | Curiosity | Higher tax efficiency, annual estate savings |
| Marshal | Courage | Discipline | Higher defender damage, lower raid damage |
| Spymaster | Distrust | Curiosity | Fewer border incidents, less corruption |
| Chaplain | Piety | Compassion | Lower disease transmission |
| Jurist | Discipline | Compassion | Annual legitimacy, less corruption |

A resident can hold only one office, the sovereign cannot hold an office, and only adults are eligible. Appointment costs 6 gold and writes a personal memory. Competence, loyalty and integrity are derived from the resident's actual traits, needs and relationship with the sovereign; they are not random labels.

## Annual court audit

The court updates once per realm year in the year-rollover block:

- Salaries are paid from the treasury. Unpaid salaries lower loyalty.
- Low-integrity ministers can skim gold; the spymaster and jurist reduce this risk.
- A paid steward produces bounded estate savings.
- The jurist adds a small annual legitimacy gain; the chaplain adds a small morale gain.
- A dead officeholder is removed and the office becomes vacant. Low-loyalty ministers can resign.
- The result is written to a bounded `lastAudit` record and the court history.

## Petitions

One petition is raised per year and expires at the next annual audit. It targets the faction with the lowest current support. Granting it spends the displayed goods, raises that faction and legitimacy, and writes a personal memory for the sovereign. Ignoring it lowers the faction and legitimacy and is recorded as `petition-ignored`; no petition is silently forgotten.

## Envoys

Each neighbour realm can receive one named envoy for 8 gold. Envoy skill is derived from the resident's sociability, patience, curiosity and distrust. An envoy:

- improves annual relation and trust,
- improves the realm's trade terms,
- cannot serve while the realm is at war,
- cannot be a court minister or the sovereign,
- is recalled automatically when a war begins and can be recalled manually.

The diplomacy panel exposes the envoy, skill, appointment year, relation, trust, fear, goods traded, war exhaustion and the existing treaty actions.

## Integration points

- `economy.js` applies the steward's court tax efficiency to each settled ledger.
- `health.js` reduces household transmission risk through the chaplain's containment.
- `combat.js` applies the marshal's readiness to defender damage and incoming raid damage.
- `market.js` adds the chancellor's trade bonus and the envoy skill to trade terms.
- `diplomacy.js` applies the chancellor's gain to gifts and treaties, the spymaster's reduction to border incidents, war exhaustion during wars, and envoy effects each year.

All effects are bounded. The court loops over six offices and four realms once per year; it adds no per-frame or per-tile work.

## Save compatibility

At the court release the new state was additive on schema 4. The current save schema is **5**, which also carries the named garrison and public-health state documented in [MILITARY_AND_PUBLIC_HEALTH.md](MILITARY_AND_PUBLIC_HEALTH.md). `court` and the diplomacy fields remain normalized on load; missing or malformed values fall back to safe defaults. Imported saves with a structurally invalid court object are rejected by `save-validation.js` rather than partially applied. The existing save tests and the court normalization test cover both directions.

## Hosted deployment

- Site ID: `054512f6-1fcf-489c-8406-3ab4e49022e3`
- Production deployment and publish receipts: `succeeded`; `published:true`.
- Production HTTP check: 200, title `KINGS & CARDS • Eternal Realm`, all tested modules and assets returned 200.
- Cloud-browser check on the preview: the start screen loaded, the realm could be founded, and Government → Royal Court rendered six office cards, six appointment controls, the petition, effect meters and the audit area. No page errors were observed; only the browser's WebGL `ReadPixels` performance warnings appeared.
- Production cloud-browser check: the start screen loaded with the expected title and no console errors. The production deployment uses the same asset set whose court UI was exercised on the preview.

## Verification

- `npm test`: **636/636 tests passed**, 0 failed; syntax and relative-import checks passed for 93 source files.
- Browser E2E: passed with no page errors (78,730 ms on the development machine).
- Deterministic campaign: 25 years, 10,040 ticks, 13/13 ambitions, 4.371 ms/tick (50,914 ms).
- `git diff --check`: clean.

## Deliberate limits

This is a court, not a full parliamentary state. The separate [living noble houses](NOBILITY.md) now provide resident-led houses, estates, dues, charters and levies. There is still no elected parliament, law-voting procedure, independent judiciary, provincial autonomy, noble land army, espionage network or autonomous envoy travel. Corruption is an annual skim with a visible audit, not a complete shadow economy. These remain later roadmap slices and are not claimed as implemented.
