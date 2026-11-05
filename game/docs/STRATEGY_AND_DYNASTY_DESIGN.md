# Kings & Cards 2.9 — Royal Government, Dynasty and Strategy UI

## Scope

This milestone converts previously read-only political indicators into a first usable strategy command center and introduces a first explicit royal household lifecycle. It is deliberately incremental: the existing simulation remains the source of truth, and all new persistent state is serialized through the existing local-save DTO.

## Government state

The bounded `state.government` record stores:
- government form: feudal monarchy, council monarchy, elective monarchy;
- tax rate, clamped to 1–5%;
- crown authority, clamped to 20–90;
- council influence, clamped to 10–80;
- last decree tick and a 40-entry recent decree history.

Legacy saves receive safe defaults. Malformed values are normalized on load.

## Actual economic consequences

The financial ledger retains the original 2.5% tax default, so old saves and existing balance tests keep their behavior. The ledger now accepts an explicit tax rate; the active government's rate is supplied by the economy update. The tax ordinance changes the stored rate and faction/legitimacy pressure. Thus the UI does not merely display a number: the next 20-day settlement actually uses it.

## Royal decrees

Four decrees spend real resources, update morale and apply bounded political effects:
- Royal feast: gold and food; morale and commons/clergy support.
- Public works charter: gold and wood; guild and estate support.
- Royal pardon: gold; legitimacy and commons support.
- Festival of faith: gold and food; clergy support and morale.

A global 40-tick council cooldown prevents rapid repeated activation. Resource checks happen before spending, and history is capped at 40 records.

## Royal household and succession

The current monarch remains the existing king entity and person profile. A consort is an existing adult resident, chosen only if:
- they are alive and are a detailed resident;
- both people are adults of the same paired-reproduction species;
- their sexes are compatible with the current species reproduction model;
- neither is past the configured 65%-of-lifespan fertility bound;
- no explicit close parent/child/partner family tie is present;
- the candidate has no active partner or marriage.

Marriage is written through the existing reciprocal family graph. A royal heir is a real villager entity with a detailed person profile, an explicit royal-heir role, two reciprocal biological parent links, and personal birth memories. The action uses the existing food, morale, housing-capacity and entity-capacity gates. A three-year royal birth cooldown is stored in the dynasty state and mirrored into the partnership links.

On monarch death, the eldest living direct descendant by recorded birth year becomes the successor. If the heir is a minor and a surviving royal spouse exists, that spouse becomes regent. Without a surviving spouse, the minor heir is recorded as the crown-holder under council regency. Once the heir reaches their species' adult life stage, the regent yields the crown. Regency and succession history are bounded.

## UI

The command dock exposes:
- Government
- Politics
- Economy
- Cards
- Decisions
- Dynasty

The cards panel is intentionally an inventory/hand inspection surface; card play continues through the original drag-and-drop placement pipeline. It does not fabricate cards, bypass costs, or bypass placement validation.

The strategy UI is event-delegated and uses text escaping for dynamic names and descriptions. The crest is an original compact SVG asset. Comic styling uses high-contrast ink borders, saturated heraldic blue/gold, parchment surfaces, and responsive layouts.

## Save/load

Government and royal-dynasty records are included in the existing save snapshot and normalized on restore. Existing snapshots without either field migrate to safe defaults.

## Known limitations and next steps

1. Government form, authority and council influence are stored and presented; additional law-specific consequences (trade, conscription, religious settlement, property, civil rights) need separate gameplay systems.
2. Royal marriage and heir creation are currently explicit player actions. Autonomous courtship, political marriage offers, succession claims, rival branches and dynastic AI remain future work.
3. The succession model currently uses direct descendants and a surviving spouse as regent. It does not yet model collateral branches, elective votes, contested claims, multiple realms or a full council voting procedure.
4. A persistent dragon/creature lifecycle is not included in 2.9. It should use a shared actor lifecycle rather than special-case card effects: identity, species, age, needs, temperament, bonds, memories, action scheduler, death/memorial and event provenance.
5. The comic art pass is a first UI layer, not a complete map/character asset replacement. The next art pass should build a small optimized atlas of reusable portraits, building illustrations, terrain props, creature sprites and state icons. Avoid multi-gigabyte bundles; load only assets needed by the current view and use WebP/AVIF plus SVG for scalable UI art.

## Verification requirements

- Unit tests for default/malformed state normalization.
- Tests proving tax rates alter actual ledger output.
- Tests for decree costs, cooldown, bounded political effects and insufficient resources.
- Tests for reciprocal royal marriage, child parentage, cooldown and succession/regency.
- Browser E2E for opening each command tab, issuing a decree, saving/reloading government state, and the dynasty interaction path.
- Long-run tests must eventually cover a regent's death, multiple successive monarchs, and archived ancestors.
