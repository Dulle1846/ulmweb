# Realm founding: culture, faith, custom, law and charter

**Status:** implemented, deployed and browser-checked on the Freebuff Sites development build on 2026-11-10.
**Production URL:** https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page
**Preview URL:** https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page
**Site ID:** `054512f6-1fcf-489c-8406-3ab4e49022e3`
**Systems:** `js/systems/identity.js`, `js/systems/government.js`, start screen and management government panel.

The founding screen no longer only names a realm. It defines the institutions that will shape its first years: a **culture**, **religion**, **tradition**, **legal order**, **legitimacy doctrine**, **starting charter** and an optional founding chronicle. Every choice is stored in the identity, survives save/load, appears in the government panel and contributes through the existing modifier path rather than through a parallel simulation.

## Design rule: choices, not decoration

`getFoundingModifiersFor()` aggregates the chosen culture, religion, tradition, law and legitimacy doctrine into one block:

| Modifier | What it reaches |
|---|---|
| `tax` | Tax assessment and government revenue |
| `trade` | Market terms and trade income |
| `research` | Research speed |
| `military` | Garrison and combat power |
| `foodDemand` | Household food demand |
| `legitimacy` | Annual legitimacy drift |
| `mortality` | Annual mortality relief or pressure |

`getCultureModifiers()` now returns this aggregate while keeping its existing shape (`id`, `label`, `tax`, `trade`, `research`, `military`, `foodDemand`, `legitimacy`, `mortality`). The research cache also keys on the new identity choices, so a loaded realm cannot reuse a warm modifier cache from another realm.

The five default choices are deliberately neutral: Ancestral hearth, Open hearth, Customary law and Lineage add zero. The Frontier culture keeps its original +6 % food demand relief and +3 % military bonus. This preserves existing saves, balance and deterministic campaigns. Every non-default choice has a visible trade-off.

## Cultures

| Culture | Identity | Effect |
|---|---|---|
| Frontier | Hardy settlers and practical distrust of ceremony | food demand −6 %, military +3 % |
| Mercantile | Roads, contracts and foreign coin | tax +2 %, trade +7 %, research +2 % |
| Scholarly | Archives, schools and patient inquiry | trade +1 %, research +14 %, legitimacy +2 %, mortality +1 % |
| Martial | The garrison is respected; the tax collector is not | food demand −2 %, tax −2 %, military +12 %, legitimacy +1 % |
| Devout | Rites, charity and a sacred calendar | research −2 %, legitimacy +10 %, mortality +3 % |

`food demand −x %` means the modifier lowers household demand; it is stored as the corresponding negative `foodDemand` value in the aggregate.

## Religions

| Religion | Emphasis | Effect |
|---|---|---|
| Ancestral hearth | Inherited rites, neutral | none |
| Solar covenant | Public calendar of light and harvest | food demand −2 %, tax +1 %, legitimacy +4 %, mortality +1 % |
| Harvest rite | Charity, seed blessings and granaries | food demand −5 %, legitimacy +1 %, mortality +1 % |
| Rational inquiry | The world as a testable question | trade +1 %, research +8 %, legitimacy −1 %, mortality +1 % |
| Mystic communion | Dreams, wells and old stones | trade −1 %, research +2 %, legitimacy +3 %, mortality +3 % |

## Traditions

| Tradition | Emphasis | Effect |
|---|---|---|
| Open hearth | The first frontier customs, neutral | none |
| The muster | Every household answers the horn | tax +1 %, trade −1 %, military +6 %, legitimacy +1 % |
| Guild compact | Standards, apprentices and shared tolls | tax +1 %, trade +5 %, research +1 %, military −1 % |
| Pilgrim roads | Hostels and safe passage | trade +3 %, legitimacy +3 %, mortality +1 % |
| Closed borders | Own counsel, own grain, own weapons | food demand −2 %, tax +3 %, trade −5 %, research −1 %, military +4 %, legitimacy +1 % |

## Legal orders

| Legal order | Emphasis | Effect |
|---|---|---|
| Customary law | Remembered custom, neutral | none |
| Royal code | One written authority and a standing garrison | tax +3 %, trade −1 %, military +2 %, legitimacy −1 % |
| Common law | Local courts and remembered precedent | tax −1 %, trade +2 %, legitimacy +4 %, mortality +1 % |
| Guild law | Commercial courts and inspected measures | tax +1 %, trade +5 %, military −1 % |
| Sacred law | The altar and the court share one book | tax +1 %, research −2 %, legitimacy +5 %, mortality +1 % |

## Legitimacy doctrines

| Doctrine | Emphasis | Effect |
|---|---|---|
| Lineage | The founding house claims continuity, neutral | none |
| Divine right | The crown answers to the sacred order | tax +1 %, research −1 %, legitimacy +5 %, mortality +1 % |
| Consent of the governed | Taxes and laws renewed by assembled households | tax −1 %, trade +2 %, research +1 %, legitimacy +3 % |
| Right of conquest | The realm belongs to those who can hold it | tax +2 %, trade −1 %, military +5 %, legitimacy −2 % |
| Prosperity | A full store and a paid wage justify the crown | tax +1 %, trade +4 %, research +1 %, legitimacy +2 % |

## Starting charters

The charter is applied once, after `initStartingKingdom()` and before city and settlement initialization. It therefore changes the actual first-year stock and cannot be overwritten by warehouse seeding.

| Charter | Starting grant |
|---|---|
| Balanced founding | none |
| Frontier settlement | +25 wood, +25 food, +1 morale |
| Mercantile compact | +30 gold, +5 wood |
| Garrison march | +25 stone, +10 gold, +2 morale |
| Sanctuary | +30 food, +5 gold, +2 legitimacy |
| Scholarly refuge | +15 gold, +12 research reserve |

## Constitutions

The government register now includes two additional forms:

- **Oligarchy** — a chartered elite governs through wealth and connection; trade +3 %, tax efficiency +2 %, research +1 %, legitimacy −3 %, with the nobility strongest and the commons opposed.
- **Mixed constitution** — crown, council and charter balance one another; legitimacy +4 %, tax efficiency +1 %, research +2 %, trade +2 %, with all four factions mildly positive.

Both are selectable at founding and through the existing government reform flow, cost the same 20 gold reform price and persist in the existing government save.

## Start screen and management view

The start screen exposes selects for religion, tradition, legal order, legitimacy and starting charter, plus a 280-character founding chronicle. The live `#founding-summary` shows the charter description and the aggregate tax, trade, research, food-demand, legitimacy and mortality values as the player changes a choice. Blank realm and house names fall back to **New Realm** and **Royal House** instead of hard-coded Eldria defaults.

The management **GOVERNMENT** panel adds a **FOUNDING CHARTER** block with the four institutions, the starting charter, aggregate modifiers and the founding chronicle. No new tab or per-tick scan was added.

## Save compatibility

Save schema remains **7**. The new identity fields are optional on validation and normalize to the neutral defaults when absent. Old identities therefore load without being renamed or rejected; a realm that never opens the new controls behaves exactly as before. The fields survive JSON round trips.

## Deployment

Both environments were redeployed after the final chronicle-prefix fix and remain published.

| Environment | Receipt | Completed (UTC) | State |
|---|---|---|---|
| Preview | `3047608e-096f-4c0c-b723-c7ec43047368` | 2026-11-10 04:56:09 | succeeded, `published:true` |
| Production | `0dd6ffcc-79b6-4369-92f2-716549ef2fb0` | 2026-11-10 04:56:15 | succeeded, `published:true` |

The runtime package is 129 files / 2.3 MB. Live production checks returned HTTP 200 for the document, `js/systems/identity.js` and `js/app/main.js`; the deployed identity module reports `IDENTITY_VERSION = 2`, the start screen contains the new controls and the duplicated chronicle prefix is absent.

A Cloud-browser run against the deployed preview verified:

- all new founding controls and the live summary rendered;
- Avalon / House Vere started with the harvest rite, guild custom, common law, consent doctrine, mercantile compact and mixed constitution;
- the live realm stored the selected identity and profile and opened the **GOVERNMENT** panel with the **FOUNDING CHARTER** block, institutions and chronicle;
- no console errors, only software-WebGL `ReadPixels` warnings.

That run exposed the duplicate “House House” chronicle prefix. It was fixed, the full suite was rerun and the package was rebuilt before the final preview and production deployments. The local Playwright E2E suite was not run because Chromium was unavailable in the sandbox; the deployed preview was exercised directly in the Cloud browser instead.

## Verification

- Focused founding and strategy tests: **18/18**.
- Full Node suite: **675/675**, including syntax and relative-import checks for **99 source files** and **189 referenced UI ids**.
- Deterministic 25-year campaign: **10,040 ticks**, **13/13** ambitions, no game over, **37.6 s**, **3.062 ms/tick**.
- Save/load: old identity without new fields normalizes to neutral defaults; a fully populated identity round-trips with identical aggregate modifiers.
- Research cache invalidation covers culture, religion, tradition, law and legitimacy.
- Deployed browser check: Cloud browser exercised the start screen, a non-default founding, the live realm state and the management charter panel; no page or console errors.
- Local Playwright E2E: not run; Chromium was unavailable in this sandbox and the attempted download did not complete. This limitation is not reported as a pass.
