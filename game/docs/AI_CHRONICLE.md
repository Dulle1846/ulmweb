# AI Living Chronicle

**Status:** schema 11 · offline path verified · live provider path needs a server secret.

The Atelier is an optional narrative layer on top of the deterministic
simulation. It does not run on a timer and it never feeds AI text back into
tick logic. The player explicitly commissions a book, recovers an artifact or
opens a conversation with a living resident. The result is validated, bounded
and stored in the ordinary save.

This keeps three promises:

1. **The simulation remains authoritative.** AI prose cannot create resources,
   buildings, population, laws or army units.
2. **The game remains playable without an API key.** A deterministic offline
   chronicler creates complete, saveable books, artifacts and conversations.
3. **The browser never holds the provider key.** The live path goes through a
   same-origin Cloudflare Pages Function.

## Files

| File | Responsibility |
| --- | --- |
| `js/core/ai-chronicle-state.js` | Version, caps, costs, sanitizing, normalization and save validation. Pure, no DOM/network. |
| `js/systems/ai-chronicle.js` | Realm-grounded context, prompt, provider request, deterministic fallback, cost/effects and contact updates. |
| `js/presentation/ai-chronicle-panel.js` | The `ATELIER` command-deck tab, the existing CHRONICLE archive section and the PEOPLE contact section, all built from existing `command-*` classes. |
| `functions/api/chronicle.js` | Cloudflare Pages Function. Reads `ZAI_API_KEY` on the server and proxies one validated JSON request. |
| `tests/systems/ai-chronicle.test.js` | Fallback, provider JSON, caps, effects, contacts, save-validation tests. |

## Save contract

`SAVE_SCHEMA_VERSION` is **10**. The migration `9 → 10` adds an
`aiChronicle` top-level record when it is absent. Older saves therefore open
without discarding anything, and the new state is normalized on restore.

The record is bounded to:

- 24 books
- 24 artifacts
- 20 recorded conversations
- 32 named contacts
- 4 durable memories per contact
- 8 lines per conversation

Every string is sanitized and length-limited. Books, artifacts, conversations,
lines and contacts are validated again by `validateSaveSnapshot()` before a
save is accepted. Unknown or malformed entries are dropped during
normalization rather than partially trusted.

`aiBusy` is transient UI state and is not serialized.

## Player actions and effects

| Action | Cost | Effects |
| --- | --- | --- |
| Commission a book | 25 gold | Adds a court-library volume; +1 legitimacy; +0.4 morale |
| Recover an artifact | 15 gold, 8 stone | Adds a reliquary object; +2 legitimacy |
| Open a conversation | free | Adds a recorded audience; creates or updates the named contact: bond +0–3, trust +1, a durable memory and an optional rumor |

Every commission writes `lastEffect` (legitimacy, morale, bond, trust). The
Atelier shows that declared effect next to the current legitimacy and morale;
the existing CHRONICLE tab lists the same books, artifacts and audiences, and
the existing PEOPLE tab lists the contacts with bond, trust, memories and a
dossier link. Nothing is stranded in the new tab.

The contact's last topic and memory list persist across save/load. The contact
is a real citizen from the population register when one is available; the
fallback never invents a named resident for a conversation.

The crown must be able to pay before a commission starts, and the panel
disables actions while one request is in flight. Caps are enforced on apply,
not only in the UI.

## Live provider contract

The browser POSTs to `/api/chronicle`:

```json
{
  "kind": "book|artifact|conversation",
  "prompt": "realm-grounded chronicler prompt"
}
```

The Pages Function:

- accepts only `POST`, JSON and the three known kinds;
- rejects prompts above 8,000 characters;
- calls an OpenAI-compatible `chat/completions` endpoint;
- asks for `response_format: {"type":"json_object"}`;
- returns the parsed object as `{ "entry": {...} }`.

The client then normalizes and validates the shape. A malformed response,
missing key, timeout, upstream error or offline static server falls back to the
offline chronicler. The panel labels every entry `LIVE AI` or
`OFFLINE CHRONICLER`; it never presents deterministic prose as model output.

### Configuration

Set these in the Pages project's server-side environment (Settings → Environment
variables / Secrets):

| Variable | Required | Purpose |
| --- | --- | --- |
| `ZAI_API_KEY` | yes for live AI | Z.ai API key. Never put this in a client file, save or repository. |
| `ZAI_API_BASE` | no | Defaults to `https://api.z.ai/api/paas/v4`. |
| `ZAI_MODEL` | no | Defaults to `glm-4-flash`. |

One-line setup from the `game/` directory (the command prompts for the secret;
never put the key in a file or the chat):

```bash
npx wrangler pages secret put ZAI_API_KEY --project-name kings-and-cards
```

The default provider is Z.ai's OpenAI-compatible API. A static local server
does not execute `functions/`; use `wrangler pages dev` or a deployed Pages
project to exercise the live path. Without that setup the Atelier deliberately
uses the offline chronicler. The production deploy workflow runs Wrangler from
`game/` so Pages resolves `game/functions/api/chronicle.js` with the static
runtime.

## Grounding and prompt safety

The context is built from the actual state: kingdom and ruler names, year,
tick, motto, culture, government, stores, a named author from the population
register, a specific conversation partner, and the latest recorded events. The
prompt tells the model not to invent mechanics or people outside those facts.

The model response is untrusted input. It is:

- required to match one small JSON shape;
- sanitized of control characters and collapsed whitespace;
- length-capped per field;
- stripped of any client-supplied person override in conversations;
- rendered through HTML escaping, never as raw markup.

The provider key and the upstream response are never written to the save, the
event log or browser storage. The proxy does not add CORS headers; the route is
same-origin.

## Verification

Verified in this tree:

```bash
cd game
node --test tests/systems/ai-chronicle.test.js
```

The test covers schema 11, offline generation from real realm facts, valid and
invalid AI JSON, deterministic fallback, costs, legitimacy/morale effects,
contact bond/trust/memories, all caps, resource refusal and save validation.

The Atelier's real browser path with the offline fallback was checked on the
built runtime in a headless Chromium session. The realm was paused, the panel
was opened from the management deck, and all three commissions were driven:
a book (25 gold, +1 legitimacy, +0.4 morale), an artifact (15 gold + 8 stone,
+2 legitimacy) and a free conversation with a selected resident. The generated
book named the real kingdom, ruler and latest event and used a real resident
as author; the artifact named the kingdom, ruler and latest event; the
conversation named the kingdom, ruler, event and selected resident. The
contact gained bond, trust and a durable memory. All changes stayed within
their caps.

Afterwards the three records were visible in the existing CHRONICLE archive,
and the contact was visible in the existing PEOPLE panel with a dossier link. The realm was saved, the whole page reloaded, Continue was used,
and the book, artifact, audience, contact, memories and last declared effect
survived exactly. A snapshot of the same realm was then reduced to schema 9
with no `aiChronicle`, loaded through the real save path, and migrated to
schema 11 with empty chronicle defaults; the Atelier still generated a new
book afterwards.

The static preview server returned `501` for each proxy `POST`, which is the
expected trigger for the offline fallback; those console resource errors are
not game errors. The live provider path cannot be claimed until
`ZAI_API_KEY` is set in a Pages environment and one real request is observed.
The earlier 50-year browser endurance run was not completed; do not cite it as
a final result for this change.

## Deliberate limits

- No automatic AI calls during ticks, years or settlement.
- No AI-authored game rules, resources, buildings, offices or units.
- One action at a time; no streaming, retry queue or background generation.
- No provider-side conversation memory: each action sends a compact,
  self-contained realm record.
- The client-side prompt is not a security boundary; the server key and the
  bounded, validated response are.
