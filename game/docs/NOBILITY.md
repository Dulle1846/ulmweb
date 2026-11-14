# Living noble houses

**Status:** live on the canonical Cloudflare Pages production build and its
deployment preview, verified 2026-11-14.
**Scope:** four resident-led noble houses with real heads, estates, loyalty,
dues, charters and levies.

## Why this layer exists

The realm already had a royal household, six court offices, faction meters,
four neighbour realms and a named population. Nobility existed only as a
faction number. The roadmap's living-nobility slice asked for house identity,
land, wealth, troops, legitimacy, inheritance, family ties and political
interest. This implementation adds the missing social layer without creating a
second population or army model: houses are built from the residents, deaths,
surnames, court offices and families that already drive the simulation.

## The four houses

- Houses are founded once from the four most populous resident family names.
  The house limit is four, so the annual work stays bounded.
- A house head is the oldest living adult of that family. When the head dies,
  the next annual audit selects the oldest surviving adult and records the
  succession. A house with no living member becomes `dormant`; the game does not
  invent a replacement family.
- Membership is derived from the live resident records and the saved family
  name. Births with the family name join the house; a resident who leaves the
  living population leaves its active membership.
- Every house owns a named estate (`<Family> estates`), a wealth score, a
  loyalty score, a power score and a levy. The estate is an accounting and
  political identity, not a new map entity or land-ownership simulation.

## Annual audit

`updateNobility()` runs once per realm year, after the court audit:

1. Reconcile living members and the house head.
2. Move wealth and loyalty toward targets derived from the head's discipline,
   greed and relationship with the sovereign; current taxes, legitimacy,
   government form, charters and court offices held by members.
3. Recompute levy and power.
4. Expire a levy after its two-year muster window.
5. Collect real gold dues into the treasury. A house below 30 loyalty withholds
   its dues; the withholding is recorded and lowers the nobility faction and
   legitimacy.
6. Recompute one cached defence multiplier from loyal and mustered levies.
7. Write a bounded audit and chronicle record.

The audit touches at most four houses and the existing court office map. It adds
no per-frame, per-tile or per-resident loop to the simulation tick.

## Player actions

### Grant an estate charter

Costs **30 gold and 10 wood**. It permanently marks the house as chartered,
raises its wealth and loyalty, increases its levy and power, and applies
`nobility +2.8`, `commons -1`, `legitimacy +0.3`. A house can be chartered once.

### Call the levy

Requires at least 35 loyalty and a two-year cooldown. The house musters for the
current year and the following year, adding its levy to the realm's defence
multiplier in combat. Calling it lowers house loyalty by 7 and applies a small
political cost. The mustered state, cooldown and loyalty loss are saved.

## Integration points

| Existing system | Live connection |
|---|---|
| Economy / treasury | Annual dues are added as real gold; charters spend gold and wood; disloyal houses withhold dues. |
| Politics | Loyalty and withholding apply nobility and legitimacy changes; taxes, legitimacy and government form shape loyalty. |
| Military / combat | `getNobilityDefenseMultiplier()` is read once per combat update; loyal and mustered house levies reduce incoming raid damage and modestly improve defender damage. |
| Court | Court offices held by house members raise the house's loyalty target, wealth target and power. |
| Dynasty / population | Heads and members are actual named people; deaths trigger succession or dormancy, and births with the family name join the house. |

## Save compatibility

`state.nobility` is additive. `normalizeNobilityState()` clamps malformed values,
caps houses at eight for validation, members at 48 and history at 24 entries.
The save snapshot persists `nobility`; restore normalizes it after the court and
before diplomacy. A save without the field starts with an empty state and founds
houses from its restored residents on the next snapshot or annual audit. The
current save schema remains 11 because no existing field changed shape.

## Verification

Recorded on the implementation head:

- Focused noble-house tests: **7/7**.
- `npm test`: **975/975** (full suite and syntax/import checks).
- Deterministic 25-year campaign: **10,040 ticks**, **13/13 ambitions**, all
  requirements true, no stalls, no game over, **0.797 ms/tick**.
- 4× CPU-throttled Taiga benchmark: the new `nobility-panel-open` phase measured
  **475 frames**, **16.8 ms p95**, **0.421% over 33 ms**, **0% over 50 ms**,
  **0 long tasks**, with the same quiet, dense, summer, winter-ice, settlement,
  explored-jump and fog phases green. Save **184 ms**, load **1,372 ms**, no page
  or console errors.
- Real browser run (`npm run test:nobility-ui`): founded seed `20261114`, four
  houses, opened the Noble Houses tab, granted a charter, called a levy, ran the
  annual audit, saved, reloaded, continued, and verified the charter, muster,
  dues and defence multiplier survived. **0 page errors / 0 console errors**.
- Existing full browser E2E: passes with the 24-tab command deck and reports no
  page errors.
- Canonical Pages production (https://kings-and-cards.pages.dev/) and the
  per-deployment Pages preview alias serve the final release-record HEAD with
  the same 325 files / 7.77 MiB runtime. The feature code is commit
  `611964d2511779f5e9c1eb0505f52b8f7c0a5d0b`; the documentation-only HEAD
  carries identical runtime files. Both origins return the deployed HEAD in
  `version.json` and the 24-tab deck. The live production run repeated the full
  browser flow on the deployed origin: four houses, charter, levy, **36 gold**
  annual dues, defence **1.1463**, save/reload, **0 page / 0 console errors**.

## Deliberately not included

This is not a land-army simulator, a marriage market, a cadet-branch generator
or a full feudal contract system. It also does not create autonomous noble
armies, border raids or a separate noble AI. Those remain roadmap work; this
slice proves the living-house core first.
