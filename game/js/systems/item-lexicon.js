// The realm's material memory. Base items are assembled from the authoritative
// resource, workshop, furniture and ecology tables; crafted items are stable,
// deterministic records written by future forges, workshops and scriptoria.
import { RESOURCE_KEYS } from "./resources.js";
import { GOODS } from "./city-config.js";
import { FURNITURE_ITEM_IDS, FURNITURE_COSTS, FURNITURE_UPKEEP } from "./furniture.js";
import { FOREST_GOODS } from "../world/forest-ecology.js";
import { TROPICAL_GOODS } from "../world/tropical-ecology.js";
import { SAVANNA_GOODS } from "../world/savanna-ecology.js";
import { TAIGA_GOODS } from "../world/taiga-ecology.js";

export const MAX_CRAFTED_ITEMS = 500;
const MAX_MATERIALS = 8;
const MAX_NAME = 80;
const MAX_TEXT = 420;

export const ITEM_CATEGORIES = Object.freeze([
    Object.freeze({ id: "all", label: "All items" }),
    Object.freeze({ id: "crafted", label: "Player-made" }),
    Object.freeze({ id: "resource", label: "Crown resources" }),
    Object.freeze({ id: "material", label: "Workshop materials" }),
    Object.freeze({ id: "metal", label: "Metals" }),
    Object.freeze({ id: "food", label: "Food" }),
    Object.freeze({ id: "drink", label: "Drink" }),
    Object.freeze({ id: "fuel", label: "Fuel" }),
    Object.freeze({ id: "timber", label: "Timber" }),
    Object.freeze({ id: "forage", label: "Foraged" }),
    Object.freeze({ id: "mast", label: "Mast & nuts" }),
    Object.freeze({ id: "game", label: "Game & hides" }),
    Object.freeze({ id: "medicine", label: "Physic" }),
    Object.freeze({ id: "luxury", label: "Luxuries" }),
    Object.freeze({ id: "poison", label: "Poisons" }),
    Object.freeze({ id: "fibre", label: "Fibres" }),
    Object.freeze({ id: "resin", label: "Resins" }),
    Object.freeze({ id: "furnishing", label: "Furnishings" }),
    Object.freeze({ id: "weapon", label: "Weapons" }),
    Object.freeze({ id: "armour", label: "Armour" }),
    Object.freeze({ id: "tool", label: "Tools" }),
    Object.freeze({ id: "book", label: "Books" }),
    Object.freeze({ id: "jewellery", label: "Jewellery" }),
    Object.freeze({ id: "relic", label: "Relics" }),
]);

export const ITEM_CATEGORY_LABELS = Object.freeze(Object.fromEntries(
    ITEM_CATEGORIES.map(entry => [entry.id, entry.label])
));

const FOREST_CATEGORY_IDS = Object.freeze({
    wood: "timber",
    gather: "forage",
    mast: "mast",
    hunt: "game",
    medicine: "medicine",
    luxury: "luxury",
    poison: "poison",
    fibre: "fibre",
    resin: "resin",
});

const FOREST_CATEGORY_NOTES = Object.freeze({
    wood: "Felled and seasoned in managed woodland. Species, age and the wood ledger decide what the realm can actually draw from the forest.",
    gather: "Collected from the forest floor, understorey and flowering edge in its own season. Gathering leaves the standing crop in place.",
    mast: "Mast and nuts fall in autumn. They feed households, forage pigs and can be carried to the royal stores.",
    hunt: "Taken by named hunters and foresters. Raw carcasses and hides can be processed into preserved goods before delivery.",
    medicine: "A physic ingredient with a real potency. Herbalists draw on it when fever or sickness spreads through the realm.",
    luxury: "A rare forest product valued by merchants, courts and distant buyers rather than by the ordinary household.",
    poison: "A dangerous forest product. It has a legitimate use in hunting and medicine but must be handled with care.",
    fibre: "A flexible plant fibre used for cordage, baskets, cloth and binding without a second resource ledger.",
    resin: "A tapped or gathered resin used by workshops for waterproofing, light, medicine and trade.",
});

const GOODS_ITEM_META = Object.freeze({
    logs: { category: "material", note: "Rough felled timber delivered to yards and saw pits." },
    planks: { category: "material", note: "Sawn boards for construction, furniture and repairs." },
    stoneBlocks: { category: "material", note: "Dressed blocks for walls, foundations and civic works." },
    cutStone: { category: "material", note: "Shaped stone for thresholds, statues and fine masonry." },
    grain: { category: "food", note: "Threshed grain held against the next household settlement." },
    flour: { category: "food", note: "Milled grain, ready for the bakeries and the bread ledger." },
    bread: { category: "food", note: "Baked loaves distributed to households, garrisons and the court." },
    water: { category: "drink", note: "Clean water carried from wells, cisterns and the waterworks." },
    firewood: { category: "fuel", note: "Split fuel for hearths, kitchens and winter shelter; managed woodland is the main source." },
    ale: { category: "drink", note: "Brewed ale sold in the market and served at festivals." },
});

const RESOURCE_ITEM_META = Object.freeze({
    wood: { label: "Wood", note: "The crown's general timber reserve, counted in the four royal resource stores." },
    stone: { label: "Stone", note: "The crown's general stone reserve, spent on construction and civic works." },
    gold: { label: "Gold", note: "The crown's coin and bullion reserve, used for wages, markets and diplomacy." },
    food: { label: "Food", note: "The crown's general food reserve, drawn down by households and garrisons." },
});

const IMPORTED_METALS = Object.freeze([
    Object.freeze({ id: "iron", label: "Iron", note: "Bar iron bought from travelling smiths and the market. Smiths work it into tools, arms and fittings." }),
    Object.freeze({ id: "steel", label: "Steel", note: "Hardened iron stock reserved for edged weapons, armour and the best tools." }),
    Object.freeze({ id: "copper", label: "Copper", note: "Soft, workable metal used for vessels, wire, fittings and ornament." }),
    Object.freeze({ id: "bronze", label: "Bronze", note: "Copper and tin alloyed for cast fittings, bells and durable ornament." }),
    Object.freeze({ id: "silver", label: "Silver", note: "Precious metal for tableware, seals, jewellery and gifts between courts." }),
]);

const FURNITURE_DETAILS = Object.freeze({
    bed: ["Bed", "A frame, mattress and bedding for a named resident. Beds carry the strongest household affinity."],
    table: ["Table", "A work and dining surface for a room's household or office."],
    chair: ["Chair", "A seat for a courtier, scholar, diner or household member."],
    shelf: ["Shelf", "Storage and display for records, vessels and the room's working stock."],
    hearth: ["Hearth", "A stone fireplace that keeps a room warm and anchors its common life."],
    rug: ["Rug", "A woven floor covering that softens a chamber and signals its standing."],
    statue: ["Statue", "A carved figure for a hall, shrine or throne room; the most prestigious furnishing."],
    candle: ["Candle", "A small light for late work, worship and evening rooms."],
});

function freezeItem(item) {
    return Object.freeze({
        ...item,
        tags: Object.freeze(item.tags || []),
        recipe: item.recipe ? Object.freeze(item.recipe) : null,
        materials: Object.freeze(item.materials || []),
    });
}

function titleCase(value) {
    return String(value || "")
        .split(/[\s-]+/)
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

function humanizeId(id) {
    return titleCase(String(id || "").replace(/-timber$/, "").replaceAll("-", " "));
}

function buildBaseItems() {
    const items = [];
    const seen = new Set();

    for (const id of RESOURCE_KEYS) {
        const meta = RESOURCE_ITEM_META[id];
        if (!meta) continue;
        const itemId = "base:resource:" + id;
        seen.add(id);
        items.push(freezeItem({
            id: itemId, origin: "base", kind: "resource", category: "resource",
            label: meta.label, source: "Royal stores",
            summary: meta.note,
            detail: "One of the four balances shown in the crown's stores. It is a live realm-wide reserve, not a stock held by a single building.",
            tags: ["crown", "stored", "realm balance"],
            availability: "Always counted",
            recipe: null,
        }));
    }

    for (const [id, good] of Object.entries(GOODS)) {
        const meta = GOODS_ITEM_META[id] || { category: "material", note: "A physical good moved through the realm's warehouses." };
        seen.add(id);
        items.push(freezeItem({
            id: "base:good:" + id, origin: "base", kind: "good", category: meta.category,
            label: good.label, source: meta.category === "food" ? "Farms, mills & bakeries"
                : meta.category === "drink" ? "Wells, breweries & markets"
                    : meta.category === "fuel" ? "Managed woodland & yards"
                        : "Workshops, yards & warehouses",
            summary: meta.note,
            detail: "A physical warehouse good with a real producer and consumer. It moves between buildings rather than appearing as a realm-wide resource.",
            tags: ["warehouse", "physical good", id],
            availability: "Produced and stored",
            recipe: null,
        }));
    }

    for (const metal of IMPORTED_METALS) {
        const itemId = "base:metal:" + metal.id;
        if (seen.has(metal.id)) continue;
        seen.add(metal.id);
        items.push(freezeItem({
            id: itemId, origin: "base", kind: "material", category: "metal",
            label: metal.label, source: "Market imports & smithies",
            summary: metal.note,
            detail: "Metal is bought as workshop stock rather than counted in the four crown resource reserves. Its presence in the lexicon does not create a live stockpile.",
            tags: ["metal", "smith", "imported", metal.id],
            availability: "Bought when a workshop needs it",
            recipe: null,
        }));
    }

    for (const id of FURNITURE_ITEM_IDS) {
        const details = FURNITURE_DETAILS[id] || [titleCase(id), "A furnishing for a working room."];
        const cost = FURNITURE_COSTS[id] || {};
        const upkeep = Number(FURNITURE_UPKEEP[id]) || 0;
        const recipe = Object.entries(cost).map(([resource, amount]) => ({
            id: "base:resource:" + resource, label: titleCase(resource), amount: Number(amount) || 0,
        }));
        items.push(freezeItem({
            id: "base:furnishing:" + id, origin: "base", kind: "furnishing", category: "furnishing",
            label: details[0], source: "Furniture workshop",
            summary: details[1],
            detail: "Furniture is assigned to a room and contributes to that room's live bonus. It is bought from the workshop and charged upkeep every economic settlement.",
            tags: ["furniture", "room bonus", id],
            availability: "Crafted on commission",
            recipe,
            upkeep,
        }));
    }

    const tropicalIds = new Set(Object.keys(TROPICAL_GOODS));
    const savannaIds = new Set(Object.keys(SAVANNA_GOODS));
    const taigaIds = new Set(Object.keys(TAIGA_GOODS));
    for (const good of Object.values(FOREST_GOODS)) {
        if (!good || seen.has(good.id)) continue;
        seen.add(good.id);
        const category = FOREST_CATEGORY_IDS[good.category] || "forage";
        const tropical = tropicalIds.has(good.id);
        const savanna = savannaIds.has(good.id);
        const taiga = taigaIds.has(good.id);
        const zone = tropical ? "Tropical forests" : savanna ? "Savanna and open woodland"
            : taiga ? "Boreal taiga and forest lakes" : "Temperate forests";
        const processed = Boolean(good.processed);
        items.push(freezeItem({
            id: "base:forest:" + good.id, origin: tropical ? "tropical" : savanna ? "savanna" : taiga ? "taiga" : "forest", kind: "good", category,
            label: good.label, source: zone + (processed ? " · processed" : " · seasonal gathering"),
            summary: FOREST_CATEGORY_NOTES[good.category] || "An ecological product gathered from the living forest.",
            detail: (tropical
                ? "This species belongs to the tropical canopy, riverbank or swidden garden. Its season is part of the forest's own fruiting and flowering cycle."
                : savanna
                    ? "This species belongs to the savanna grass, thorn scrub, riparian corridor or scattered woodland. Its yield follows the wet and dry season recorded on the map."
                    : taiga
                        ? "This product belongs to the boreal spruce, pine, larch and birch forest, its moss floor, bogs or forest lakes. Its yield follows the long winter and short summer recorded on the map."
                        : "This species belongs to the temperate woodland. Its seasonal yield follows the forest type, age and management recorded on the map.")
                + (processed ? " It is a processed product: raw carcasses or hides are turned into this good before delivery." : ""),
            tags: [tropical ? "tropical" : savanna ? "savanna" : taiga ? "taiga" : "temperate", good.category, processed ? "processed" : "raw", good.id],
            availability: processed ? "Processed from raw stock" : "Seasonal · ecology-limited",
            recipe: null,
        }));
    }

    return Object.freeze(items.sort((left, right) => {
        const a = left.label.toLowerCase();
        const b = right.label.toLowerCase();
        return a < b ? -1 : a > b ? 1 : left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    }));
}

export const BASE_ITEMS = buildBaseItems();
const BASE_BY_ID = new Map(BASE_ITEMS.map(item => [item.id, item]));
const BASE_BY_KEY = new Map();
for (const item of BASE_ITEMS) {
    const key = item.id.replace(/^base:(?:resource|good|metal|furnishing|forest):/, "");
    if (!BASE_BY_KEY.has(key)) BASE_BY_KEY.set(key, item);
}

export const CRAFTED_ITEM_KINDS = Object.freeze({
    weapon: Object.freeze({
        label: "Weapon", category: "weapon", nouns: Object.freeze(["Longsword", "Arming Sword", "War Axe", "Spear", "Mace", "Hunting Bow", "Dagger"]),
    }),
    armour: Object.freeze({
        label: "Armour", category: "armour", nouns: Object.freeze(["Mail Shirt", "Cuirass", "Shield", "Helm", "Brigandine", "Poleyn"]),
    }),
    tool: Object.freeze({
        label: "Tool", category: "tool", nouns: Object.freeze(["Hammer", "Chisel", "Plough Iron", "Saw", "Anvil Set", "Draw Knife"]),
    }),
    book: Object.freeze({
        label: "Book", category: "book", nouns: Object.freeze(["Codex", "Tome", "Ledger", "Treatise", "Chronicle"]),
    }),
    jewellery: Object.freeze({
        label: "Jewellery", category: "jewellery", nouns: Object.freeze(["Ring", "Torc", "Brooch", "Pendant", "Signet"]),
    }),
    relic: Object.freeze({
        label: "Relic", category: "relic", nouns: Object.freeze(["Reliquary", "Ceremonial Cup", "Crown Fragment", "Devotional Plaque"]),
    }),
});

const QUALITY_BANDS = Object.freeze([
    Object.freeze({ min: 90, label: "Masterwork" }),
    Object.freeze({ min: 75, label: "Superior" }),
    Object.freeze({ min: 55, label: "Fine" }),
    Object.freeze({ min: 35, label: "Serviceable" }),
    Object.freeze({ min: 0, label: "Rough" }),
]);

const FORGED_ADJECTIVES = Object.freeze([
    "Tempered", "Riveted", "Balanced", "Gilded", "Plain", "Reinforced", "Weathered", "Bright", "Heavy", "Fine",
]);

const BOOK_SUBJECTS = Object.freeze([
    "the Old Wood", "the River Marches", "the Succession Wars", "Herbal Medicine", "the Crown's Laws",
    "the Northern Passes", "the Language of Birds", "the Deep Roads", "the Tropical Canopy", "the Mason's Craft",
    "the Tides of the Eastern Sea", "the Lineages of the Royal House", "the Care of Horses", "the Grasses of the Field",
    "the Wards Against Fever", "the Songs of the Harvest", "the Ruins Beneath the Hills", "the Keeping of Bees",
    "the Weights and Measures of the Market", "the Deeds of the Crown",
]);

const BOOK_FORMS = Object.freeze([
    subject => "On " + subject,
    subject => "A Treatise on " + subject,
    subject => "The Book of " + subject,
    subject => "Concerning " + subject,
    subject => "A Chronicle of " + subject,
    subject => "Notes upon " + subject,
]);

function clampInteger(value, min, max, fallback = min) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, Math.round(numeric)));
}

function cleanText(value, fallback = "") {
    return String(value ?? fallback).replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
}

function hashText(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function pick(list, seed) {
    return list[seed % list.length];
}

function normalizeMaterials(value) {
    if (!value) return [];
    const source = Array.isArray(value)
        ? value.map(entry => [entry?.id, entry?.amount])
        : Object.entries(value);
    const normalized = [];
    const seen = new Set();
    for (const [rawId, rawAmount] of source) {
        const id = String(rawId || "").trim().slice(0, 80);
        const amount = clampInteger(rawAmount, 1, 1000000, 1);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        normalized.push({ id, amount });
        if (normalized.length >= MAX_MATERIALS) break;
    }
    return normalized;
}

function materialDescriptor(id) {
    const item = BASE_BY_KEY.get(id) || BASE_BY_ID.get(id);
    return { id, label: item?.label || humanizeId(id), category: item?.category || "material" };
}

function qualityFor(seed, requested) {
    const numeric = Number(requested);
    if (Number.isFinite(numeric)) return clampInteger(numeric, 0, 100, 50);
    return 35 + (seed % 66);
}

function qualityBand(quality) {
    return QUALITY_BANDS.find(band => quality >= band.min)?.label || "Rough";
}

function qualitySlug(quality) {
    return qualityBand(quality).toLowerCase().replace(/\s+/g, "-");
}

function generatedName(kind, seed, materials) {
    const definition = CRAFTED_ITEM_KINDS[kind] || CRAFTED_ITEM_KINDS.relic;
    if (kind === "book") {
        const subject = pick(BOOK_SUBJECTS, seed);
        const form = pick(BOOK_FORMS, Math.floor(seed / 7));
        return form(subject);
    }
    const noun = pick(definition.nouns, seed);
    const material = materials.length ? materialDescriptor(materials[0].id) : null;
    if (material && material.category !== "material" && material.category !== "metal") {
        return pick(FORGED_ADJECTIVES, Math.floor(seed / 3)) + " " + noun;
    }
    return (material?.label || pick(FORGED_ADJECTIVES, Math.floor(seed / 3))) + " " + noun;
}

function craftedSource(kind, workshop, year) {
    const place = cleanText(workshop, "") || (kind === "book" ? "The royal scriptorium" : "The royal workshop");
    return place + " · year " + year;
}

function craftedSummary(kind, quality, materialLabels) {
    const band = qualityBand(quality).toLowerCase();
    const materials = materialLabels.length ? materialLabels.join(", ") : "local stock";
    if (kind === "book") return "A " + band + " written volume on " + materials + ".";
    if (kind === "weapon") return "A " + band + " weapon of " + materials + ", made for a named hand.";
    if (kind === "armour") return "A " + band + " piece of armour of " + materials + ".";
    if (kind === "tool") return "A " + band + " working tool of " + materials + ".";
    if (kind === "jewellery") return "A " + band + " ornament of " + materials + ".";
    return "A " + band + " relic of " + materials + ".";
}

function generatedDescription(kind, quality, band, materials, crafterName, source, year) {
    const materialText = materials.length
        ? materials.map(entry => entry.amount + " × " + materialDescriptor(entry.id).label).join(", ")
        : "materials not recorded";
    const maker = crafterName ? " by " + crafterName : "";
    return cleanText(
        "Made" + maker + " at " + source + ". The work is " + band.toLowerCase()
        + " (quality " + quality + "/100) and consumed " + materialText + "."
        + " Recorded in year " + year + " as a unique player-made item. It is not interchangeable with a base catalogue entry."
    );
}

export function normalizeCraftedItem(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const kind = String(value.kind || "");
    const definition = CRAFTED_ITEM_KINDS[kind];
    if (!definition) return null;
    const id = String(value.id || "").trim();
    if (!/^crafted-[a-z]+-[a-z0-9-]{1,64}$/.test(id)) return null;
    const label = cleanText(value.label, "");
    if (!label || label.length > MAX_NAME) return null;
    const quality = clampInteger(value.quality, 0, 100, 0);
    const materials = normalizeMaterials(value.materials);
    const year = clampInteger(value.year, 1, 100000, 1);
    const tick = clampInteger(value.tick, 0, Number.MAX_SAFE_INTEGER, 0);
    const crafterId = value.crafterId ? String(value.crafterId).trim().slice(0, 80) : null;
    const crafterName = value.crafterName ? cleanText(value.crafterName, "").slice(0, 80) : null;
    const workshop = value.workshop ? cleanText(value.workshop, "").slice(0, 100) : null;
    const source = cleanText(value.source, craftedSource(kind, workshop, year)).slice(0, 120);
    const storedDetail = cleanText(value.detail, "").slice(0, MAX_TEXT);
    // Older archives stored the detail prose with "Recorded in 1". Normalise
    // that label on read; the archived record itself stays untouched.
    const detail = storedDetail
        ? storedDetail.replace(/\bRecorded in (?!year\b)(\d+)\b/g, "Recorded in year $1")
        : generatedDescription(kind, quality, qualityBand(quality), materials, crafterName, source, year);
    return Object.freeze({
        id, origin: "crafted", kind, category: definition.category, label,
        source,
        summary: cleanText(value.summary, craftedSummary(kind, quality, materials.map(entry => materialDescriptor(entry.id).label))).slice(0, MAX_TEXT),
        detail,
        quality, qualityBand: qualityBand(quality),
        materials: Object.freeze(materials.map(entry => Object.freeze({ ...entry }))),
        crafterId, crafterName, workshop, year, tick,
        tags: Object.freeze((Array.isArray(value.tags) ? value.tags : [kind, "player-made", qualitySlug(quality)])
            .map(tag => String(tag).trim().slice(0, 40)).filter(Boolean).slice(0, 12)),
        availability: "Unique · recorded once",
        recipe: null,
    });
}

export function normalizeCraftedItems(value) {
    if (!Array.isArray(value)) return [];
    const normalized = [];
    const seen = new Set();
    for (const entry of value) {
        const item = normalizeCraftedItem(entry);
        if (!item || seen.has(item.id)) continue;
        seen.add(item.id);
        normalized.push(item);
        if (normalized.length >= MAX_CRAFTED_ITEMS) break;
    }
    return normalized;
}

export function validateCraftedItems(value) {
    if (value === undefined) return true;
    if (!Array.isArray(value)) throw new TypeError("Crafted item archive must be an array.");
    if (value.length > MAX_CRAFTED_ITEMS) throw new TypeError("Crafted item archive exceeds " + MAX_CRAFTED_ITEMS + " records.");
    const seen = new Set();
    for (const [index, entry] of value.entries()) {
        const item = normalizeCraftedItem(entry);
        if (!item) throw new TypeError("Crafted item at position " + index + " is invalid.");
        if (seen.has(item.id)) throw new TypeError("Crafted item archive contains a duplicate id: " + item.id + ".");
        seen.add(item.id);
    }
    return true;
}

export function createCraftedItem(options = {}) {
    const kind = String(options.kind || "weapon");
    const definition = CRAFTED_ITEM_KINDS[kind];
    if (!definition) throw new TypeError("Unknown crafted item kind: " + kind);
    const worldSeed = clampInteger(options.worldSeed, 1, Number.MAX_SAFE_INTEGER, 1);
    const year = clampInteger(options.year, 1, 100000, 1);
    const tick = clampInteger(options.tick, 0, Number.MAX_SAFE_INTEGER, 0);
    const serial = clampInteger(options.serial, 0, 1000000, 0);
    const materials = normalizeMaterials(options.materials);
    const crafterId = options.crafterId ? String(options.crafterId).trim().slice(0, 80) : null;
    const crafterName = options.crafterName ? cleanText(options.crafterName, "").slice(0, 80) : null;
    const workshop = options.workshop ? cleanText(options.workshop, "").slice(0, 100) : null;
    const materialKey = materials.map(entry => entry.id + ":" + entry.amount).join(",");
    const seedKey = [worldSeed, year, tick, serial, kind, materialKey, crafterId || "", workshop || ""].join("|");
    const seed = hashText(seedKey);
    const quality = qualityFor(seed, options.quality);
    const band = qualityBand(quality);
    const id = "crafted-" + kind + "-" + seed.toString(36);
    const label = cleanText(options.name, "") || generatedName(kind, seed, materials);
    const source = craftedSource(kind, workshop, year);
    const materialLabels = materials.map(entry => materialDescriptor(entry.id).label);
    const tags = [kind, "player-made", qualitySlug(quality), ...materials.map(entry => entry.id), workshop || ""];
    return normalizeCraftedItem({
        id, kind, label, source,
        summary: craftedSummary(kind, quality, materialLabels),
        detail: generatedDescription(kind, quality, band, materials, crafterName, source, year),
        quality, materials, crafterId, crafterName, workshop, year, tick, tags,
    });
}

// Registration is pure: the caller owns the state archive and can decide when
// to persist it. Re-registering the same record is idempotent.
export function appendCraftedItem(archive, record) {
    const current = normalizeCraftedItems(archive);
    const item = normalizeCraftedItem(record);
    if (!item) throw new TypeError("Cannot register an invalid crafted item.");
    if (current.some(entry => entry.id === item.id)) return current;
    return [...current, item].slice(-MAX_CRAFTED_ITEMS);
}

function searchText(item) {
    return [
        item.label, item.source, item.summary, item.detail, item.category,
        ITEM_CATEGORY_LABELS[item.category] || item.category,
        item.qualityBand || "", item.crafterName || "", item.workshop || "",
        ...(item.tags || []),
        ...(item.materials || []).map(entry => materialDescriptor(entry.id).label),
    ].join(" ").toLowerCase();
}

export function buildItemCatalog(craftedItems = []) {
    const crafted = normalizeCraftedItems(craftedItems);
    const rows = [...BASE_ITEMS, ...crafted].map(item => Object.freeze({
        ...item,
        categoryLabel: ITEM_CATEGORY_LABELS[item.category] || "Item",
        search: searchText(item),
    }));
    const categoryCounts = Object.fromEntries(ITEM_CATEGORIES.map(entry => [entry.id, 0]));
    categoryCounts.all = rows.length;
    categoryCounts.crafted = crafted.length;
    for (const row of rows) {
        if (Object.prototype.hasOwnProperty.call(categoryCounts, row.category)) categoryCounts[row.category]++;
    }
    return {
        rows,
        total: rows.length,
        baseCount: BASE_ITEMS.length,
        craftedCount: crafted.length,
        categoryCounts,
        categories: ITEM_CATEGORIES.map(entry => Object.freeze({
            ...entry, count: categoryCounts[entry.id] || 0,
        })),
        tick: 0,
    };
}

export function itemCategoryLabel(id) {
    return ITEM_CATEGORY_LABELS[id] || "Item";
}
