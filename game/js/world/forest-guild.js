// Static catalogue for the Forest Guild commission board. The board is the
// long-running consumer that turns the twenty finished forest-industry goods
// into recurring play: patrons rotate forever, but every order is drawn from a
// fixed, save-safe catalogue and a deterministic stream.
import { INDUSTRY_GOODS } from "./forest-industries.js";

const freeze = value => Object.freeze(value);

export const FOREST_GUILD_VERSION = 1;
export const FOREST_GUILD_ACTIVE_LIMIT = 3;
export const FOREST_GUILD_HISTORY_LIMIT = 12;

// Ten renown tiers. Thresholds are deliberately far apart: a campaign can
// always earn another commission, and every tier permanently improves the
// standing price of forest goods at the exchange.
export const FOREST_GUILD_TIERS = freeze([
    freeze({ tier: 1, renown: 0, title: "Harbour Factor", patronSlots: 3, premium: 0 }),
    freeze({ tier: 2, renown: 20, title: "Merchant Factor", patronSlots: 3, premium: 0.02 }),
    freeze({ tier: 3, renown: 48, title: "Guild Factor", patronSlots: 3, premium: 0.04 }),
    freeze({ tier: 4, renown: 86, title: "Guild Master", patronSlots: 3, premium: 0.06 }),
    freeze({ tier: 5, renown: 140, title: "Grand Master", patronSlots: 3, premium: 0.08 }),
    freeze({ tier: 6, renown: 210, title: "Trade Magnate", patronSlots: 3, premium: 0.10 }),
    freeze({ tier: 7, renown: 300, title: "Forest Lord", patronSlots: 3, premium: 0.12 }),
    freeze({ tier: 8, renown: 420, title: "Crown Purveyor", patronSlots: 3, premium: 0.14 }),
    freeze({ tier: 9, renown: 570, title: "Lord of the Wood", patronSlots: 3, premium: 0.16 }),
    freeze({ tier: 10, renown: 760, title: "Eternal Patron", patronSlots: 3, premium: 0.18 }),
]);

// Fourteen patrons cover every one of the twenty goods. `minTier` gates the
// exotic patrons, so early boards stay achievable while late boards open the
// tropical and luxury chains. `faction` is the political group that notices a
// delivery; the guild itself always gains a little standing.
export const FOREST_GUILD_PATRONS = freeze([
    freeze({
        id: "goldsmiths", name: "Worshipful Company of Goldsmiths", seal: "AU",
        faction: "guilds", minTier: 1, goods: freeze(["charcoal", "potash"]),
        order: "Furnace fuel and cleansing ash", story: "The assayers need a clean, hot fire and potash for the washing vats.",
    }),
    freeze({
        id: "forest-wardens", name: "Wardens of the Green March", seal: "WM",
        faction: "commons", minTier: 1, goods: freeze(["charcoal", "bowStaves", "tannin"]),
        order: "Ranger stores for the green march", story: "A march without charcoal, bow staves and tannin cannot hold its lodges through winter.",
    }),
    freeze({
        id: "fishmongers", name: "Company of River Fishmongers", seal: "RF",
        faction: "commons", minTier: 1, goods: freeze(["smokedFish", "preserves", "palmOil"]),
        order: "Keepable rations for the river fleet", story: "Smoked fish and preserved fruit let the river crews work beyond the last safe landing.",
    }),
    freeze({
        id: "apothecaries", name: "Guild of Apothecaries", seal: "AP",
        faction: "guilds", minTier: 2, goods: freeze(["medicine", "tannin", "dye"]),
        order: "Physic, mordant and tincture", story: "The city's healers will pay for reliable medicine before the first fever of spring.",
    }),
    freeze({
        id: "crown-navy", name: "Crown Navy Board", seal: "CN",
        faction: "nobility", minTier: 2, goods: freeze(["shipTimber", "pitch", "tar"]),
        order: "Naval stores for the fleet", story: "Keels, seams and rigging consume timber, pitch and tar faster than any dockyard can explain.",
    }),
    freeze({
        id: "archery-guild", name: "Royal Archery Guild", seal: "RA",
        faction: "guilds", minTier: 2, goods: freeze(["bowStaves", "pitch"]),
        order: "Staves and bowyer's stores", story: "Every war bow begins as a straight stave and ends with pitch-dark linen and beeswax.",
    }),
    freeze({
        id: "papermakers", name: "Mill of the Long Fibre", seal: "LF",
        faction: "guilds", minTier: 2, goods: freeze(["paper", "tannin"]),
        order: "Rag, bark and clean water", story: "The chancery has ordered another year of records before the old ledger is full.",
    }),
    freeze({
        id: "great-household", name: "Steward of the Great Household", seal: "GH",
        faction: "nobility", minTier: 2, goods: freeze(["furniture", "preserves", "palmOil"]),
        order: "Furnishing a noble house", story: "A wedding, a new wing and a long winter all arrive in the same season.",
    }),
    freeze({
        id: "border-fortress", name: "Warden of the Border Fortress", seal: "BF",
        faction: "nobility", minTier: 2, goods: freeze(["bowStaves", "charcoal", "preserves"]),
        order: "Winter stores for the border", story: "The fortress cannot eat its arrows, but it can eat preserved fruit while the bowyers work.",
    }),
    freeze({
        id: "cathedral", name: "Chapter of the Cathedral", seal: "CC",
        faction: "clergy", minTier: 3, goods: freeze(["medicine", "paper", "dye"]),
        order: "A house of healing and record", story: "The chapter is copying its herbals, dyeing its hangings and opening a infirmary in the same year.",
    }),
    freeze({
        id: "temple", name: "Temple of the Quiet Grove", seal: "QG",
        faction: "clergy", minTier: 3, goods: freeze(["medicine", "paper", "cork"]),
        order: "Offerings for the quiet grove", story: "Pilgrims bring their illnesses, their petitions and their empty stoppers to the same door.",
    }),
    freeze({
        id: "shipwrights", name: "Fellowship of Shipwrights", seal: "SW",
        faction: "guilds", minTier: 3, goods: freeze(["shipTimber", "pitch", "tar", "rubber"]),
        order: "A hull that will outlive its captain", story: "Long straight oak, black pitch and a little tropical rubber seal a hull against the western swell.",
    }),
    freeze({
        id: "merchant-company", name: "Company of Far Merchants", seal: "FM",
        faction: "guilds", minTier: 3, goods: freeze(["spices", "silk", "rubber"]),
        order: "A caravan of rare goods", story: "The caravan master wants goods that survive the road and still smell of somewhere else.",
    }),
    freeze({
        id: "explorers", name: "Society of Woodland Explorers", seal: "WE",
        faction: "nobility", minTier: 3, goods: freeze(["rubber", "bambooFibre", "palmFrond", "spices"]),
        order: "Field kit for the deep interior", story: "Light frames, waterproof capes and a little spice make a season in the interior survivable.",
    }),
    freeze({
        id: "vintners", name: "Vintners' Company", seal: "VC",
        faction: "commons", minTier: 3, goods: freeze(["cork", "preserves"]),
        order: "Stoppers, casks and preserved fruit", story: "The vintage waits for no guild, and every cask needs a stopper before the first frost.",
    }),
    freeze({
        id: "bamboo-builders", name: "Bamboo Builders of the Lower Quarter", seal: "BB",
        faction: "commons", minTier: 3, goods: freeze(["bambooFibre", "palmFrond"]),
        order: "A cheap roof before the rains", story: "The lower quarter needs light frames and thatch now, not a stone house next year.",
    }),
]);

export const FOREST_GUILD_TIER_BY_ID = freeze(Object.fromEntries(FOREST_GUILD_TIERS.map(entry => [entry.tier, entry])));
export const FOREST_GUILD_PATRON_BY_ID = freeze(Object.fromEntries(FOREST_GUILD_PATRONS.map(entry => [entry.id, entry])));

export function forestGuildTierFor(renown = 0) {
    const value = Math.max(0, Number(renown) || 0);
    let found = FOREST_GUILD_TIERS[0];
    for (const entry of FOREST_GUILD_TIERS) if (value >= entry.renown) found = entry;
    return found;
}

export function forestGuildNextTier(renown = 0) {
    const value = Math.max(0, Number(renown) || 0);
    return FOREST_GUILD_TIERS.find(entry => entry.renown > value) || null;
}

export function forestGuildPremiumFor(renown = 0) {
    return forestGuildTierFor(renown).premium;
}

export function forestGuildGoodLabel(good) {
    return INDUSTRY_GOODS[good]?.label || String(good || "goods");
}
