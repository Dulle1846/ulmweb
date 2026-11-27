// Royal expeditions: persistent ruins and wild places beyond the settlement.
//
// The layer is deliberately small. A world owns eight seeded landmarks, at most
// one party is away at a time, and one constant-time check runs each simulation
// tick. Outcomes are derived from the leader's real skills, the chosen supply
// level, the site's danger and a local deterministic stream, never Math.random.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { getHazardMovementFactor } from "./hazard-modifiers.js";
import { ensurePersonProfile, addPersonMemory } from "./people.js";
import { recordLegacy } from "./legacy.js";
import { isWaterAt, revealArea, worldWidth, worldHeight } from "../world/world.js";
import { transitionGameplayAt } from "../world/transition-biomes.js";
import { getRouteMovementFactorAt } from "./resource-geography.js";

export const EXPEDITION_VERSION = 1;
export const MAX_SITES = 8;
export const MAX_HISTORY = 24;
export const MAX_LORE = 40;
export const MAX_SITE_NOTES = 8;
export const MAX_SITE_NOTE_CHARS = 220;
export const MIN_SITE_DISTANCE = 7;
export const SITE_CHAIN_CLAIMS = Object.freeze(["study", "quarantine"]);
const CHAIN_STAGE_LABELS = Object.freeze(["RUMOUR", "SURVEYED", "FOLLOW-UP READY", "CHAIN CLOSED"]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const clean = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
const round = value => Math.max(0, Math.round(Number(value) || 0));

export const SUPPLY_OPTIONS = Object.freeze([
    Object.freeze({
        id: "light", label: "Light pack", description: "Two weeks of dry rations. Cheap, but the party carries little spare rope, medicine or trade silver.",
        food: 12, gold: 5, bonus: -8, rewardScale: 0.78
    }),
    Object.freeze({
        id: "standard", label: "Royal pack", description: "A balanced royal pack with rope, lamp oil, medicine and a small gift for any stranger met on the road.",
        food: 24, gold: 12, bonus: 0, rewardScale: 1
    }),
    Object.freeze({
        id: "grand", label: "Grand equipage", description: "Mules, a surveyor, a healer and enough supplies to camp through bad weather. Expensive, but far safer.",
        food: 42, gold: 24, bonus: 12, rewardScale: 1.28
    })
]);

const SITE_TYPES = Object.freeze([
    Object.freeze({
        id: "ruins", label: "Sunken Ruins", glyph: "⌂", danger: 2,
        base: Object.freeze({ gold: 28, stone: 14 }),
        lore: Object.freeze([
            "A paved court lies under the sand. The names cut into its threshold belong to a house no living chronicle remembers.",
            "The fallen hall was built around a well that still holds clean water. Its stones carry the mark of an older kingdom.",
            "A sealed archive survived beneath the rubble. Most of it is ash, but one ledger lists a road that no longer exists."
        ])
    }),
    Object.freeze({
        id: "cave", label: "Whispering Cave", glyph: "◒", danger: 3,
        base: Object.freeze({ stone: 24, gold: 16 }),
        lore: Object.freeze([
            "Beyond the dripstone the cave opens into a dry chamber. Someone once lived here, and left a lamp still smelling of oil.",
            "Old tool marks cross the wall in a language of notches. The surveyor copies them before the party turns back.",
            "A narrow fissure leads to a vein of pale stone. It is too deep to work, but samples return with the party."
        ])
    }),
    Object.freeze({
        id: "shrine", label: "Forgotten Shrine", glyph: "✦", danger: 1,
        base: Object.freeze({ gold: 12, food: 20 }),
        lore: Object.freeze([
            "The shrine's roof is gone, but its altar is dry. A handful of wild grain has been laid there recently.",
            "A pilgrim's route is carved into the doorpost. The last hand to touch it left a small copper coin.",
            "The spring beside the altar still runs. Its water is sweet, and the old stone basin has not cracked."
        ])
    }),
    Object.freeze({
        id: "tower", label: "Broken Watchtower", glyph: "⌁", danger: 2,
        base: Object.freeze({ wood: 22, stone: 16 }),
        lore: Object.freeze([
            "The tower's beacon floor still holds a rusted brazier. From the top, the old border road is visible for miles.",
            "A sealed dispatch case is wedged beneath a fallen beam. Its wax seal is broken, but the map inside is intact.",
            "The stair spirals around a core of good timber. Most of it can be salvaged without bringing the shell down."
        ])
    }),
    Object.freeze({
        id: "crater", label: "Starfall Crater", glyph: "◈", danger: 3,
        base: Object.freeze({ gold: 26, stone: 20 }),
        lore: Object.freeze([
            "The crater glass is warm even at dawn. A dark stone at its centre rings softly when struck.",
            "Nothing grows in the inner ring. The surveyor marks the boundary and refuses to camp inside it.",
            "A fragment of iron, twisted like a root, is recovered from the rim. The smith will want to see it."
        ])
    }),
    Object.freeze({
        id: "grove", label: "Old Grove", glyph: "♣", danger: 1,
        base: Object.freeze({ food: 26, wood: 20 }),
        lore: Object.freeze([
            "The grove is older than the realm's charter. Its oldest tree carries a boundary mark cut before the first keep.",
            "A ring of stones surrounds a spring. The grass inside is green even in a dry year.",
            "The grove keeps a stand of straight timber that no forester has touched. The party returns with seed cones."
        ])
    }),
    Object.freeze({
        id: "barrow", label: "Pale Barrow", glyph: "⌃", danger: 2,
        base: Object.freeze({ gold: 22, food: 8 }),
        lore: Object.freeze([
            "The barrow was opened long ago. Its inner chamber is empty except for a stone chair facing the sunrise.",
            "A line of carved names runs around the mound. The newest is only a generation old.",
            "The barrow's capstone is a boundary stone from an older road. Its inscription is still legible."
        ])
    }),
    Object.freeze({
        id: "caravanserai", label: "Lost Caravanserai", glyph: "▣", danger: 1,
        base: Object.freeze({ gold: 24, food: 16 }),
        lore: Object.freeze([
            "The courtyard walls still stand. A cistern beneath them holds a season of rain, and the old well is clear.",
            "A merchant's tally is scratched into the gate. It names goods the realm no longer trades.",
            "The eastern stable is sound enough to shelter a caravan. Its feed store has long since been emptied."
        ])
    })
]);

const SITE_BY_ID = new Map(SITE_TYPES.map(type => [type.id, type]));
const SUPPLY_BY_ID = new Map(SUPPLY_OPTIONS.map(supply => [supply.id, supply]));

// Each landmark owns one short follow-up chain. The biome decree supplies the
// claim; the next successful visit to that landmark closes it. These are fixed
// labels and fixed modifiers, not new currencies or per-tick content.
export const SITE_CHAINS = Object.freeze({
    ruins: Object.freeze({
        title: "The old archive road",
        study: Object.freeze({
            label: "Archive cross-check", score: 6, reward: 0.12,
            opening: "The blight ledger names a road beneath the ruins. Copy the archive before the next thaw.",
            closure: "Archive cross-check complete: the lost road is mapped and the rot's route is understood."
        }),
        quarantine: Object.freeze({
            label: "Sealed approach", score: 3, reward: 0.05,
            opening: "The crown orders the ruin approach sealed while the archive is watched from a safe distance.",
            closure: "The sealed approach held. A smaller cache was recovered without opening the infected court."
        })
    }),
    cave: Object.freeze({
        title: "The notch-language vein",
        study: Object.freeze({
            label: "Sample the vein", score: 6, reward: 0.12,
            opening: "A blight sample must be taken from the pale vein before the cave floods again.",
            closure: "The vein was sampled and its notch-language marks copied into the royal survey."
        }),
        quarantine: Object.freeze({
            label: "Fence the fissure", score: 3, reward: 0.05,
            opening: "A fence goes up around the fissure so nothing in the cave can carry the rot outward.",
            closure: "The fissure fence held; the party returned with a cautious sample and a safe map."
        })
    }),
    shrine: Object.freeze({
        title: "The pilgrim spring",
        study: Object.freeze({
            label: "Read the pilgrim route", score: 6, reward: 0.12,
            opening: "The shrine's doorpost names a pilgrim route that may explain how the blight travelled.",
            closure: "The pilgrim route was read and the spring's older path entered into the atlas."
        }),
        quarantine: Object.freeze({
            label: "Ward the spring", score: 3, reward: 0.05,
            opening: "The crown wards the spring and asks the next party to test the water without drinking it.",
            closure: "The ward held. The spring was tested, recorded and left for the pilgrims to return to."
        })
    }),
    tower: Object.freeze({
        title: "The border beacon map",
        study: Object.freeze({
            label: "Copy the dispatch map", score: 6, reward: 0.12,
            opening: "A dispatch case in the tower may hold the old border map the blight decree asks for.",
            closure: "The dispatch map was copied. Border beacons can now be read against the royal roads."
        }),
        quarantine: Object.freeze({
            label: "Hold the beacon", score: 3, reward: 0.05,
            opening: "The beacon floor is quarantined until a party can inspect it in dry weather.",
            closure: "The beacon was held and its supply ledger recovered without disturbing the infected floor."
        })
    }),
    crater: Object.freeze({
        title: "The starfall glass",
        study: Object.freeze({
            label: "Assay the iron root", score: 6, reward: 0.12,
            opening: "The crater's iron root may explain the blight's resistance. A sample is ordered.",
            closure: "The iron root was assayed and the crater's glass entered the crown's mineral record."
        }),
        quarantine: Object.freeze({
            label: "Ring the crater", score: 3, reward: 0.05,
            opening: "A ring is marked around the crater; the next party must survey it from outside.",
            closure: "The ring held and a rim fragment was recovered without entering the warm centre."
        })
    }),
    grove: Object.freeze({
        title: "The old boundary grove",
        study: Object.freeze({
            label: "Seed-cone survey", score: 6, reward: 0.12,
            opening: "Seed cones from the oldest tree may show how the old boundary resisted blight.",
            closure: "The seed cones were catalogued and the grove's boundary entered on the royal map."
        }),
        quarantine: Object.freeze({
            label: "Grove cordon", score: 3, reward: 0.05,
            opening: "A cordon goes around the grove while the crown decides whether its spring is safe.",
            closure: "The cordon held. The party returned with clean seed and a measured boundary record."
        })
    }),
    barrow: Object.freeze({
        title: "The named boundary barrow",
        study: Object.freeze({
            label: "Transcribe the names", score: 6, reward: 0.12,
            opening: "The carved names on the barrow may name the first blight wardens. Send a clerk.",
            closure: "The names were transcribed and the barrow's place on the old boundary confirmed."
        }),
        quarantine: Object.freeze({
            label: "Seal the chair", score: 3, reward: 0.05,
            opening: "The stone chair is sealed until a party can inspect the chamber without opening it.",
            closure: "The chair remained sealed; the party copied the outer names and withdrew cleanly."
        })
    }),
    caravanserai: Object.freeze({
        title: "The lost caravan route",
        study: Object.freeze({
            label: "Tally the old goods", score: 6, reward: 0.12,
            opening: "The gate tally names goods the realm no longer trades. A follow-up party must copy it.",
            closure: "The old tally was copied and the lost caravan route restored to the trade atlas."
        }),
        quarantine: Object.freeze({
            label: "Close the eastern stable", score: 3, reward: 0.05,
            opening: "The eastern stable is closed until the cistern can be tested by a royal party.",
            closure: "The stable stayed closed while the cistern was tested and the route safely remapped."
        })
    })
});

function chainClaim(value) {
    return SITE_CHAIN_CLAIMS.includes(value) ? value : null;
}

function pushSiteNote(site, text) {
    const note = clean(text, MAX_SITE_NOTE_CHARS);
    if (!note) return;
    const notes = Array.isArray(site.notes) ? site.notes.filter(entry => typeof entry === "string") : [];
    notes.unshift(note);
    site.notes = notes.slice(0, MAX_SITE_NOTES);
}

function hash32(...values) {
    let hash = 2166136261;
    for (const value of values) {
        let number = Number(value) || 0;
        for (let shift = 0; shift < 4; shift++) {
            hash ^= (number >>> (shift * 8)) & 0xff;
            hash = Math.imul(hash, 16777619);
        }
    }
    return hash >>> 0;
}

function stream(seed) {
    let value = seed >>> 0;
    return () => {
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
        return value / 4294967296;
    };
}

function centre() {
    const keep = state.entities.find(entity => entity && !entity.dead && entity.type === TYPE.KEEP);
    if (keep) return { x: Math.round(keep.x), y: Math.round(keep.y) };
    return { x: Math.floor(worldWidth() / 2), y: Math.floor(worldHeight() / 2) };
}

function regionOf(x, y, cx, cy) {
    const dx = x - cx, dy = y - cy;
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return "the home marches";
    const east = dx >= 0 ? "east" : "west";
    const north = dy >= 0 ? "north" : "south";
    if (Math.abs(dx) > Math.abs(dy) * 1.7) return `the ${east} marches`;
    if (Math.abs(dy) > Math.abs(dx) * 1.7) return `the ${north} marches`;
    return `the ${north}-${east} marches`;
}

function distanceBetween(a, b) {
    return Math.max(1, Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 10) / 10);
}

function siteAt(sites, id) {
    return sites.find(site => site.id === String(id)) || null;
}

function notifyExpeditionChange() {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new Event("kac:expedition-change"));
    }
}

function makeSites() {
    const W = Math.floor(worldWidth()), H = Math.floor(worldHeight());
    if (!state.heightMap || W < 24 || H < 24) return [];
    const start = centre();
    const rng = stream(hash32(state.worldSeed, W, H, 0x51a7e));
    const sites = [];
    for (let index = 0; index < MAX_SITES; index++) {
        const type = SITE_TYPES[index];
        let chosen = null;
        for (let attempt = 0; attempt < 160; attempt++) {
            const x = 6 + Math.floor(rng() * Math.max(1, W - 12));
            const y = 6 + Math.floor(rng() * Math.max(1, H - 12));
            if (Math.abs(x - start.x) < 8 && Math.abs(y - start.y) < 8) continue;
            if (isWaterAt(x + 0.5, y + 0.5)) continue;
            if (sites.some(site => Math.hypot(site.x - x, site.y - y) < MIN_SITE_DISTANCE)) continue;
            if (state.entities.some(entity => !entity.dead && entity.isBuilding() && Math.hypot(entity.x - x, entity.y - y) < 4)) continue;
            chosen = { x, y };
            break;
        }
        // A land-heavy seed will find eight sites long before this fallback.
        // A tiny or water-heavy fixture still receives a deterministic survey
        // point instead of an empty expedition panel.
        if (!chosen) {
            for (let y = 6; y < H - 6 && !chosen; y += 5) {
                for (let x = 6; x < W - 6; x += 5) {
                    if (isWaterAt(x + 0.5, y + 0.5)) continue;
                    if (sites.some(site => Math.hypot(site.x - x, site.y - y) < 3)) continue;
                    chosen = { x, y };
                    break;
                }
            }
        }
        if (!chosen) continue;
        const known = Boolean(state.explored?.[chosen.x]?.[chosen.y]);
        sites.push({
            id: "site-" + (index + 1),
            type: type.id,
            name: type.label,
            glyph: type.glyph,
            danger: type.danger,
            x: chosen.x,
            y: chosen.y,
            region: regionOf(chosen.x, chosen.y, start.x, start.y),
            distance: distanceBetween(chosen, start),
            known,
            cleared: false,
            chainStage: 0,
            claim: null,
            notes: [],
            loreId: null
        });
    }
    return sites;
}

export function createExpeditionsState() {
    return {
        version: EXPEDITION_VERSION,
        seed: Number(state.worldSeed) || 0,
        sites: [],
        active: null,
        history: [],
        lore: [],
        completed: 0,
        discoveries: 0,
        nextId: 1,
        lastUpdateTick: 0
    };
}

function normalizeSite(site, index) {
    if (!site || typeof site !== "object" || Array.isArray(site)) return null;
    const type = SITE_BY_ID.get(String(site.type || ""));
    if (!type) return null;
    const x = Math.round(Number(site.x)), y = Math.round(Number(site.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    let chainStage = clamp(Math.floor(Number(site.chainStage) || 0), 0, 3);
    // A stage below 2 never carries a claim; stage 3 keeps the final claim as
    // history so the card can still explain which follow-up was closed. A bad
    // or missing order can never leave a half-armed site in a loaded save.
    let claim = chainStage >= 2 ? chainClaim(site.claim) : null;
    if (chainStage >= 2 && !claim) chainStage = 1;
    const notes = (Array.isArray(site.notes) ? site.notes : [])
        .filter(entry => typeof entry === "string")
        .map(entry => clean(entry, MAX_SITE_NOTE_CHARS))
        .filter(Boolean)
        .slice(0, MAX_SITE_NOTES);
    return {
        id: clean(site.id || "site-" + (index + 1), 32) || "site-" + (index + 1),
        type: type.id,
        name: clean(site.name || type.label, 64) || type.label,
        glyph: clean(site.glyph || type.glyph, 4) || type.glyph,
        danger: clamp(site.danger, 1, 3),
        x, y,
        region: clean(site.region || "the outer marches", 48) || "the outer marches",
        distance: clamp(site.distance, 1, 4096),
        known: Boolean(site.known),
        cleared: Boolean(site.cleared),
        chainStage,
        claim,
        notes,
        loreId: site.loreId ? clean(site.loreId, 64) : null
    };
}

function normalizeOutcome(outcome) {
    if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) return null;
    const tier = ["triumph", "success", "costly", "disaster"].includes(outcome.tier) ? outcome.tier : "success";
    return {
        tier,
        title: clean(outcome.title || "The party returns", 80),
        text: clean(outcome.text || "", 320),
        injuryDays: clamp(outcome.injuryDays, 0, 160),
        loot: outcome.loot && typeof outcome.loot === "object" && !Array.isArray(outcome.loot)
            ? Object.fromEntries(["wood", "stone", "gold", "food"].filter(key => Number(outcome.loot[key]) > 0)
                .map(key => [key, round(outcome.loot[key])]))
            : {},
        prestige: clamp(outcome.prestige, 0, 8),
        chainClaim: chainClaim(outcome.chainClaim),
        chainBonus: clamp(outcome.chainBonus, 0, 20)
    };
}

function normalizeActive(active) {
    if (!active || typeof active !== "object" || Array.isArray(active)) return null;
    const siteId = clean(active.siteId, 32);
    const leaderId = clean(active.leaderId, 80);
    if (!siteId || !leaderId) return null;
    const departTick = round(active.departTick);
    const arriveTick = Math.max(departTick, round(active.arriveTick));
    const returnTick = Math.max(arriveTick, round(active.returnTick));
    return {
        id: clean(active.id || "expedition-1", 32) || "expedition-1",
        siteId,
        leaderId,
        leaderName: clean(active.leaderName || "Unnamed leader", 64),
        supplyId: SUPPLY_BY_ID.has(active.supplyId) ? active.supplyId : "standard",
        departTick,
        arriveTick,
        returnTick,
        phase: ["outbound", "returning"].includes(active.phase) ? active.phase : "outbound",
        outcome: normalizeOutcome(active.outcome)
    };
}

export function normalizeExpeditionsState(value = state.expeditions) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const seen = new Set();
    const sites = (Array.isArray(source.sites) ? source.sites : [])
        .map(normalizeSite).filter(Boolean)
        .filter(site => {
            if (seen.has(site.id)) return false;
            seen.add(site.id);
            return true;
        })
        .slice(0, MAX_SITES);
    const history = (Array.isArray(source.history) ? source.history : [])
        .filter(entry => entry && typeof entry === "object" && !Array.isArray(entry))
        .map(entry => ({
            id: clean(entry.id, 32),
            siteId: clean(entry.siteId, 32),
            siteName: clean(entry.siteName || "An old landmark", 64),
            leaderId: clean(entry.leaderId, 80),
            leaderName: clean(entry.leaderName || "An unnamed leader", 64),
            tier: ["triumph", "success", "costly", "disaster"].includes(entry.tier) ? entry.tier : "success",
            chainClaim: chainClaim(entry.chainClaim),
            title: clean(entry.title || "The party returns", 96),
            year: Math.max(1, Math.floor(Number(entry.year) || 1)),
            tick: round(entry.tick),
            loot: entry.loot && typeof entry.loot === "object" && !Array.isArray(entry.loot) ? { ...entry.loot } : {}
        }))
        .filter(entry => entry.id)
        .slice(0, MAX_HISTORY);
    const lore = (Array.isArray(source.lore) ? source.lore : [])
        .filter(entry => entry && typeof entry === "object" && !Array.isArray(entry))
        .map(entry => ({
            id: clean(entry.id, 64),
            siteId: clean(entry.siteId, 32),
            siteName: clean(entry.siteName || "An old landmark", 64),
            title: clean(entry.title || "A recovered fragment", 96),
            text: clean(entry.text, 320),
            year: Math.max(1, Math.floor(Number(entry.year) || 1)),
            tick: round(entry.tick)
        }))
        .filter(entry => entry.id && entry.text)
        .slice(0, MAX_LORE);
    const active = normalizeActive(source.active);
    const nextId = Math.max(
        Math.floor(Number(source.nextId) || 1),
        history.reduce((max, entry) => Math.max(max, Number(String(entry.id).replace(/\D/g, "")) || 0), 0) + 1
    );
    state.expeditions = {
        version: EXPEDITION_VERSION,
        seed: Math.max(0, Math.floor(Number(source.seed) || 0)),
        sites,
        active,
        history,
        lore,
        completed: Math.max(history.length, Math.floor(Number(source.completed) || 0)),
        discoveries: Math.max(lore.length, Math.floor(Number(source.discoveries) || 0)),
        nextId,
        lastUpdateTick: round(source.lastUpdateTick)
    };
    return state.expeditions;
}

export function ensureExpeditions() {
    const current = state.expeditions && typeof state.expeditions === "object" && !Array.isArray(state.expeditions)
        ? state.expeditions
        : createExpeditionsState();
    const seed = Math.max(0, Math.floor(Number(state.worldSeed) || 0));
    const needsSites = !Array.isArray(current.sites) || current.sites.length === 0
        || Number(current.seed) !== seed
        || current.sites.some(site => site.x < 0 || site.x >= worldWidth() || site.y < 0 || site.y >= worldHeight());
    if (state.expeditions !== current) state.expeditions = current;
    if (needsSites && state.hasStarted) {
        current.sites = makeSites();
        current.seed = seed;
        current.active = null;
        current.completed = Math.max(0, Math.floor(Number(current.completed) || 0));
        current.discoveries = Math.max(0, Math.floor(Number(current.discoveries) || 0));
        current.nextId = Math.max(1, Math.floor(Number(current.nextId) || 1));
    }
    if (!Array.isArray(current.sites)) current.sites = [];
    if (!Array.isArray(current.history)) current.history = [];
    if (!Array.isArray(current.lore)) current.lore = [];
    // Old snapshots predate the follow-up fields. Normalize them in place the
    // first time the live layer is touched, without changing the save version.
    if (current.sites.some(site => Number(site.chainStage) !== Math.floor(Number(site.chainStage))
        || !Array.isArray(site.notes)
        || (Number(site.chainStage) >= 2 && !chainClaim(site.claim)))) {
        current.sites = current.sites.map(normalizeSite).filter(Boolean);
    }
    // Keep the live active object stable while it is travelling. Replacing it
    // on every ensure() would detach references held by the UI or a caller.
    if (current.active && (!current.active.id || !current.active.siteId)) current.active = normalizeActive(current.active);
    if (current.active) {
        const activeSite = siteAt(current.sites, current.active.siteId);
        const leader = state.entities.find(entity => String(entity.personId || entity.id) === current.active.leaderId);
        if (!activeSite || !leader) {
            current.active = null;
        } else if (!leader.dead) {
            leader.expeditionId = current.active.id;
        }
    }
    return current;
}

export function expeditionCandidates() {
    return state.entities
        .filter(entity => entity && !entity.dead && entity.type === TYPE.VILLAGER && !entity.isKing && !entity.expeditionId)
        .map(entity => {
            const person = ensurePersonProfile(entity);
            return { entity, person };
        })
        .filter(({ person }) => person && Number(person.ageYears) >= 16)
        .sort((a, b) => a.person.name.localeCompare(b.person.name))
        .slice(0, 24)
        .map(({ entity, person }) => ({
            personId: String(person.id),
            name: person.name,
            role: person.role,
            species: person.species,
            ageYears: Math.floor(person.ageYears),
            skill: Math.round(leaderSkill(person)),
            traits: { ...person.traits },
            skills: { ...person.skills }
        }));
}

function leaderSkill(person) {
    const skills = person?.skills || {};
    return Math.max(0, Math.min(100,
        (Number(skills.command) || 50) * 0.4
        + (Number(skills.learning) || 50) * 0.32
        + (Number(skills.care) || 50) * 0.16
        + (Number(skills.trade) || 50) * 0.12
    ));
}

export function expeditionProgress(active) {
    if (!active) return 0;
    const tick = Number(state.tick) || 0;
    if (tick <= active.departTick) return 0;
    if (tick < active.arriveTick) {
        const span = Math.max(1, active.arriveTick - active.departTick);
        return Math.max(0, Math.min(50, ((tick - active.departTick) / span) * 50));
    }
    if (tick < active.returnTick) {
        const span = Math.max(1, active.returnTick - active.arriveTick);
        return Math.max(50, Math.min(100, 50 + ((tick - active.arriveTick) / span) * 50));
    }
    return 100;
}

function markSiteKnown(site) {
    if (!site || site.known) return;
    if (state.explored?.[site.x]?.[site.y]) site.known = true;
}

export function getExpeditionSnapshot() {
    if (!state.hasStarted) {
        return {
            sites: [], candidates: [], active: null, history: [], lore: [],
            supplies: SUPPLY_OPTIONS.map(item => ({ ...item })),
            stats: { sites: 0, known: 0, cleared: 0, chainReady: 0, chainClosed: 0, completed: 0, discoveries: 0, active: false }
        };
    }
    const expeditions = ensureExpeditions();
    for (const site of expeditions.sites) markSiteKnown(site);
    const active = expeditions.active;
    const activeSite = active ? siteAt(expeditions.sites, active.siteId) : null;
    const activeLeader = active
        ? state.entities.find(entity => !entity.dead && String(entity.personId || entity.id) === active.leaderId)
        : null;
    return {
        sites: expeditions.sites.map(site => {
            const stage = clamp(Math.floor(Number(site.chainStage) || 0), 0, 3);
            const claim = stage >= 2 ? chainClaim(site.claim) : null;
            const visible = Boolean(site.known || site.cleared || stage === 2);
            return {
                id: site.id,
                type: site.type,
                typeLabel: SITE_BY_ID.get(site.type)?.label || site.name,
                name: site.known || site.cleared ? site.name : `Uncharted ${SITE_BY_ID.get(site.type)?.label || "landmark"}`,
                glyph: site.glyph,
                danger: site.danger,
                x: site.x,
                y: site.y,
                region: site.region,
                distance: site.distance,
                known: Boolean(site.known || site.cleared),
                cleared: Boolean(site.cleared),
                chainStage: stage,
                chainLabel: CHAIN_STAGE_LABELS[stage],
                chainTitle: visible ? SITE_CHAINS[site.type]?.title || null : null,
                claim,
                claimLabel: visible && claim ? SITE_CHAINS[site.type]?.[claim]?.label || null : null,
                notes: visible ? [...(Array.isArray(site.notes) ? site.notes : [])] : [],
                loreId: site.loreId || null
            };
        }),
        candidates: expeditionCandidates(),
        active: active ? {
            ...active,
            siteName: activeSite?.name || "An unknown landmark",
            siteGlyph: activeSite?.glyph || "?",
            siteRegion: activeSite?.region || "the outer marches",
            leaderName: activeLeader ? ensurePersonProfile(activeLeader).name : active.leaderName,
            leaderSkill: activeLeader ? Math.round(leaderSkill(ensurePersonProfile(activeLeader))) : 0,
            supplyLabel: SUPPLY_BY_ID.get(active.supplyId)?.label || "Royal pack",
            progress: expeditionProgress(active),
            remainingDays: Math.max(0, Math.floor(active.returnTick - (Number(state.tick) || 0)))
        } : null,
        history: expeditions.history.map(entry => ({ ...entry, loot: { ...entry.loot } })),
        lore: expeditions.lore.map(entry => ({ ...entry })),
        supplies: SUPPLY_OPTIONS.map(item => ({ ...item })),
        stats: {
            sites: expeditions.sites.length,
            known: expeditions.sites.filter(site => site.known || site.cleared).length,
            cleared: expeditions.sites.filter(site => site.cleared).length,
            chainReady: expeditions.sites.filter(site => Number(site.chainStage) === 2 && chainClaim(site.claim)).length,
            chainClosed: expeditions.sites.filter(site => Number(site.chainStage) === 3).length,
            completed: Math.max(0, Math.floor(Number(expeditions.completed) || 0)),
            discoveries: Math.max(0, Math.floor(Number(expeditions.discoveries) || 0)),
            active: Boolean(active)
        }
    };
}

export function startExpedition(siteId, leaderId, supplyId = "standard") {
    const expeditions = ensureExpeditions();
    if (!state.hasStarted) return { ok: false, reason: "no-realm" };
    if (expeditions.active) return { ok: false, reason: "expedition-already-active" };
    const site = siteAt(expeditions.sites, siteId);
    if (!site) return { ok: false, reason: "unknown-landmark" };
    const leader = state.entities.find(entity => entity && !entity.dead
        && String(entity.personId || entity.id) === String(leaderId || ""));
    if (!leader || leader.type !== TYPE.VILLAGER || leader.isKing) return { ok: false, reason: "eligible-leader-not-found" };
    const person = ensurePersonProfile(leader);
    if (Number(person.ageYears) < 16) return { ok: false, reason: "leader-not-adult" };
    if (leader.expeditionId) return { ok: false, reason: "leader-already-away" };
    const supply = SUPPLY_BY_ID.get(supplyId) || SUPPLY_BY_ID.get("standard");
    const foodCost = supply.food + Math.ceil(site.distance * 0.35);
    const goldCost = supply.gold;
    // The route beyond the last field reads the site's named seam. A wet
    // floodplain or a mountain tree line costs travel days; an open dry wood
    // is quicker. This is an expedition-scale route cost, not a per-step scan.
    const ecotone = transitionGameplayAt(site.x + 0.5, site.y + 0.5);
    const routeSpeed = getRouteMovementFactorAt(site.x, site.y);
    const routeFactor = Math.max(0.75, Math.min(1.30, 1 / Math.max(0.55, routeSpeed)));
    if ((Number(state.resources.food) || 0) < foodCost) return { ok: false, reason: "not-enough-food" };
    if ((Number(state.resources.gold) || 0) < goldCost) return { ok: false, reason: "not-enough-gold" };
    addResource("food", -foodCost);
    addResource("gold", -goldCost);
    // Extreme weather closes passes and slows the column. The factor is 1 in
    // calm weather, so existing expedition timings are unchanged.
    const travelDays = Math.max(3, Math.round((6 + Math.ceil(site.distance / 2.4)) * routeFactor / Math.max(0.5, getHazardMovementFactor())));
    const departTick = Number(state.tick) || 0;
    const id = "expedition-" + expeditions.nextId++;
    const active = {
        id,
        siteId: site.id,
        leaderId: String(person.id),
        leaderName: person.name,
        supplyId: supply.id,
        departTick,
        arriveTick: departTick + travelDays,
        returnTick: departTick + travelDays * 2,
        phase: "outbound",
        outcome: null
    };
    leader.expeditionId = id;
    expeditions.active = active;
    addPersonMemory(leader, {
        id: "expedition-departs:" + id,
        type: "expedition",
        text: "I set out with the royal expedition for " + site.name + " in year " + state.year + ".",
        tick: state.tick,
        importance: 74
    });
    addLog("ROYAL EXPEDITION SETS OUT: " + person.name.toUpperCase() + " → " + site.name.toUpperCase() + " · " + travelDays + " DAYS TO THE SITE"
        + (ecotone ? " · " + ecotone.place.toUpperCase() : ""), "#d8c18a", "exploration");
    notifyExpeditionChange();
    return { ok: true, expedition: getExpeditionSnapshot() };
}

function resolveOutcome(active, site, person) {
    const rng = stream(hash32(active.id, site.id, active.leaderId, active.departTick, state.worldSeed));
    const skill = leaderSkill(person);
    const supply = SUPPLY_BY_ID.get(active.supplyId) || SUPPLY_BY_ID.get("standard");
    // A claimed follow-up changes the settled score and cache by fixed amounts.
    // It consumes no extra randomness and cannot be armed twice.
    const claim = Number(site.chainStage) === 2 ? chainClaim(site.claim) : null;
    const chain = claim ? SITE_CHAINS[site.type]?.[claim] : null;
    const chainBonus = chain ? Number(chain.score) || 0 : 0;
    const score = skill + supply.bonus + rng() * 46 - site.danger * 11 + (site.cleared ? -18 : 0) + chainBonus;
    const tier = score >= 82 ? "triumph" : score >= 61 ? "success" : score >= 39 ? "costly" : "disaster";
    const type = SITE_BY_ID.get(site.type);
    const loreIndex = Math.floor(rng() * (type?.lore.length || 1));
    const lore = type?.lore[loreIndex] || "The party returns with a map of an empty road.";
    const scale = (tier === "triumph" ? 2.2 : tier === "success" ? 1.3 : tier === "costly" ? 0.55 : 0)
        * Number(supply.rewardScale || 1)
        * (site.cleared ? 0.55 : 1)
        * (chain ? 1 + (Number(chain.reward) || 0) : 1);
    const loot = Object.fromEntries(Object.entries(type?.base || {})
        .map(([key, value]) => [key, Math.round(Number(value) * scale)])
        .filter(([, value]) => value > 0));
    const injuryDays = tier === "costly" ? 40 : tier === "disaster" ? 80 : 0;
    const title = tier === "triumph" ? "A triumph worth recording"
        : tier === "success" ? "The expedition returns"
            : tier === "costly" ? "A costly return" : "The wilds take their toll";
    return {
        tier,
        title,
        text: lore,
        injuryDays,
        loot,
        prestige: tier === "triumph" ? 3 : tier === "success" ? 1 : 0,
        chainClaim: claim,
        chainBonus
    };
}

function finishExpedition(expeditions, active, site) {
    const leader = state.entities.find(entity => String(entity.personId || entity.id) === active.leaderId);
    const person = leader ? ensurePersonProfile(leader) : null;
    const outcome = active.outcome || resolveOutcome(active, site, person || { skills: {} });
    const year = Math.max(1, Number(state.year) || 1);
    const lootText = Object.entries(outcome.loot).map(([key, value]) => value + " " + key).join(" · ");
    for (const [key, value] of Object.entries(outcome.loot)) addResource(key, value);
    if (leader && outcome.injuryDays > 0) {
        leader.illnessStartedTick = state.tick;
        leader.illnessUntilTick = Math.max(Number(leader.illnessUntilTick) || 0, state.tick + outcome.injuryDays * 4);
    }
    if (leader && person) {
        addPersonMemory(leader, {
            id: "expedition-return:" + active.id,
            type: "expedition",
            text: (outcome.tier === "disaster" ? "I came back from " : "I returned from ")
                + site.name + " in year " + year + ". " + outcome.text,
            tick: state.tick,
            importance: outcome.tier === "triumph" ? 96 : outcome.tier === "success" ? 80 : 70
        });
    }
    site.known = true;
    const wasCleared = site.cleared;
    const successful = outcome.tier === "triumph" || outcome.tier === "success";
    site.cleared = site.cleared || successful;
    const claim = Number(site.chainStage) === 2 ? chainClaim(site.claim) : null;
    const claimLabel = claim ? SITE_CHAINS[site.type]?.[claim]?.label || claim : null;
    if (claim && successful) {
        site.chainStage = 3;
        pushSiteNote(site, SITE_CHAINS[site.type]?.[claim]?.closure || "The follow-up order was closed.");
    } else if (claim && !successful) {
        pushSiteNote(site, "The " + claimLabel + " follow-up was driven back; the order remains open.");
    } else if (Number(site.chainStage) === 0 && successful) {
        site.chainStage = 1;
        pushSiteNote(site, "First survey recorded: " + outcome.text);
    }
    const loreEntry = !wasCleared && successful
        ? {
            id: "lore-" + site.id + "-" + year + "-" + (expeditions.discoveries + 1),
            siteId: site.id,
            siteName: site.name,
            title: outcome.title,
            text: outcome.text,
            year,
            tick: state.tick
        }
        : null;
    if (loreEntry) {
        site.loreId = loreEntry.id;
        expeditions.lore.unshift(loreEntry);
        if (expeditions.lore.length > MAX_LORE) expeditions.lore.length = MAX_LORE;
        expeditions.discoveries++;
        recordLegacy("expedition", site.name + " explored", outcome.text, { importance: outcome.tier === "triumph" ? 3 : 2 });
    } else if (outcome.tier === "costly" || outcome.tier === "disaster") {
        recordLegacy("expedition", "The road to " + site.name + " turned cruel", outcome.text, { importance: 1 });
    }
    if (outcome.tier === "disaster") {
        state.morale = Math.max(0, (Number(state.morale) || 0) - 2);
    }
    expeditions.history.unshift({
        id: active.id,
        siteId: site.id,
        siteName: site.name,
        leaderId: active.leaderId,
        leaderName: active.leaderName,
        tier: outcome.tier,
        chainClaim: chainClaim(outcome.chainClaim),
        title: outcome.title,
        year,
        tick: state.tick,
        loot: { ...outcome.loot }
    });
    if (expeditions.history.length > MAX_HISTORY) expeditions.history.length = MAX_HISTORY;
    expeditions.completed = Math.max(0, Number(expeditions.completed) || 0) + 1;
    if (expeditions.active?.id === active.id) expeditions.active = null;
    if (leader) delete leader.expeditionId;
    addLog("EXPEDITION RETURNS FROM " + site.name.toUpperCase() + ": " + outcome.title.toUpperCase()
        + (lootText ? " · " + lootText : "") + (outcome.injuryDays ? " · THE LEADER IS WOUNDED" : "")
        + (claim && successful ? " · " + String(claimLabel).toUpperCase() + " FOLLOW-UP CLOSED" : ""), outcome.tier === "disaster" ? "#b99a9a" : "#a3d6a7", "exploration");
    notifyExpeditionChange();
    return outcome;
}

// A blight study or quarantine does not invent a new landmark; it places a
// bounded follow-up order on one of the eight existing sites. Surveyed sites
// are preferred so the order is actionable, then known sites, then the site
// nearest the afflicted atlas region. The sort is total and deterministic.
export function armSiteChainFollowUp(choiceId, region = null) {
    const claim = chainClaim(choiceId);
    if (!claim || !state.hasStarted) return null;
    const expeditions = ensureExpeditions();
    const eligible = expeditions.sites.filter(site => Number(site.chainStage) < 2);
    if (!eligible.length) return null;
    const rx = Number(region?.x), ry = Number(region?.y);
    const hasRegion = Number.isFinite(rx) && Number.isFinite(ry);
    const regionDistance = site => hasRegion
        ? Math.hypot(Number(site.x) - rx, Number(site.y) - ry)
        : Math.max(0, Number(site.distance) || 0);
    eligible.sort((a, b) => {
        const stageDelta = Number(b.chainStage) - Number(a.chainStage);
        if (stageDelta) return stageDelta;
        const knownDelta = Number(Boolean(b.known || b.cleared)) - Number(Boolean(a.known || a.cleared));
        if (knownDelta) return knownDelta;
        const distanceDelta = regionDistance(a) - regionDistance(b);
        if (Math.abs(distanceDelta) > 0.001) return distanceDelta;
        const marchDelta = Number(a.distance) - Number(b.distance);
        if (Math.abs(marchDelta) > 0.001) return marchDelta;
        return String(a.id).localeCompare(String(b.id));
    });
    const site = eligible[0];
    const chain = SITE_CHAINS[site.type]?.[claim];
    if (!chain) return null;
    site.chainStage = 2;
    site.claim = claim;
    pushSiteNote(site, chain.opening);
    notifyExpeditionChange();
    return {
        siteId: site.id,
        siteName: site.name,
        region: site.region,
        claim,
        claimLabel: chain.label,
        chainTitle: SITE_CHAINS[site.type].title
    };
}

export function updateExpeditions() {
    if (!state.hasStarted) return null;
    const expeditions = ensureExpeditions();
    const active = expeditions.active;
    if (!active) return null;
    const site = siteAt(expeditions.sites, active.siteId);
    if (!site) {
        expeditions.active = null;
        return null;
    }
    const leader = state.entities.find(entity => !entity.dead && String(entity.personId || entity.id) === active.leaderId);
    if (!leader) {
        expeditions.active = null;
        addLog("A ROYAL EXPEDITION WAS LOST ON THE ROAD TO " + site.name.toUpperCase(), "#b99a9a", "exploration");
        return null;
    }
    const tick = Number(state.tick) || 0;
    if (tick >= active.returnTick) {
        const outcome = finishExpedition(expeditions, active, site);
        expeditions.lastUpdateTick = tick;
        return outcome;
    }
    if (tick >= active.arriveTick && active.phase !== "returning") {
        active.phase = "returning";
        active.outcome = resolveOutcome(active, site, ensurePersonProfile(leader));
        site.known = true;
        revealArea(site.x, site.y, 6);
        addLog("THE EXPEDITION REACHES " + site.name.toUpperCase() + " · " + active.outcome.title.toUpperCase(), "#c5a66b", "exploration");
        notifyExpeditionChange();
    }
    expeditions.lastUpdateTick = tick;
    return null;
}

export function validateExpeditionsState(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expedition state must be an object.");
    if (!Array.isArray(input.sites) || input.sites.length > MAX_SITES) throw new Error("Expedition site list is invalid.");
    if (!Array.isArray(input.history) || input.history.length > MAX_HISTORY) throw new Error("Expedition history is invalid.");
    if (!Array.isArray(input.lore) || input.lore.length > MAX_LORE) throw new Error("Expedition lore is invalid.");
    if (input.active !== null && input.active !== undefined
        && (typeof input.active !== "object" || Array.isArray(input.active))) throw new Error("Active expedition is invalid.");
    for (const site of input.sites) {
        if (!site || typeof site !== "object" || !SITE_BY_ID.has(String(site.type || ""))) throw new Error("Expedition site is invalid.");
        if (!Number.isFinite(Number(site.x)) || !Number.isFinite(Number(site.y))) throw new Error("Expedition site coordinates are invalid.");
        const stage = site.chainStage === undefined ? 0 : Number(site.chainStage);
        if (!Number.isInteger(stage) || stage < 0 || stage > 3) throw new Error("Expedition follow-up stage is invalid.");
        const claim = site.claim == null ? null : chainClaim(site.claim);
        if (site.claim != null && !claim) throw new Error("Expedition follow-up claim is invalid.");
        if (stage >= 2 && !claim) throw new Error("Expedition follow-up order is missing.");
        if (stage < 2 && claim) throw new Error("Expedition follow-up claim has no open order.");
        const notes = site.notes === undefined ? [] : site.notes;
        if (!Array.isArray(notes) || notes.length > MAX_SITE_NOTES
            || notes.some(note => typeof note !== "string" || note.length > MAX_SITE_NOTE_CHARS)) {
            throw new Error("Expedition follow-up notes are invalid.");
        }
    }
    return true;
}
