# Local data packs

**Status:** implemented in 3.69.0 (roadmap 4.0.6)
**Loader and validator:** `js/core/data-packs.js`
**Start-screen UI:** DATA PACKS · LOCAL CONTENT in `index.html`
**World-map consumer:** province label overrides in `world-map.js`

## What a data pack is

A data pack is a small, bounded JSON document. It is **data, not a plugin**: no
JavaScript, HTML, URL, DOM access or game-state mutation is accepted. A pack
can add authored scenarios to the existing scenario picker and rename known
provinces on the existing world map. It is stored in this browser only.

The contract is deliberately closed:

```json
{
  "format": "kings-and-cards-data-pack",
  "formatVersion": 1,
  "id": "northern-lore",
  "name": "Northern Lore",
  "author": "Open Hearth",
  "version": "1.0.0",
  "gameVersion": "3.71.0",
  "description": "A small northern content pack.",
  "scenarios": [
    {
      "id": "long-thaw",
      "name": "The Long Thaw",
      "description": "A late spring opens the road before the granary is ready.",
      "difficulty": "NORMAL",
      "recommendedClimate": "northern",
      "startDay": 0,
      "resources": { "food": 90, "wood": 150, "stone": 80, "gold": 70 },
      "morale": 60,
      "legitimacy": 55,
      "objective": { "type": "food", "target": 120, "deadlineYear": 2, "deadlineDay": 0 }
    }
  ],
  "regions": [{ "id": "northmere-pines", "name": "Vane Pines" }]
}
```

Unknown fields are rejected at every contract level (pack, scenario, objective,
stores, effects and province label), so a typo or an attempted code payload
cannot silently enter the library.

## Limits and security checks

- At most **3 packs**, **6 scenarios per pack**, **12 installed scenarios** and
  **10 province labels per pack**.
- The JSON file is at most **96 KB**; nesting is bounded to 8 levels and arrays
  to 40 entries in the generic data scan.
- Pack ids are lowercase kebab-case (`3–32` characters), scenario ids are
  namespaced as `<pack-id>-<scenario-id>` and capped at 64 characters.
- Text is length-limited, normalized and rejects `<`, `>` and control
  characters. Forbidden keys (`__proto__`, `prototype`, `constructor`, `script`,
  `code`, `eval`, `function`, `html`, `src`) are rejected at any depth, and
  every nested object has a closed allowlist.
- The declared game version must be semantic and on the current major version
  **3**, and must not be newer than the running game. Pack format version 1 is
  the only accepted format.
- Province overrides must name a real catalog province. Duplicate scenarios,
  duplicate province labels and empty packs are rejected.
- Invalid or corrupt stored packs are skipped individually; one bad row cannot
  take down the rest of the local library.
- No network access, file execution or save mutation happens during install.

## Player flow

1. Open **DATA PACKS · LOCAL CONTENT** on the start screen.
2. Choose a `.json` file and select **INSTALL PACK**.
3. The status line reports the installed pack, its scenario count and its
   province-label count.
4. Pack scenarios appear as ordinary cards in the existing scenario picker,
   tagged `PACK · <name>`, with the same briefing, climate, objective and start
   path as built-in and custom scenarios.
5. **REMOVE** deletes the pack from local storage. It does not alter a running
   realm or a saved scenario objective. If the removed pack's scenario was
   selected, the picker returns to the free realm.

Province label overrides are read by `regionDisplayName()` in `world-map.js`;
they change the displayed name on the world map and in province cards without
changing ownership, saves or the underlying diplomatic realm.

## Storage and compatibility

- Local storage key: `kings-and-cards:data-packs:v1`.
- Envelope: `{ version: 1, packs: [...] }`.
- Packs are re-validated when loaded, so a manually edited or older stored pack
  that no longer satisfies the contract is ignored rather than trusted.
- Packs are **not** part of a realm save. A save can always be loaded without
  the pack that authored its opening scenario; the saved scenario definition
  remains in the realm, and only the start-screen card disappears.
- The pack's scenarios use the existing scenario normalization and save schema;
  no new save schema field is required.

## Verification

- `tests/core/data-packs.test.js` covers namespacing, province lookup, JSON
  parsing and size rejection, unknown fields, markup, forbidden keys, future
  major/minor versions, unknown provinces, duplicate scenarios, pack limits,
  total scenario limits, replacement by id and removal.
- `tests/browser/scenario-start.mjs` installs a real JSON pack through the file
  input, finds the extra scenario card, selects it, checks the briefing and
  removes it again while the existing custom scenario and realm remain intact.
- `tests/ui/master-ui-contract.test.js` guards the start-screen controls and
  the picker/world-map consumers.
