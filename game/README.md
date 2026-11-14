# Kings & Cards

**Production version:** 3.14.2
**Next development line:** 3.15.0-dev
**Production branch:** `ulmweb-branch`  
**Production URL:** https://kings-and-cards.pages.dev/

## Start here

1. [Version history and release changelog](CHANGELOG.md) — canonical versions, merges, verification and known release limits.
2. [Long-term playability audit](LONG_TERM_PLAYABILITY_AUDIT.md) — verified current systems, multi-year test plan, risks and release gates.
3. [Technical documentation index](docs/README.md) — architecture and engineering documentation.
4. [Roadmap 3.3–4.0](docs/ROADMAP_3.3-4.0.md) — shipped and planned feature phases.
5. [AI review playbook](docs/AI_REVIEW_PLAYBOOK.md) — safe external review and delegation instructions.
6. [Laubwälder 1.2.1](docs/FOREST_ECOLOGY.md) — shared forest ecology, species, fifteen broadleaf formations and the 60-point audit.
7. [Nadelwälder 1.2.2](docs/CONIFER_FORESTS.md) — five conifer species, twelve conifer formations, seasonal larch needles, conifer products, fauna and disturbance ecology.
8. [Mischwälder 1.2.3](docs/MIXED_FORESTS.md) — twenty forest species, twelve mixed formations, mixture ratios, group patterns, canopy layers, phenology, silviculture and the full 1.2.3.1–35 audit.
9. [Named garrison and public health](docs/MILITARY_AND_PUBLIC_HEALTH.md) — named recruits, timed drill, warhorses and payroll, sanitation, outbreaks, healers, medicine and mortality.
10. [Faith, culture and justice](docs/FAITH_AND_JUSTICE.md) — named clergy and judges, shrines, courts and prisons, festivals, pilgrimages, heresy, emergent crime, trials, legal codes and corruption.
11. [Eternal deeds](docs/ETERNAL_DEEDS.md) — the repeatable post-ambition chronicle, its goals, rewards, stall protection and save compatibility.
12. [Crown Endeavours](docs/CROWN_ENDEAVOURS.md) — five post-ambition paths, fifteen repeatable works, five one-time Crown Legacies, the Eternal Crown, funding, named overseers, permanent realm modifiers and the 100-year player journeys.
13. [War front and white peace](docs/WAR_FRONT_AND_WHITE_PEACE.md) — bounded annual war fronts, named-garrison battles and white peace at war exhaustion 35.
14. [Crown supply](docs/CROWN_SUPPLY.md) — grain contracts including the war granary, seasonal deliveries, commissary barter, paid waterworks, stone-house density, farm subsistence and garrison pay in kind, with the v3.13.1 journey measurements.
15. [Deep playtest 3.13.4](docs/DEEP_PLAYTEST_3.13.4.md) — shared-simulation performance: four 100-year seeds, the full 4 × 3 matrix, exact caches, measured tick costs and remaining limits.
16. [Deep playtest 3.13.3](docs/DEEP_PLAYTEST_3.13.3.md) — the previous seed-robust living-realm pass, four seeds × three playstyles over 25 years and the mature-realm immigration/relief record.
17. [AI Living Chronicle](docs/AI_CHRONICLE.md) — optional Atelier books, artifacts, conversations and contacts; server-side Z.ai proxy, deterministic offline fallback, schema-11 saves and verification limits.
18. [Living events and the chronicle timeline](docs/MICRO_EVENTS.md) — 50 weighted procedural micro-events, existing world-event bridge, 2,400-page time scrubber, centre notices, bounded effects and schema-11 migration.
19. [Tundra 1.2.9](docs/TUNDRA.md) — dedicated cold climate, permafrost, ten formations, the 48-point audit and sparse scrub timber.
20. [Savanna 1.2.10](docs/SAVANNA.md) — fire- and grazing-shaped wet/dry climate, ten formations, sparse woodland, pastoral/grain economy, hazards and the four-season reference.

## Development rules

- Make changes on a feature branch, never directly on the production branch.
- Keep `game/` as the canonical game root.
- Run `npm test` from this directory.
- Browser E2E setup, dependencies, fonts and the reproduction commands are documented in [tests/browser/README.md](tests/browser/README.md).
- Settlement stock, the central goods audit, local household supply and the abstract carrier model are documented in [docs/LOGISTICS_ARCHITECTURE.md](docs/LOGISTICS_ARCHITECTURE.md).
- Required browser E2E must pass on the exact PR head.
- Do not treat a green CI run as proof of a Pages deployment.
- Do not merge old feature branches mechanically; preserve and review unique work first.
- Keep local saves backward compatible or provide a tested migration.

## Crown Legacy save/load roundtrips

The five Crown Legacy paths are covered by the real browser journey harness
[`tests/browser/player-journeys.mjs`](tests/browser/player-journeys.mjs). Each
run founds a realm, plays 120 simulated years through the shipped UI, completes
the path's fifteen works and its one legacy, saves through the HUD, reloads the
whole page, presses Continue, and compares the canonical save snapshot. The
run fails unless the expected legacy exists before saving, survives loading,
the snapshot matches exactly, homes and anchors do not gain mismatches, and
there are no page or console errors.

```bash
cd game
python3 -m http.server 3000 --bind 127.0.0.1 &
E2E_BASE_URL=http://127.0.0.1:3000 \
JOURNEY=warlord JOURNEY_YEARS=120 JOURNEY_SAVE_LOAD=1 \
JOURNEY_ENDEAVOUR_FUNDING=2 \
node tests/browser/player-journeys.mjs
```

Repeat with `JOURNEY=builder`, `warlord`, `diplomat`, `merchant` or `scholar`.
The expected legacy is path-specific: **The Living City** (builder), **The
Unbroken Watch** (warlord), **The Concord of Crowns** (diplomat), **The Crown
Treasury** (merchant) and **The Eternal Library** (scholar). Each run writes
its measurements and the before/after comparison to
`artifacts/journeys/<journey>.json`. Browser dependencies and the platform
libraries are documented in [tests/browser/README.md](tests/browser/README.md).
