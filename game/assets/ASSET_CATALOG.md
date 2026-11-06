# Kings & Cards — Local Asset Catalogue

All assets in this directory are bundled with the game and loaded from the same origin. No runtime CDN, paid asset API or external image host is required.

## Inventory and usage

| Asset | Purpose / usage | Format | Status |
|---|---|---|---|
| `royal-title-illustration.svg` | Founding-screen panorama | SVG | Original muted dusk castle illustration |
| `royal-portraits.svg` | Character roster, sovereign banner, dossiers and dynasty cards | SVG sprite atlas | Seven presentation archetypes; not unique portraits for every person |
| `royal-building-atlas.svg` | Building register | SVG sprite atlas | Fifteen dedicated symbols for current building types |
| `royal-card-atlas.svg` | Hand cards, card inspector and management card list | SVG sprite atlas | Original category art with aliases for the existing catalogue |
| `royal-card-frame.svg` | Card hand frame | SVG | Original parchment / antique-gold frame |
| `royal-crest.svg` | Brand and command-panel crest | SVG | Project crest |
| `royal-court-art.svg` | Royal decisions panel | SVG | Existing court illustration; retained pending a restrained-art revision |
| `royal-dragon-atlas.svg` | Living dragon dossiers and memorials | SVG sprite atlas | Five stage-specific portraits mapped to persisted dragon life stage |
| `dragon-companion.svg` | Creature panel hero art | SVG | Existing dragon companion illustration |
| `command-emblems.svg` | Management navigation and tabs | SVG sprite atlas | Existing heraldic symbols |
| `realm-icons.svg` | Resources and realm symbols | SVG sprite atlas | Existing icons |
| `city-builder-sprites.svg` | Map, construction and resource symbols | SVG sprite atlas | Existing settlement symbols |
| `realm-sprites.svg` | Legacy map / settlement sprites | SVG | Existing asset; no new runtime request |
| `realm-banner.svg` | Legacy decorative banner | SVG | Existing asset; not the primary HUD banner |
| `comic-realm-banner.svg` | Legacy comic-style banner | SVG | Retained for compatibility |
| `comic-card-frame.svg` | Legacy card frame | SVG | Retained for compatibility |
| `kingdom-illustration.svg` | Legacy title illustration | SVG | Retained; no longer used on the founding screen |
| `favicon.svg` | Browser tab icon | SVG | Local project icon |

## Provenance and license record

- These files are stored in the repository and served locally. They are treated as original project artwork.
- No third-party stock, ripped game asset, external CDN or paid asset API is referenced by the current UI.
- No separate license files are bundled for the legacy illustrations. Before redistributing the project outside its current ownership, re-confirm authorship and rights for those legacy files.
- Fonts currently use local system stacks. No external font file is downloaded or embedded.

## Production rules

- Prefer local SVG for small heraldic symbols, icons, frames and scalable interface art.
- Use optimized WebP/AVIF for complex painted scenes only when the build/runtime supports them.
- Keep source art and usage documented; do not add unlicensed third-party or ripped game assets.
- Do not use one generic icon as a substitute for an unrelated building.
- Portrait archetypes are not unique character portraits. A later pass should add controlled variation from explicit presentation data.
- Never fabricate identity, heraldry, building upgrades or creature species through arbitrary image mapping.
- Avoid multi-gigabyte bundles. Browser loading, memory, caching and first-render latency are part of art acceptance.
