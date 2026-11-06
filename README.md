# Kings & Cards

Kings & Cards is a browser-based medieval realm and strategy simulation.

## Production

- Canonical site: https://kings-and-cards.pages.dev/
- Hosting: Cloudflare Pages
- Production branch: ulmweb-branch
- Static game root: game/

Vercel is not used. The workers.dev hostname is a separate/legacy Worker endpoint, not the canonical Pages release.

## Repository layout

- `game/` — the complete game: HTML, CSS, JavaScript, assets, tests and docs. This is the only folder Cloudflare Pages publishes.
- `.github/` — CI workflows only; nothing here is deployed.
- The root HTML files belong to the separate ulmweb website and are not part of the game deployment.

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