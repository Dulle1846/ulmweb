# Kings & Cards 3.1 — Dynasty and Strategy Management

**Status:** Draft implementation on `kac-3.1-dynasty-strategy-ui`. Not merged or deployed.

## Royal household

The reigning monarch is the existing king entity with a persistent person profile. A consort is selected from living adult residents who share the monarch's species, are compatible with the current paired-reproduction rules, have no active partner and are not a direct-line or sibling relative.

A royal birth creates a real resident entity at the keep with a stable person ID, age zero, a royal-house household marker, a species-consistent profile, two explicit biological parent links and personal memories for both parents and the child. The action checks parent age, species/sex compatibility, family collection limits, entity capacity, a three-year cooldown and the royal household's food/gold costs.

## Hereditary succession

Natural mortality now includes the monarch. Battle deaths use the same memorial pipeline. The successor is selected from living direct descendants recorded in the deceased monarch's memorialized kinship graph, ordered by age and stable person ID as a deterministic tie-breaker. The successor becomes the new king entity and retains their stable person ID and family history.

If the heir is a minor, the system records the living former consort as a regent candidate. This is an explicit status marker, not yet a full regency government: authority delegation, council votes, regent decisions and minority events remain future work. If no living direct heir exists, the throne is marked vacant instead of inventing a successor.

## Government and politics

The initial constitution model stores one of three government forms, one of three tax policies and one of three law codes. Switching them applies bounded legitimacy/faction changes. Tax policy also changes actual tax assessment in the 20-day economic ledger. Four royal decrees have resource costs and effects on political support and morale.

This is a functional first layer, not a full constitution designer. Offices, ministries, parliament, judiciary, rights enforcement, military command, corruption, political parties and policy implementation are not yet modeled.

## Management UI

The management navigation opens five responsive windows:
- Government: constitutional form, taxes, law code and decree count.
- Politics: legitimacy, faction support and resource-backed royal decrees.
- Economy: resource stock, workforce, housing, recent ledger and partner trade.
- Cards: hand inspection, selection, draw and discard.
- Dynasty: monarch, consort selection, direct heirs and succession status.

Buttons call the same validated systems used by the simulation. Failed actions show their reason. Save snapshots include government/dynasty metadata and royal entity markers; older saves receive defaults through normalization.

## Performance and persistence

- The interface renders only when opened or when the player takes an action; no per-frame panel rendering is added.
- Person histories continue to use existing bounded memory and memorial limits.
- Royal births are capped by the shared entity and family graph limits.
- Government and dynasty state are compact DTOs, not cached duplicate person graphs.

## Visual direction

The new art direction is colorful illustrated fantasy strategy art with inked silhouettes, warm highlights, navy-and-gold panels, expressive character portraits and readable iconography. An original scalable comic-style kingdom illustration is now included at `game/assets/kingdom-illustration.svg` and shown on the realm creation screen. The management windows use the new navy-and-gold visual language, with responsive layouts and illustrated framing. This is the first art asset, not yet a complete character portrait, building, terrain or card sprite pack; those remain separate content milestones.

## Verification checklist

The branch adds unit tests for royal marriage eligibility, close-relative exclusion, royal birth, parent reciprocity, birth cooldown, natural succession, minor-heir regent candidate, vacant throne, government normalization, tax multiplier and political decrees. Browser tests should additionally cover all five management windows, save/load after a royal marriage/birth, and king death/succession before this branch is considered merge-ready.
