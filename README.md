# Kings & Cards

Kings & Cards is a browser-based medieval realm and strategy simulation.

## Production site

- **Canonical production target:** https://kings-and-cards.pages.dev/
- **Hosting:** Cloudflare Pages
- **Production Git branch:** ulmweb-branch
- **Game source and static site root:** game/

The legacy workers.dev endpoint is not the canonical release target. Vercel is not used for production.

## Cloudflare Pages build settings

This repository contains a static browser game. There is no frontend bundler or build output step.

- Root directory: game
- Build command: leave blank (or use exit 0 if the dashboard requires a command)
- Build output directory: .
- Framework preset: None
- Required build environment variables: None

See game/docs/CLOUDFLARE_PAGES_RELEASE.md before changing deployment settings.

## Development checks

From the game directory:

    npm test

This runs the Node test suite and the JavaScript syntax check. Browser E2E is run separately by GitHub Actions.

## Project documentation

- game/docs/LITE_CITY_BUILDER_SPEC.md — city-builder systems and staged acceptance criteria.
- game/docs/BRANCH_CONSOLIDATION_AUDIT.md — preservation audit for parallel feature branches.
- game/docs/CLOUDFLARE_PAGES_RELEASE.md — canonical deployment configuration and diagnosis.