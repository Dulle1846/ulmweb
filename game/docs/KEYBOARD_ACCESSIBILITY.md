# Keyboard-only play (3.87.0)

**Status: implemented, wired and proven in a real browser.**

Kings & Cards can now be played from the keyboard without reaching for a
pointer. This is a presentation-layer change: no save schema bump, no new RNG
stream, no extra tick or per-frame work.

## What a player can do

- **Pause anywhere.** `P` and `Shift+P` toggle the world even while a button,
  link, summary or tab has focus. Text inputs still receive the letter. The
  header button exposes `aria-pressed`, an updated accessible name and a toast
  in the existing `role="status"` region.
- **Navigate both panel decks.** The three information tabs and the 29-button
  management deck are real tablists. `Tab` enters them, `←`/`→` move between
  tabs and `Home`/`End` jump to either end. The active tab exposes
  `aria-selected` and is the only tab in the sequential focus order.
- **Act without losing focus.** Buildings' **Repair All**, each per-building
  **Repair** row and the timber sale all rebuild their panel after a real
  action. The activated control is remembered and restored afterwards, with a
  bounded fallback to the same command, the bulk repair button or the dialog
  close button. The side-panel market does the same for every buy/sell order.
- **Escape stays honest.** A nested dossier or issue owns `Escape`; management
  no longer closes underneath it.
- **Focus is visible.** A high-specificity `:focus-visible` rule draws a
  two-pixel gold ring with a dark halo on every interactive control inside the
  game shell and overlays, beating legacy `outline:none` rules. High contrast
  widens it to three pixels. Pointer clicks stay visually quiet.

## Player path

1. Start a realm. Focus any control and press `P`; the button reads **RESUME**,
   `aria-pressed="true"` and the toast says `SIMULATION PAUSED`. Press `P`
   again to resume.
2. Focus **MANAGEMENT** and press `Enter`. `Tab` reaches the command deck.
   `→` walks to **Buildings**; `aria-selected="true"` follows the focus ring.
3. `Tab` to **REPAIR ALL DAMAGED STRUCTURES** and press `Enter`. The damage
   count falls and focus remains on a real control in the rebuilt panel.
4. Press `Escape`. Management closes and focus returns to **MANAGEMENT**.
5. Focus **EVENT LOG** and press `End`. **TRADE** becomes active; `Tab` reaches
   a market order and `Enter` completes it without dropping focus.

## Verification

`npm run test:keyboard` opens the real static game in Chromium and performs the
path above with keyboard events only. It asserts the rendered computed focus
style, `aria-selected`, `aria-pressed`, the visible damage count and the toast,
and requires zero page and console errors. `tests/ui/master-ui-contract.test.js`
locks the markup, wiring and stylesheet contract; the 3.12 spec section records
the evidence. No simulation, persistence or cadence test changes are needed.
