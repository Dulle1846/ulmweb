# Kings & Cards

**Production version:** 3.8.0  
**Next development line:** 3.9.0-dev  
**Production branch:** `ulmweb-branch`  
**Production URL:** https://kings-and-cards.pages.dev/

## Start here

1. [Version history and release changelog](CHANGELOG.md) — canonical versions, merges, verification and known release limits.
2. [Long-term playability audit](LONG_TERM_PLAYABILITY_AUDIT.md) — verified current systems, multi-year test plan, risks and release gates.
3. [Technical documentation index](docs/README.md) — architecture and engineering documentation.
4. [Roadmap 3.3–4.0](docs/ROADMAP_3.3-4.0.md) — shipped and planned feature phases.
5. [AI review playbook](docs/AI_REVIEW_PLAYBOOK.md) — safe external review and delegation instructions.

## Development rules

- Make changes on a feature branch, never directly on the production branch.
- Keep `game/` as the canonical game root.
- Run `npm test` from this directory.
- Required browser E2E must pass on the exact PR head.
- Do not treat a green CI run as proof of a Pages deployment.
- Do not merge old feature branches mechanically; preserve and review unique work first.
- Keep local saves backward compatible or provide a tested migration.
