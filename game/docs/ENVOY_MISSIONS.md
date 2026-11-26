# Envoy missions — Kings & Cards 3.79.0

The Diplomacy panel now turns an appointed resident envoy into a bounded,
staged negotiation. It uses the same four neighbouring courts, treaty records,
political factions, court Chancellors and espionage desks as the existing
diplomacy system; it does not add a second diplomacy layer.

## Player loop

1. **Appoint** a living adult resident from the existing court candidate pool
   through `Diplomacy → APPOINT` (8G), exactly as before.
2. **Send** one mission per year from a court with a living envoy. Choose
   `TRADE PACT` from a neutral court or `ALLIANCE` from a court already under a
   trade pact. The court needs at least `threshold − 20` relation (25 for a
   trade pact, 50 for an alliance), no war, a free court slot and 6G. The
   mandate lasts four years.
3. **Negotiate** from the next year. The visible card becomes `NEGOTIATE` only
   when the annual court is ready. One deterministic draw on the dedicated
   `"diplomacy"` stream is combined with envoy skill, realm relation and trust,
   Chancellor quality (`getCourtModifiers().diplomacyGain`), foreign insight
   and a targeted, unturned foreign desk. The result is shown as a concrete
   score against the treaty threshold (45 or 70), not a hidden dice roll.
4. **Report** from the following year. An accepted negotiation files a report
   and opens ratification. A rejected court closes the file immediately with a
   bounded scar: −2 relation, −3 trust, −0.4 legitimacy, −0.3 guilds and −1
   morale.
5. **Ratify** from the next year. The negotiated trade pact or alliance writes
   the same `realm.treaty` record and `treatySinceYear` as a direct agreement,
   with real relation/trust/fear and political effects, without paying the
   direct signing fee a second time.

Every stage is a deliberate player decision. Only the annual audit runs
automatically: once per year it closes mandates whose envoy died or was
recalled, whose four-year expiry passed, whose court went to war or whose
treaty ladder changed. No mission work happens per tick or per frame.

## Bounds and compatibility

- At most six active mandates and one per realm; with four canonical courts the
  effective maximum is four. One send per year, one negotiation draw per
  mandate, four-year lifetime.
- `state.diplomacy.missions`, `missionLastUpdateYear`, `missionLastSendYear`
  and `missionCounter` are optional and normalized on load. Legacy saves get
  an empty bounded mission list without a schema bump.
- Import validation rejects oversized, duplicated, malformed and
  out-of-range mission rows with dedicated `INVALID_DIPLOMACY_MISSION*`
  codes. Normalization clamps saved rolls, scores, years, summaries and
  counters.
- `"diplomacy"` is a dedicated random stream. Combat, court, council,
  campaign, espionage, simulation and every older draw order stay untouched.
- NEXT MOVE and FIRST SESSION extend their existing continuation text with the
  one ready negotiation, report or ratification; they do not duplicate the
  five-step opening checklist.

## Tests and evidence

- `tests/systems/diplomatic-missions.test.js` — normalization and caps, annual
  guards, real gold cost, staged negotiation, RNG isolation and replay,
  rejection scar, treaty ratification, alliance ladder, annual audit and save
  import validation.
- `tests/browser/diplomatic-missions-ui.mjs` — real browser start → court
  candidate → appoint → send → next year negotiate → next year report →
  save/load → next year ratify, with exact stream and treaty assertions and
  zero page/console errors.
- Spec point `3.9.10`, generated into `docs/SPEC_COVERAGE_AUDIT.md`,
  `docs/spec-coverage.json` and `js/generated/spec-coverage.js`.
