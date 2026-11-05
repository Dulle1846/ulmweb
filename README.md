# Kings & Cards

Kings & Cards is a browser-based medieval realm and strategy simulation.

## Production

- Canonical site: https://kings-and-cards.pages.dev/
- Hosting: Cloudflare Pages
- Production branch: ulmweb-branch
- Static game root: game/

Vercel is not used. The workers.dev hostname is a separate/legacy Worker endpoint, not the canonical Pages release.

## Cloudflare Pages settings

- Framework preset: None
- Root directory: game
- Build command: blank (or exit 0 if the dashboard requires a command)
- Build output directory: .
- Required environment variables: none

This repository is a static browser game; game/package.json contains test scripts but no frontend build command. See game/docs/CLOUDFLARE_PAGES_RELEASE.md in the development branch for the full deployment checklist.

## Development

From game/:

    npm test

GitHub Actions runs the Node/static checks and browser E2E independently.
## Project documentation

- game/docs/LITE_CITY_BUILDER_SPEC.md — city-builder systems and staged acceptance criteria.
- game/docs/BRANCH_CONSOLIDATION_AUDIT.md — preservation audit for parallel feature branches.
- game/docs/CLOUDFLARE_PAGES_RELEASE.md — canonical deployment configuration and diagnosis.