# Provincial charters (3.88.0)

The ten provinces in `worldMap` are no longer only a control/loyalty record with
a raw yield. A crown province can hold one of three charter tiers. The tier
changes who keeps the yearly **gold levy**, how fast loyalty recovers and how
much a hostile border erodes control. A province that feels secure asks for the
next tier, so the player's own success creates the next decision.

This is the same `worldMap` annual pass, not a second province simulator. It
adds no per-frame or per-tick work and no new save schema.

## Tiers and levy

| Tier | Label | Crown levy share | Yearly loyalty | Hostile-border protection |
| --- | --- | --- | --- | --- |
| 0 | `CROWN RULE` | 100 % | normal drift | none |
| 1 | `CHARTERED` | 62 % | +1 | 1 point of border loss ignored |
| 2 | `FREE PROVINCE` | 30 % | +2 | 2 points of border loss ignored |

The province keeps the difference. Its physical resource yield does **not**
change: the charter is a fiscal and political bargain, not a second production
multiplier.

The levy base is derived from the live province, so it follows control and
loyalty:

```text
levyBase = max(2, 2 + floor(control / 30) + floor(loyalty / 35))
levy     = round(levyBase * [1, 0.62, 0.30][autonomy])
```

The opening Crown Heartland pays 6 gold and the Crown March pays 3 gold under
its old charter, for a starting crown levy of 9 gold a year. At free-province
status the same provinces pay 2 gold each. The levy is paid once in
`updateRegions()` during the annual world pass, through the shipped
`addResource("gold", …)` path.

## Charters and petitions

`REGION_CHARTER_COSTS` in `js/systems/world-map.js`:

| Action | Gold | Food |
| --- | --- | --- |
| Grant the first charter | 16 | 6 |
| Grant the free-province charter | 26 | 10 |
| Revoke a charter | 0 | 0 |

One charter decision may be made per province each year. The action writes the
province's `lastCharterYear` (and the map's latest `lastRegionCharterYear` for
the summary); a second decision on the same province returns
`charter-already-answered`. Two provinces may therefore answer their petitions
in the same year.

A crown province with loyalty at least **70** and no open petition asks for the
next tier after a **3-year** interval. The petition is real saved state
(`petitionTier`, `petitionYear`, `lastPetitionYear`). The player can:

- **grant** it: pays the tier cost, raises autonomy, adds 2 loyalty and 1
  control, and records `province-petition-granted`;
- **refuse** it: costs 5 loyalty and 1 control, and records
  `province-petition-refused`;
- **ignore** it: the next annual pass treats it as a refusal, costs 4 loyalty
  and records `province-petition-ignored`.

Revoking a charter returns the province to the previous tier, costs
`8 + 2 × oldTier` loyalty and `2 + oldTier` control, and restores the higher
crown levy. Granting and revoking also feed the existing politics ledger and
morale, so a charter decision is felt outside the WORLD panel.

## Player surface

The WORLD panel's province cards show:

- the autonomy tier;
- `CROWN LEVY` and `KEPT AT HOME` in gold per year;
- an open petition with its target tier and petition year;
- `GRANT CHARTER`, `GRANT PETITION`, `REFUSE PETITION` or `REVOKE CHARTER`
  buttons, with a disabled reason when the yearly decision is already spent or
  the treasury/granary is short;
- the summary strip's `CHARTERS`, `CROWN LEVY` and `OPEN PETITIONS` readings.

The province tooltip and the WORLD record also name the charter tier and the
petition history. The in-panel explanation states the trade explicitly: a
charter buys loyalty and a steadier border with a permanently smaller crown
levy.

## Save compatibility

`WORLD_MAP_VERSION` remains **2** and `SAVE_SCHEMA_VERSION` remains **15**.
The new region fields are additive and validated as bounded integers:

- `autonomy` 0–2;
- `petitionTier` 0–2;
- `petitionYear`, `lastPetitionYear`, `lastCharterYear`.

Legacy saves without these fields normalize to autonomy **0** for every
province, so an old realm is never given a charter it did not choose. A new
realm (`normalizeWorldMapSnapshot(null)` or `createWorldMapState()`) inherits
the Crown March's historical tier-1 charter from
`WORLD_REGION_CATALOG.defaultAutonomy`. `ensureWorldMap()` detects the missing
fields once and normalizes the map, so the first later annual pass cannot read
`undefined`.

## Verification

### Deterministic 25-year campaign

`node scripts/long-campaign.mjs`, seed `20261108`, 25 years,
`CAMPAIGN_ERA=common-weal`, with both court petitions and province petitions
answered through the public actions:

- all campaign requirements true (`ok: true`, `gameOver: false`);
- 3 province petitions granted: Crown Heartland tier 1 in year 3 and tier 2 in
  year 6; Crown March tier 2 in year 6;
- both crown provinces end at autonomy 2 (`FREE PROVINCE`);
- annual crown levy falls from 9 to 4 gold; the final annual resource yield is
  6;
- final population 74, gold 3,651.04, food 2,987.27, morale 99.58, legitimacy 100;
- 0 ignored petitions, no NaN, no game-over, no save/load drift.

The petition decisions are read from the campaign output, not asserted from a
hand-written table.

### Browser reference

`node tests/browser/world-map.mjs` (Chromium, desktop 1400×960 and narrow
390×844):

- the opening panel reports `CHARTERS 1 / 2`, `CROWN LEVY +9G` and the Crown
  March's `CHARTERED` tier;
- desktop grants the Crown Heartland's first charter through the real button,
  then saves and reloads the realm; autonomy 1 survives and the restored panel
  shows `CHARTERED`;
- at 390×844 the same panel grants the first charter, advances through the
  shipped annual pass to a visible `PETITION · FREE PROVINCE`, grants that
  petition and ends at autonomy 2 with `FREE PROVINCE`;
- desktop and narrow layout reports both have `docOverflow: 0`,
  `panelOverflow: 0` and no clipped copy; the browser session has no page or
  console errors.

Screenshots are written under `artifacts/world-map/` by the test.

## Deliberate limits

- The charter is about one province and one annual decision, not an elected
  provincial parliament.
- `autonomy` affects levy, loyalty, border control loss and politics. It does
  not create a separate provincial army, tax administration or AI governor.
- A petition is answered by the player, not by an autonomous province AI.
- The Crown March's starting charter is a deliberate historical grant, not a
  free source of gold: it already reduces the opening crown levy by 2 gold a
  year.
