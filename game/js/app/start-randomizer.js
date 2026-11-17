// Start-screen randomizer. It only chooses values for the existing founding
// form; the normal start path still owns world generation, profiles and saves.
import {
    CULTURES, RELIGIONS, TRADITIONS, LEGAL_TRADITIONS,
    LEGITIMACY_DOCTRINES, FOUNDING_PROFILES, BANNERS, EMBLEMS
} from "../systems/identity.js";
import { GOVERNMENT_FORMS } from "../systems/government.js";
import { WORLD_SIZES, WORLD_SHAPES, CLIMATES, normalizeWorldOptions } from "../world/terrain-model.js";

const REALM_NAMES = Object.freeze([
    "Alderwatch", "Amberfall", "Ashford", "Briarhold", "Cinderreach", "Dawnmere",
    "Dunmarch", "Eastwatch", "Eldermoor", "Emberfall", "Frosthollow", "Goldengrove",
    "Greyharbor", "Highreach", "Ironwood", "Kingsmere", "Larkvale", "Mistfall",
    "Moonharbor", "Northwatch", "Oakenshield", "Ravenhall", "Redwater", "Silverbrook",
    "Stonehaven", "Stormcrag", "Thornvale", "Westmarch", "Whitecliff", "Willowmere"
]);
const HOUSE_NAMES = Object.freeze([
    "Ashborne", "Blackwood", "Brightwater", "Cinderfall", "Dawnstrider", "Elderwood",
    "Frostborne", "Greyvale", "Halloway", "Ironheart", "Larkspur", "Mistwood",
    "Nightfall", "Oakhaven", "Ravencrest", "Riverstone", "Stormward", "Thornbury",
    "Valeheart", "Winterbourne"
]);
const PLAYER_NAMES = Object.freeze([
    "Alden", "Briar", "Cedric", "Dalia", "Edric", "Freya", "Gareth", "Helena",
    "Ivo", "Jessa", "Kael", "Liora", "Mira", "Nolan", "Orla", "Perrin", "Quinn",
    "Rowan", "Sera", "Tamsin", "Ulric", "Vesna", "Wren", "Yara"
]);
const PLAYER_SURNAMES = Object.freeze([
    "Ashdown", "Bellweather", "Carrow", "Dunmore", "Everly", "Fairwind", "Greymark",
    "Holloway", "Ironside", "Juniper", "Kestrel", "Larksong", "Morrow", "Northwood",
    "Oakley", "Pinecrest", "Quarry", "Redfern", "Stonebrook", "Thistlewood"
]);
const RULER_TITLES = Object.freeze([
    "Sovereign", "High King", "High Queen", "Warden", "Margrave", "Archon",
    "Prince", "Princess", "Lord Protector", "Lady Protector", "Steward", "Crowned Councilor"
]);
const FOUNDING_CHRONICLES = Object.freeze([
    "An old road ended here; the first settlers stayed because the river did.",
    "A sworn company of frontiersmen raised a hall above the floodplain.",
    "The house fled a broken kingdom and founded a new one beyond the pass.",
    "A market charter and a granary full of seed grain began the realm.",
    "Pilgrims followed a falling star and built their first shrine where it came to rest.",
    "Three feuding families buried their quarrel under one crown.",
    "A garrison was left behind at the edge of an abandoned empire.",
    "The old stones were already standing when the first settlers arrived."
]);
const SIZE_WEIGHTS = Object.freeze([
    ["compact", 4], ["standard", 5], ["grand", 3], ["vast", 2],
    ["huge", 1], ["gigantic", 1], ["colossal", 1]
]);
const SLIDER_MIN = 25;
const SLIDER_MAX = 80;

const unit = random => {
    const value = Number(random());
    return Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0;
};

function pick(random, values) {
    const list = Array.from(values);
    return list[Math.floor(unit(random) * list.length)] || list[0];
}

function weightedPick(random, entries) {
    const total = entries.reduce((sum, entry) => sum + entry[1], 0);
    let target = unit(random) * total;
    for (const [id, weight] of entries) {
        target -= weight;
        if (target < 0) return id;
    }
    return entries[entries.length - 1][0];
}

function slider(random) {
    return SLIDER_MIN + Math.floor(unit(random) * (SLIDER_MAX - SLIDER_MIN + 1));
}

export function buildRandomStart({ random = Math.random, seed = null, playerName = "" } = {}) {
    const requestedSeed = Number(seed);
    const chosenSeed = Number.isSafeInteger(requestedSeed) && requestedSeed > 0
        ? requestedSeed
        : Math.floor(unit(random) * 2_147_483_000) + 1;
    const typedName = String(playerName ?? "").trim().slice(0, 32);
    const generatedName = `${pick(random, PLAYER_NAMES)} ${pick(random, PLAYER_SURNAMES)}`;
    const identity = {
        kingdomName: pick(random, REALM_NAMES),
        dynastyName: `House ${pick(random, HOUSE_NAMES)}`,
        rulerTitle: pick(random, RULER_TITLES),
        culture: pick(random, Object.keys(CULTURES)),
        religion: pick(random, Object.keys(RELIGIONS)),
        tradition: pick(random, Object.keys(TRADITIONS)),
        law: pick(random, Object.keys(LEGAL_TRADITIONS)),
        legitimacy: pick(random, Object.keys(LEGITIMACY_DOCTRINES)),
        startProfile: pick(random, Object.keys(FOUNDING_PROFILES)),
        background: pick(random, FOUNDING_CHRONICLES),
        banner: pick(random, BANNERS),
        emblem: pick(random, EMBLEMS)
    };
    const government = pick(random, Object.keys(GOVERNMENT_FORMS));
    const worldOptions = normalizeWorldOptions({
        size: weightedPick(random, SIZE_WEIGHTS),
        shape: pick(random, WORLD_SHAPES.map(shape => shape.id)),
        climate: pick(random, CLIMATES.map(climate => climate.id)),
        landmass: slider(random),
        ruggedness: slider(random),
        forests: slider(random),
        water: slider(random),
        fertility: slider(random),
        resources: slider(random),
        mountains: slider(random),
        rivers: slider(random),
        lakes: slider(random),
        coastline: slider(random),
        snow: slider(random),
        wetlands: slider(random),
        aridity: slider(random)
    });
    if (!Object.hasOwn(WORLD_SIZES, worldOptions.size)) {
        worldOptions.size = "standard";
    }
    return {
        seed: chosenSeed,
        playerName: typedName || generatedName,
        identity,
        government,
        worldOptions,
        endless: unit(random) < 0.8
    };
}
