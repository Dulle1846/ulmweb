# Soil fertility and fallow cycles

**Status:** implemented on the `3.10.0-dev` development line
**Scope:** farm fields, settlement food chain, stable integration, save compatibility
**Tests:** 4 focused soil tests; full Node suite 610/610; deterministic 25-year campaign green

## Why this slice

Fields already tracked a seasonal stage and used terrain fertility in their growth
formula, but fertility never changed. A farm could harvest for twenty-five years from
the same soil with no cost, and an exhausted or low-fertility site had no meaningful
difference from prime land. The missing causal link was land use itself.

This slice makes soil a slow, renewable resource. It connects terrain geography,
farm labour, fallow time, the stable building and the food economy without adding a new
resource or a second simulation loop.

## Model

Each farm keeps its existing `field` object and gains four persisted values:

| Field | Meaning |
|---|---|
| `maxFertility` | Local soil ceiling, derived from the terrain node and retained across saves |
| `resting` | The field is in a full recovery year and must not be sown |
| `lastDepletion` | Fertility removed by the most recent completed harvest |
| `lastReason` | Player-facing state text for the building register |

### Depletion

A completed harvest removes:

```text
depletion = 6.5 + harvestTotal × 0.16
```

`harvestTotal` is the real harvested amount (normally 10–25 grain), so a larger crop
costs more soil. Fertility never falls below 12. The loss is applied only when the
whole pending harvest has been accepted by storage; a harvest waiting for a carrier
does not deplete the field twice.

### Recovery

- Fallow or harvested ground recovers `0.08` fertility per day.
- A resting field recovers `0.22` per day.
- An operational stable within 6 tiles adds `0.05` per day (manure).
- Recovery is capped at `maxFertility`.

### Rest years

After a harvest, a field rests when fertility is at or below:

```text
max(15, maxFertility × 0.35)
```

A resting field is shown as fallow, does not sow, and returns to the normal rotation
once fertility reaches 65 % of its local ceiling. This prevents a low-fertility farm
from locking itself into ever smaller harvests and gives the player a visible reason to
keep a stable near the fields or to accept a fallow year.

### UI

The building register now shows, for every farm:

```text
field <stage> (<growth>%) · soil <fertility>% · resting
```

The `resting` suffix appears only during a recovery year. No new panel or modal was
added.

## Save compatibility

Fields are persisted through the existing entity snapshot:

- `serializeEntity()` writes `field: {...entity.field}`.
- `restoreEntity()` restores the field object.
- Legacy fields without the new keys are normalized on the next `ensureField()` call:
  `maxFertility` falls back to the local terrain fertility (or the current fertility),
  `resting` becomes `false`, and `lastDepletion` becomes `0`.
- Save schema version is unchanged; no migration step is required because the field is
  an additive, validated sub-object.

`prepareFieldsForSave()` / `restoreFields()` remain available for explicit field-only
snapshots and now round-trip the new values.

## Balance evidence

`npm run test:campaign` (seed 20261108, 10,000 ticks, 25-year ambition ladder):

- Year 26, all 13 ambitions complete.
- 65 residents, 46 operational buildings, 4 farms, 3 mills, 3 bakeries.
- Food 2,783.8, wood 1,467.6, stone 1,618.2, gold 5,710.3.
- No stalled construction site, no game over, no food shortage in the sampled years.

The campaign proves the new cycle does not collapse the existing food chain. It does
not prove every possible build order; a human strategy pass remains useful for pacing.

## Performance

`stableManureNear()` scans the bounded entity list once per farm per simulation day.
With the campaign's 65 residents and 46 buildings this is a few thousand comparisons per
day, far below the frame budget and not a per-frame operation. No new arrays, timers,
event listeners or rendering work were added.

## Limits / next steps

- Some legacy starter layouts place farms on high ground outside the fertility band.
  Their raw terrain fertility is 0, while `ensureField()` keeps a 50-point safety
  ceiling so existing campaigns do not starve. The building register now shows the raw
  site value and the effective soil separately. A future starter-layout pass should
  choose genuinely fertile ground instead of relying on the safety ceiling.
- Crop choice and explicit rotation are not player-controlled yet; the rest year is
  automatic.
- Manure is a proximity bonus, not a transported good.
- Grain spoilage, storage losses and soil types beyond the existing terrain fertility
  are still future work.
