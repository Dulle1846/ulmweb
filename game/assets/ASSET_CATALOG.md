# Kings & Cards — Local Asset Catalogue

All assets in this directory are bundled with the game. No runtime CDN or paid asset API is required.

| Asset | Purpose | Format | Status |
|---|---|---|---|
| `royal-title-illustration.svg` | Main menu / founding-screen panorama | SVG | Original dusk castle panorama |
| `royal-portraits.svg` | Character roster, dossiers and dynasty cards | SVG sprite atlas | Seven presentation archetypes; not unique portraits |
| `royal-building-atlas.svg` | Building register | SVG sprite atlas | Fifteen dedicated symbols for current building types |
| `royal-crest.svg` | Brand / crown mark | SVG | Existing project crest |
| `command-emblems.svg` | Management navigation | SVG sprite atlas | Existing heraldic symbols |
| `realm-icons.svg` | Resource and realm symbols | SVG sprite atlas | Existing icons |
| `city-builder-sprites.svg` | Map / construction symbols | SVG sprite atlas | Existing settlement symbols |
| `dragon-companion.svg` | Creature dossiers | SVG | One existing dragon companion archetype |
| `kingdom-illustration.svg` | Legacy title illustration | SVG | Retained; no longer used on the founding screen |
| `royal-court-art.svg` | Legacy court illustration | SVG | Existing colorful style; not yet promoted to the restrained royal art direction |

## Production rules

- Prefer local SVG for small heraldic symbols, icons, frames and scalable interface art.
- Use optimized WebP/AVIF for complex painted scenes only when the build/runtime supports them.
- Keep source art and usage documented; do not add unlicensed third-party or ripped game assets.
- Do not use one generic icon as a substitute for unrelated buildings.
- Portrait archetypes are not unique character portraits. A later pass should add controlled variation from explicit presentation data.
- Never fabricate identity, heraldry, building upgrades or creature species through arbitrary image mapping.
- Avoid multi-gigabyte bundles. Browser loading, memory, caching and first-render latency are part of art acceptance.

| `royal-card-atlas.svg` | Card hand category illustrations | SVG sprite atlas | Original category art; aliases preserve existing card catalogue mappings |
| `royal-card-frame.svg` | Card hand frame | SVG | Original parchment / antique-gold frame |

| `royal-dragon-atlas.svg` | Living dragon dossiers and memorials | SVG sprite atlas | Five stage-specific portraits mapped to persisted dragon life stage |
