# Release gates and backlog cleanup — 2026-11-09

**Repository:** `Dulle1846/ulmweb`
**Production branch:** `ulmweb-branch`
**Production URL:** https://kings-and-cards.pages.dev/
**Audit browser:** Chrome 156 (Cloud Chromium), macOS UA, 432 × 719 CSS px, DPR 2
**Verified release code:** `dc4cead` (skip link + inert dialog background)

This record covers the manual gates requested after the backlog close, the Workers
build alert, and the remote-branch cleanup. It distinguishes verified facts from
manual work that could not be performed in this environment.

## 1. Workers build alert

The alert is **not** a Pages failure and is **not** reproducible on current commits.

| Commit | Context | Workers Builds: kings-and-cards | Cloudflare Pages |
|---|---|---|---|
| `5303e2e` | closed PR #95 head | **failure** (build `355ca011`) | not used as evidence |
| `28bb5e8` | production renderer fix | **success** (build `974de2cc`) | success |
| `2da918e` | backlog-resolution docs | **success** (build `13b00bdf`) | success |

The failing check belongs to the separate Cloudflare Workers service
`kings-and-cards`, not the Pages project. The repository intentionally has no Wrangler
configuration or Worker entry point (`docs/CLOUDFLARE_PAGES_RELEASE.md`). The alert was
attached to the old PR head; the current production line builds that Worker successfully
as well as Pages.

**Action taken:** none in code. Adding a Worker config only to silence the old alert
would create a second deployment target and is explicitly out of scope.

**Remaining owner action (optional):** if email alerts persist, open the Workers
service in the Cloudflare dashboard and inspect the old build notification rule. The
current build receipts are green; no repository change is needed.

## 2. Remote-branch cleanup

Fifteen remote branches were fully merged into `origin/ulmweb-branch` and were deleted
through the authenticated GitHub API:

```text
kac-2.1-stability-performance
kac-2.3-living-chronicles
kac-2.4-life-cycles
kac-2.5-family-kinship
kac-2.7-demography-hardening
kac-2.8-orphan-guardianship
kac-3.1-production-cleanup
kac-3.1-royal-government-visual-overhaul
kac-3.2-lite-city-builder
kac-3.2-release-candidate
kac-3.3-lite-city-builder-roads
kac-3.3-postrelease-audit
kac-3.3-studio-operations
kac-ui-phase2-connected-lineage-v4
kac-ui-phase2-reusable-controls
```

Kept deliberately:

- `ulmweb-branch` — production branch.
- `freebuff/747ba2e7ecbd7eb66d9fab99` — this chat's working branch.
- 67 unmerged historical branches. They are not ancestors of production and may carry
  unique commits; deleting them without a patch-by-patch review would discard history.
  They are left in place for a future, explicit archive decision. In total 69 remote
  heads remain: the 67 unmerged branches, `ulmweb-branch`, and this chat's working branch.
- Local worktree branches `chore/open-issues-triage` and `chore/security-hardening` —
  they belong to active worktrees and were not touched.

Verification after cleanup: `git ls-remote --heads origin` still lists
`ulmweb-branch`; no deleted branch remains.

## 3. Keyboard and focus gates (real browser)

Performed against the production page in the Cloud Chromium tab.

| Check | Result |
|---|---|
| Start dialog is a named modal | `role="dialog"`, `aria-modal="true"`, `aria-labelledby="start-title"` |
| Initial focus | `#player-name-input` inside the start dialog |
| Shift+Tab from first control | Wraps to `#start-settings-btn` (last control), stays inside the dialog |
| Tab from last control | Returns to the first control, stays inside the dialog |
| Visible focus indicator | `2px solid` outline on the focused control |
| Settings dialog | Opens with focus on `#settings-close`; Tab reaches `#settings-music-toggle`; dialog is labelled by `settings-title` |
| Escape | Closes settings and returns focus inside the start dialog (`#player-name-input`) |
| Horizontal overflow at 432 px | None (`scrollWidth === innerWidth`) |
| Main landmarks | `banner`, `main`, `navigation` (Royal administration), `region` (World map), `complementary` (Kingdom management) |
| Canvas names | "Interactive kingdom map", "Minimap", "Exact terrain preview of the chosen world" |
| Progress semantics | `progressbar` named "Royal ambition progress" with a value |
| Focusable count | 74 visible controls on the loaded start/main view |
| Target size (WCAG 2.2 AA) | 55 visible buttons measured; 40 are below the 44 px advisory size, but only two were below the 24 px AA minimum. `#help-btn` (22 px) and `#skip-card-btn` (23.5 px) were raised to explicit 28 px minimums. Live production re-measures both at 28 px and finds 0 controls below 24 px. |

### Skip link and modal inerting — production verification

Verified on production code `dc4cead` in the same Chrome 156 / 432 × 719 / DPR 2 session.

| Check | Measured state |
|---|---|
| Skip link placement | `#skip-to-game` is the first focusable element, before `.game-shell`; unfocused it sits at `top: -58px` |
| Keyboard reachability | With focus reset to the document origin (the way a keyboard user enters from browser chrome), `Tab` focused `#skip-to-game` |
| Visible focus | Focused link: `top: 8px`, 37 px high, `3px solid rgb(240, 217, 159)` outline |
| Activation | `Enter` moved focus to `#main-container`; the link returned off-screen at `top: -58px` |
| Start dialog isolation | `.game-shell` and `#skip-to-game` both had `inert` + `aria-hidden="true"`; only `#start-screen` was exposed |
| Nested settings | Opening settings made `#start-screen` `inert` + `aria-hidden="true"`; `#settings-modal` stayed non-inert and focused `#settings-close` |
| Escape restore | Settings closed; `#start-screen` returned to non-inert/no `aria-hidden`; focus returned to `#player-name-input` |
| Final restore | After founding the realm, shell/start/settings/skip had no `inert` or `aria-hidden`; `document.querySelectorAll("[inert]").length === 0`; focus on `#main-container` |
| Existing gates | Focus trap still wraps `Shift+Tab` to `#start-settings-btn` and `Tab` back to `#player-name-input`; 51 visible controls, 0 below 24 px; no horizontal overflow |
| Console | 0 errors; four WebGL performance warnings only |

### Findings that remain open

- **40 of 55** visible buttons remain below the 44 px advisory touch size (most are
  31–38 px high). They meet the 24 px WCAG 2.2 AA minimum; the 44 px target is a
  comfort recommendation, not an AA failure.
- The former skip-link and modal-background gaps are closed and re-measured in the
  production table above. A human screen-reader pass is still required.
- A **human screen-reader pass** (VoiceOver/NVDA) was not possible in this Linux VM.
  The accessibility tree and keyboard behavior were inspected, but that is not a
  substitute for a real screen-reader session.

## 4. Cross-browser gates

**Blocked in this environment.** Chromium is the only installed Playwright browser, and
it cannot launch because the VM is missing `libnspr4`, `libnss3`, `libatk`,
`libcairo`, `libpango`, `libasound` and related system libraries. The account has no
root and the container has `no_new_privileges`, so `apt-get install` and
`playwright install-deps` cannot run. `preview_playwright` also failed to connect to the
Cloud browser over CDP.

Therefore:

- Chromium production behavior is verified in the real Cloud browser.
- **Firefox and WebKit are not verified.** CI is Chromium-only. This is an explicit
  open gate, not a pass.
- The local `npm run test:e2e` suite remains unavailable for the same library reason;
  GitHub Actions remains the authoritative Chromium E2E run.

Owner action: run the existing browser suite on a machine with Playwright system
dependencies, or add a Firefox/WebKit CI job with the required libraries.

## 5. Release acceptance

The production page serves the verified release code `dc4cead`, the current Node suite
is 612/612, and the 25-year deterministic campaign completes. The manual gates above are
recorded honestly: keyboard/focus pass in Chromium, cross-browser and human
screen-reader passes still open. **Owner visual acceptance is still required before
calling the next release fully accepted.**
