// Single source of truth for the management deck.
//
// The tab bar and the narrow panel selector are rendered from this list, and
// browser audits import it instead of carrying a count that rots whenever a
// panel is added. Keep labels user-facing and icon names tied to
// assets/command-emblems.svg.
export const MANAGEMENT_TABS = Object.freeze([
    Object.freeze({ id: "kingdom", label: "REALM", icon: "crown" }),
    Object.freeze({ id: "population", label: "PEOPLE", icon: "people" }),
    Object.freeze({ id: "government", label: "GOVERNMENT", icon: "crown" }),
    Object.freeze({ id: "politics", label: "POLITICS", icon: "scales" }),
    Object.freeze({ id: "nobility", label: "NOBILITY", icon: "crown" }),
    Object.freeze({ id: "diplomacy", label: "DIPLOMACY", icon: "scales" }),
    Object.freeze({ id: "worldmap", label: "WORLD", icon: "crown" }),
    Object.freeze({ id: "espionage", label: "WHISPERS", icon: "seal" }),
    Object.freeze({ id: "explore", label: "EXPLORE", icon: "book" }),
    Object.freeze({ id: "biome", label: "BIOMES", icon: "crown" }),
    Object.freeze({ id: "forest", label: "FORESTS", icon: "book" }),
    Object.freeze({ id: "hazards", label: "HAZARDS", icon: "scales" }),
    Object.freeze({ id: "decisions", label: "DECISIONS", icon: "seal" }),
    Object.freeze({ id: "cards", label: "CARDS", icon: "cards" }),
    Object.freeze({ id: "economy", label: "ECONOMY", icon: "coins" }),
    Object.freeze({ id: "resources", label: "STORES", icon: "coins" }),
    Object.freeze({ id: "buildings", label: "BUILDINGS", icon: "seal" }),
    Object.freeze({ id: "city", label: "CITY", icon: "crown" }),
    Object.freeze({ id: "items", label: "LEXICON", icon: "book" }),
    Object.freeze({ id: "military", label: "MILITARY", icon: "seal" }),
    Object.freeze({ id: "health", label: "HEALTH", icon: "book" }),
    Object.freeze({ id: "faith", label: "FAITH", icon: "book" }),
    Object.freeze({ id: "justice", label: "JUSTICE", icon: "scales" }),
    Object.freeze({ id: "research", label: "RESEARCH", icon: "book" }),
    Object.freeze({ id: "endeavours", label: "ENDEAVOURS", icon: "crown" }),
    Object.freeze({ id: "dynasty", label: "DYNASTY", icon: "book" }),
    Object.freeze({ id: "creatures", label: "CREATURES", icon: "dragon" }),
    Object.freeze({ id: "atelier", label: "ATELIER", icon: "book" }),
    Object.freeze({ id: "chronicle", label: "CHRONICLE", icon: "book" })
]);
