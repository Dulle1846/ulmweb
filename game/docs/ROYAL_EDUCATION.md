# Royal education and coming-of-age offices (3.82.0)

Royal children are no longer only names in the dynastic register. A player can
now appoint one Tutor, place up to three children in authored curricula, watch
their studies advance once per game year, and present each graduate at a
coming-of-age audience. The system reuses the existing royal household, people,
politics, memory and resource-ledger code; it adds no per-tick scan, no new
currency and no random draw.

## Player journey

1. **Found a royal child.** Open **Decisions** → **Royal House**. A living
   consort is required; **welcome a royal child** spends `20 food` and `15 gold`
   and creates a real citizen of the existing royal family.
2. **Appoint a Tutor.** In the new **Royal Education** section, choose an adult
   resident who is outside the sovereign's close kin and is not already the
   Tutor. The appointment costs `12 gold`, is recorded in the dossier history,
   and writes a personal memory to the Tutor.
3. **Enrol children.** Each royal child can join one of four curricula for
   `6 gold`. At most **three** students may be in active tutelage at once.
   Re-enrolling a child already studying is refused; ending a tutelage frees a
   place for a different child.
4. **Advance the years.** Tutelage advances once in the existing annual
   maintenance, immediately after royal succession. A lesson cannot be
   back-dated: a child welcomed or enrolled during a year starts the annual
   clock at that year.
5. **Hold the audience.** When the course *and* the student's species maturity
   are complete, the panel offers **HOLD AUDIENCE** for `18 gold` and `12 food`.
   The crown receives the advertised political effects and the office
   endowment, the student receives a real personal memory and a named role, and
   the dossier records the audience.

## Authored curricula

| Curriculum | Years | Coming-of-age office | Political effects | Endowment |
| --- | ---: | --- | --- | --- |
| Letters & Chancery | 3 | Royal Chancellor | `+1.5` legitimacy, `+0.8` nobility, `+0.4` guilds | `6 gold` |
| Stewardship & Granaries | 4 | Royal Steward | `+0.8` legitimacy, `+1.4` commons | `10 food` |
| Command & Campaigns | 5 | Royal Marshal | `+1` legitimacy, `+1.2` nobility | `4 gold`, `4 food` |
| Law & Templecustom | 4 | High Justiciar | `+2` legitimacy, `+0.8` clergy, `+0.6` commons | `5 gold` |

Each curriculum also applies three fixed trait changes when study completes.
The values are shown on the command card before the player commits, so the
audience has no hidden reward roll. Office labels are historical display roles
on the person's profile; they do not silently overwrite the appointed holders
of the existing `court.offices` DTO.

## Bounds and save compatibility

- `state.royal.education` is an **optional nested DTO** inside the existing
  royal state. Old saves normalize to an empty dossier; `SAVE_SCHEMA_VERSION`
  stays at **15**.
- At most **3** students and **18** history records are kept. Students are
  deduplicated by person, stages are limited to `tutelage`, `ready`,
  `completed` and `dismissed`, and finished stages always keep their full
  taught years.
- Import validation rejects malformed or oversized dossiers rather than
  quietly truncating player data. Resource movements use the existing ledger
  keys; political effects use `applyPoliticalEffects`.
- The annual hook is one bounded `royalEducation` task in `ANNUAL_TASKS`.
  There is no new RNG stream, so random-stream snapshots remain byte-identical
  around authored tutelage.
- Education survives succession, regencies and save/load because the royal DTO
  is preserved by `updateRoyalSuccession()` and serialized with `state.royal`.

## Guidance and presentation

**Decisions** carries the full panel: Tutor summary, curricula, children,
students, progress, audiences and a short education record. When opening
milestones are finished, **NEXT MOVE** and **FIRST SESSION** point to the live
education step instead of duplicating the checklist: appoint a Tutor, enrol a
child, or hold a ready audience.

## Verification

- Focused system, simulation, presentation, UI-contract and spec tests live in
  `tests/systems/royal-education.test.js` and the existing depth, counsel,
  first-session and master-UI contracts.
- `tests/browser/royal-education-ui.mjs` proves the real path from a founded
  realm through marriage, royal birth, Tutor appointment, enrolment, annual
  tutelage, audience and Save/Load with zero page and console errors.
- Spec point **3.9.11** records the live code and both tests in the generated
  coverage audit.
