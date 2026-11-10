# Kings & Cards

**Production version:** 3.13.3
**Next development line:** 3.14.0-dev
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
8. [Named garrison and public health](docs/MILITARY_AND_PUBLIC_HEALTH.md) — named recruits, timed drill, warhorses and payroll, sanitation, outbreaks, healers, medicine and mortality.
9. [Faith, culture and justice](docs/FAITH_AND_JUSTICE.md) — named clergy and judges, shrines, courts and prisons, festivals, pilgrimages, heresy, emergent crime, trials, legal codes and corruption.
10. [Eternal deeds](docs/ETERNAL_DEEDS.md) — the repeatable post-ambition chronicle, its goals, rewards, stall protection and save compatibility.
11. [Crown Endeavours](docs/CROWN_ENDEAVOURS.md) — five post-ambition paths, fifteen multi-stage projects, funding, named overseers, permanent realm modifiers and the 100-year player journeys.
12. [War front and white peace](docs/WAR_FRONT_AND_WHITE_PEACE.md) — bounded annual war fronts, named-garrison battles and white peace at war exhaustion 35.
13. [Crown supply](docs/CROWN_SUPPLY.md) — grain contracts including the war granary, seasonal deliveries, commissary barter, paid waterworks, stone-house density, farm subsistence and garrison pay in kind, with the v3.13.1 journey measurements.
14. [Deep playtest 3.13.3](docs/DEEP_PLAYTEST_3.13.3.md) — four seeds × three playstyles over 25 years, mature-realm immigration, costed crown relief, the full result matrix and the remaining performance/content limits.

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
