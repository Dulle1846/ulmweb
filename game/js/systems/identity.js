// Realm identity: the name, house, title, culture, faith, custom, law and
// founding charter chosen at the start. Identity is presentation plus a small,
// explicit modifier block; it never replaces the simulation state that the
// other systems own.
import { state } from "../core/state.js";

export const IDENTITY_VERSION = 2;
const EFFECT_KEYS = Object.freeze(["food", "tax", "trade", "research", "military", "legitimacy", "mortality"]);
const RESOURCE_KEYS = Object.freeze(["wood", "stone", "gold", "food"]);
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const round = value => Math.round((Number(value) || 0) * 10000) / 10000;
const text = (value, max, fallback) => {
    const clean = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
    return clean || fallback;
};

// The default choices deliberately carry no extra modifier. This keeps old
// saves and the deterministic campaign stable while every alternative is a
// real choice rather than a cosmetic label.
export const CULTURES = Object.freeze({
    frontier: Object.freeze({
        label: "Frontier",
        description: "Hardy settlers, generous fields and a practical distrust of ceremony.",
        food: 0.06, tax: 0, trade: 0, research: 0, military: 0.03, legitimacy: 0, mortality: 0
    }),
    mercantile: Object.freeze({
        label: "Mercantile",
        description: "A counting-house culture. Roads, contracts and foreign coin come first.",
        food: 0, tax: 0.02, trade: 0.07, research: 0.02, military: 0, legitimacy: 0, mortality: 0
    }),
    scholarly: Object.freeze({
        label: "Scholarly",
        description: "Archives, schools and patient inquiry raise the value of every discovery.",
        food: 0, tax: 0, trade: 0.01, research: 0.14, military: 0, legitimacy: 0.02, mortality: 0.01
    }),
    martial: Object.freeze({
        label: "Martial",
        description: "A sword-bearing society. The garrison is respected; the tax collector is not.",
        food: 0.02, tax: -0.02, trade: 0, research: 0, military: 0.12, legitimacy: 0.01, mortality: 0
    }),
    devout: Object.freeze({
        label: "Devout",
        description: "The calendar turns around rites and charity. Legitimacy and comfort follow.",
        food: 0, tax: 0, trade: 0, research: -0.02, military: 0, legitimacy: 0.10, mortality: 0.03
    })
});

export const RELIGIONS = Object.freeze({
    ancestral: Object.freeze({
        label: "Ancestral hearth",
        description: "The inherited rites of the first settlers. No additional modifier.",
        food: 0, tax: 0, trade: 0, research: 0, military: 0, legitimacy: 0, mortality: 0
    }),
    solar: Object.freeze({
        label: "Solar covenant",
        description: "A public calendar of light and harvest; the crown is its guardian.",
        food: 0.02, tax: 0.01, trade: 0, research: 0, military: 0, legitimacy: 0.04, mortality: 0.01
    }),
    harvest: Object.freeze({
        label: "Harvest rite",
        description: "Charity, seed blessings and full granaries bind the people to the land.",
        food: 0.05, tax: 0, trade: 0, research: 0, military: 0, legitimacy: 0.01, mortality: 0.01
    }),
    rational: Object.freeze({
        label: "Rational inquiry",
        description: "The world is a question to be tested, not only a mystery to be sung.",
        food: 0, tax: 0, trade: 0.01, research: 0.08, military: 0, legitimacy: -0.01, mortality: 0.02
    }),
    mystic: Object.freeze({
        label: "Mystic communion",
        description: "Dreams, wells and old stones guide the realm's healers and pilgrims.",
        food: 0, tax: 0, trade: -0.01, research: 0.02, military: 0, legitimacy: 0.03, mortality: 0.03
    })
});

export const TRADITIONS = Object.freeze({
    hearth: Object.freeze({
        label: "Open hearth",
        description: "The customs of the first frontier. No additional modifier.",
        food: 0, tax: 0, trade: 0, research: 0, military: 0, legitimacy: 0, mortality: 0
    }),
    muster: Object.freeze({
        label: "The muster",
        description: "Every household keeps a spear and answers the horn.",
        food: 0, tax: 0.01, trade: -0.01, research: 0, military: 0.06, legitimacy: 0.01, mortality: 0
    }),
    guild: Object.freeze({
        label: "Guild compact",
        description: "Workshops set standards, train apprentices and share the road toll.",
        food: 0, tax: 0.01, trade: 0.05, research: 0.01, military: -0.01, legitimacy: 0, mortality: 0
    }),
    pilgrimage: Object.freeze({
        label: "Pilgrim roads",
        description: "Hostels and safe passage turn travelling strangers into annual income.",
        food: 0, tax: 0, trade: 0.03, research: 0, military: 0, legitimacy: 0.03, mortality: 0.01
    }),
    isolation: Object.freeze({
        label: "Closed borders",
        description: "The realm keeps its own counsel, its own grain and its own weapons.",
        food: 0.02, tax: 0.03, trade: -0.05, research: -0.01, military: 0.04, legitimacy: 0.01, mortality: 0
    })
});

export const LEGAL_TRADITIONS = Object.freeze({
    customary: Object.freeze({
        label: "Customary law",
        description: "The remembered customs of the first settlers. No additional modifier.",
        food: 0, tax: 0, trade: 0, research: 0, military: 0, legitimacy: 0, mortality: 0
    }),
    royal: Object.freeze({
        label: "Royal code",
        description: "A single written authority, clear taxes and a standing garrison.",
        food: 0, tax: 0.03, trade: -0.01, research: 0, military: 0.02, legitimacy: -0.01, mortality: 0
    }),
    common: Object.freeze({
        label: "Common law",
        description: "Local courts and remembered precedent protect the household.",
        food: 0, tax: -0.01, trade: 0.02, research: 0, military: 0, legitimacy: 0.04, mortality: 0.01
    }),
    guild: Object.freeze({
        label: "Guild law",
        description: "Commercial courts, inspected measures and enforceable contracts.",
        food: 0, tax: 0.01, trade: 0.05, research: 0, military: -0.01, legitimacy: 0, mortality: 0
    }),
    sacred: Object.freeze({
        label: "Sacred law",
        description: "The altar and the court share one book and one oath.",
        food: 0, tax: 0.01, trade: 0, research: -0.02, military: 0, legitimacy: 0.05, mortality: 0.01
    })
});

export const LEGITIMACY_DOCTRINES = Object.freeze({
    lineage: Object.freeze({
        label: "Lineage",
        description: "The founding house claims continuity. No additional modifier.",
        food: 0, tax: 0, trade: 0, research: 0, military: 0, legitimacy: 0, mortality: 0
    }),
    divine: Object.freeze({
        label: "Divine right",
        description: "The crown answers to the sacred order before it answers to the council.",
        food: 0, tax: 0.01, trade: 0, research: -0.01, military: 0, legitimacy: 0.05, mortality: 0.01
    }),
    consent: Object.freeze({
        label: "Consent of the governed",
        description: "Taxes and laws are renewed by the assembled households.",
        food: 0, tax: -0.01, trade: 0.02, research: 0.01, military: 0, legitimacy: 0.03, mortality: 0
    }),
    conquest: Object.freeze({
        label: "Right of conquest",
        description: "The realm belongs to those who can hold it.",
        food: 0, tax: 0.02, trade: -0.01, research: 0, military: 0.05, legitimacy: -0.02, mortality: 0
    }),
    prosperity: Object.freeze({
        label: "Prosperity",
        description: "A full store, a paid wage and a growing town justify the crown.",
        food: 0, tax: 0.01, trade: 0.04, research: 0.01, military: 0, legitimacy: 0.02, mortality: 0
    })
});

export const FOUNDING_PROFILES = Object.freeze({
    balanced: Object.freeze({
        label: "Balanced founding",
        description: "The standard stores and a neutral charter. No starting bonus.",
        resources: Object.freeze({}), morale: 0, legitimacy: 0, research: 0
    }),
    frontier: Object.freeze({
        label: "Frontier settlement",
        description: "A little extra timber and food to survive the first winter.",
        resources: Object.freeze({ wood: 25, food: 25 }), morale: 1, legitimacy: 0, research: 0
    }),
    mercantile: Object.freeze({
        label: "Mercantile compact",
        description: "A larger purse and a small reserve of timber for the first market.",
        resources: Object.freeze({ gold: 30, wood: 5 }), morale: 0, legitimacy: 0, research: 0
    }),
    garrison: Object.freeze({
        label: "Garrison march",
        description: "Stone for the wall, coin for the watch and a steadier people.",
        resources: Object.freeze({ stone: 25, gold: 10 }), morale: 2, legitimacy: 0, research: 0
    }),
    sanctuary: Object.freeze({
        label: "Sanctuary",
        description: "Food and coin for the first pilgrims, and a legitimate founding.",
        resources: Object.freeze({ food: 30, gold: 5 }), morale: 0, legitimacy: 2, research: 0
    }),
    scholarly: Object.freeze({
        label: "Scholarly refuge",
        description: "A modest treasury and a reserve of research points for the first archive.",
        resources: Object.freeze({ gold: 15 }), morale: 0, legitimacy: 0, research: 12
    })
});

export const BANNERS = Object.freeze(["gold", "crimson", "forest", "azure", "ivory", "obsidian"]);
export const EMBLEMS = Object.freeze(["crown", "stag", "wolf", "tower", "oak", "dragon"]);

function effectsFor(source = {}) {
    const result = {};
    for (const key of EFFECT_KEYS) result[key] = Number(source?.[key]) || 0;
    return result;
}

function entry(key, map, id) {
    return { key, id, label: map[id]?.label || "", effects: effectsFor(map[id]) };
}

export function createIdentityState(input = {}) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const culture = Object.hasOwn(CULTURES, source.culture) ? source.culture : "frontier";
    const religion = Object.hasOwn(RELIGIONS, source.religion) ? source.religion : "ancestral";
    const tradition = Object.hasOwn(TRADITIONS, source.tradition) ? source.tradition : "hearth";
    const law = Object.hasOwn(LEGAL_TRADITIONS, source.law) ? source.law : "customary";
    const legitimacy = Object.hasOwn(LEGITIMACY_DOCTRINES, source.legitimacy) ? source.legitimacy : "lineage";
    const startProfile = Object.hasOwn(FOUNDING_PROFILES, source.startProfile) ? source.startProfile : "balanced";
    const banner = BANNERS.includes(source.banner) ? source.banner : "gold";
    const emblem = EMBLEMS.includes(source.emblem) ? source.emblem : "crown";
    return {
        version: IDENTITY_VERSION,
        kingdomName: text(source.kingdomName, 32, "New Realm"),
        dynastyName: text(source.dynastyName, 32, "Royal House"),
        rulerTitle: text(source.rulerTitle, 24, "Sovereign"),
        culture,
        religion,
        tradition,
        law,
        legitimacy,
        startProfile,
        background: text(source.background, 280, ""),
        banner,
        emblem,
        motto: text(source.motto, 80, "We keep what we build."),
        foundedYear: Math.max(1, Math.floor(Number(source.foundedYear) || 1))
    };
}

export function normalizeIdentity(input = state.identity) {
    const identity = createIdentityState(input && typeof input === "object" ? input : {
        kingdomName: state.kingdomName,
        dynastyName: state.royal?.dynastyName
    });
    state.identity = identity;
    state.kingdomName = identity.kingdomName;
    return identity;
}

export function validateIdentity(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Identity must be an object.");
    if (typeof input.kingdomName !== "string" || !input.kingdomName.trim() || input.kingdomName.length > 32) throw new Error("Realm name is invalid.");
    if (typeof input.dynastyName !== "string" || !input.dynastyName.trim() || input.dynastyName.length > 32) throw new Error("Dynasty name is invalid.");
    if (!Object.hasOwn(CULTURES, input.culture)) throw new Error("Culture is invalid.");
    if (input.religion !== undefined && !Object.hasOwn(RELIGIONS, input.religion)) throw new Error("Religion is invalid.");
    if (input.tradition !== undefined && !Object.hasOwn(TRADITIONS, input.tradition)) throw new Error("Tradition is invalid.");
    if (input.law !== undefined && !Object.hasOwn(LEGAL_TRADITIONS, input.law)) throw new Error("Legal tradition is invalid.");
    if (input.legitimacy !== undefined && !Object.hasOwn(LEGITIMACY_DOCTRINES, input.legitimacy)) throw new Error("Legitimacy doctrine is invalid.");
    if (input.startProfile !== undefined && !Object.hasOwn(FOUNDING_PROFILES, input.startProfile)) throw new Error("Founding profile is invalid.");
    if (input.background !== undefined && (typeof input.background !== "string" || input.background.length > 280)) throw new Error("Founding background is invalid.");
    if (!BANNERS.includes(input.banner)) throw new Error("Banner colour is invalid.");
    if (!EMBLEMS.includes(input.emblem)) throw new Error("Heraldic emblem is invalid.");
    const year = Number(input.foundedYear);
    if (!Number.isSafeInteger(year) || year < 1) throw new Error("Founding year is invalid.");
    return true;
}

// Pure preview used by the founding screen and by tests. The default choices
// all contribute zero, so a realm that changes nothing behaves exactly as it
// did before this layer existed.
export function getFoundingModifiersFor(input = state.identity) {
    const identity = createIdentityState(input && typeof input === "object" ? input : {});
    const sources = [
        entry("culture", CULTURES, identity.culture),
        entry("religion", RELIGIONS, identity.religion),
        entry("tradition", TRADITIONS, identity.tradition),
        entry("law", LEGAL_TRADITIONS, identity.law),
        entry("legitimacy", LEGITIMACY_DOCTRINES, identity.legitimacy)
    ];
    const totals = Object.fromEntries(EFFECT_KEYS.map(key => [key, 0]));
    for (const source of sources) for (const key of EFFECT_KEYS) totals[key] += source.effects[key];
    return {
        tax: round(totals.tax),
        trade: round(totals.trade),
        research: round(totals.research),
        military: round(totals.military),
        foodDemand: round(-totals.food),
        legitimacy: round(totals.legitimacy),
        mortality: round(totals.mortality),
        sources: Object.fromEntries(sources.map(source => [source.key, { id: source.id, label: source.label, effects: source.effects }]))
    };
}

export function getCultureModifiers() {
    const identity = createIdentityState(state.identity && typeof state.identity === "object" ? state.identity : {});
    const modifiers = getFoundingModifiersFor(identity);
    return {
        id: identity.culture,
        label: CULTURES[identity.culture].label,
        tax: modifiers.tax,
        trade: modifiers.trade,
        research: modifiers.research,
        military: modifiers.military,
        foodDemand: modifiers.foodDemand,
        legitimacy: modifiers.legitimacy,
        mortality: modifiers.mortality,
        sources: modifiers.sources
    };
}

export function applyFoundingProfile(profileId, identity = state.identity) {
    const id = Object.hasOwn(FOUNDING_PROFILES, profileId) ? profileId : "balanced";
    const profile = FOUNDING_PROFILES[id];
    if (identity && typeof identity === "object") identity.startProfile = id;
    if (!state.resources || typeof state.resources !== "object") state.resources = {};
    const granted = {};
    for (const key of RESOURCE_KEYS) {
        const amount = Number(profile.resources?.[key]) || 0;
        if (amount <= 0) continue;
        state.resources[key] = Math.max(0, (Number(state.resources[key]) || 0) + amount);
        granted[key] = amount;
    }
    if (profile.morale) state.morale = clamp((Number(state.morale) || 0) + profile.morale, 0, 100);
    if (profile.legitimacy && state.politics) {
        state.politics.legitimacy = clamp((Number(state.politics.legitimacy) || 0) + profile.legitimacy, 0, 100);
    }
    if (profile.research && state.research && Number.isFinite(Number(state.research.reserve))) {
        state.research.reserve = Math.max(0, Number(state.research.reserve) + profile.research);
    }
    return {
        ok: true,
        id,
        profile,
        resources: granted,
        morale: Number(profile.morale) || 0,
        legitimacy: Number(profile.legitimacy) || 0,
        research: Number(profile.research) || 0
    };
}

export function getIdentitySnapshot() {
    const identity = normalizeIdentity();
    const modifiers = getFoundingModifiersFor(identity);
    return {
        ...identity,
        cultureDetails: CULTURES[identity.culture],
        religionDetails: RELIGIONS[identity.religion],
        traditionDetails: TRADITIONS[identity.tradition],
        lawDetails: LEGAL_TRADITIONS[identity.law],
        legitimacyDetails: LEGITIMACY_DOCTRINES[identity.legitimacy],
        foundingDetails: FOUNDING_PROFILES[identity.startProfile],
        modifiers,
        cultures: Object.entries(CULTURES).map(([id, value]) => ({ id, ...value })),
        religions: Object.entries(RELIGIONS).map(([id, value]) => ({ id, ...value })),
        traditions: Object.entries(TRADITIONS).map(([id, value]) => ({ id, ...value })),
        laws: Object.entries(LEGAL_TRADITIONS).map(([id, value]) => ({ id, ...value })),
        legitimacyDoctrines: Object.entries(LEGITIMACY_DOCTRINES).map(([id, value]) => ({ id, ...value })),
        profiles: Object.entries(FOUNDING_PROFILES).map(([id, value]) => ({ id, ...value }))
    };
}

export function getHeraldryLabel() {
    const identity = normalizeIdentity();
    return identity.emblem.toUpperCase() + " ON " + identity.banner.toUpperCase();
}
