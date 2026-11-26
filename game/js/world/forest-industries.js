// 1.2.23.1.151–180 — regional forest economy.
//
// This is deliberately one data layer, not a second simulation. It describes
// what the existing regional trees are physically good for, how the existing
// sawmill should grade a named timber, and which forest works can turn the
// existing gathered goods into finished wares. The simulation module reads
// these tables; the atlas and the building dossier render the same records.
import { REGIONAL_TIMBER_BY_GOOD } from "./regional-forests.js";

const freeze = value => Object.freeze(value);

// Physical working properties, not just a label. Hardness, elasticity, rot
// resistance and grain decide which saw profile, quality class and workshop
// can use a timber. Values are relative (0–1) so every regional wood stays
// comparable without pretending to be laboratory data.
export const WOOD_PROPERTIES = freeze({
    "nothofagus-timber": freeze({ hardness: 0.64, elasticity: 0.52, rot: 0.48, density: 0.62, workability: 0.76, grain: "straight", conifer: false, note: "Tough southern beech; steam-bends well and takes a clean plane." }),
    "podocarpus-timber": freeze({ hardness: 0.48, elasticity: 0.44, rot: 0.56, density: 0.5, workability: 0.82, grain: "straight", conifer: true, note: "Fine, stable softwood for joinery, oars and light framing." }),
    "treefern-timber": freeze({ hardness: 0.2, elasticity: 0.3, rot: 0.34, density: 0.28, workability: 0.58, grain: "coarse", conifer: false, note: "Soft fibrous trunk; fuel, compost and cheap packing before it is a beam." }),
    "redwood-timber": freeze({ hardness: 0.56, elasticity: 0.38, rot: 0.86, density: 0.55, workability: 0.8, grain: "straight", conifer: true, note: "Very tall, straight and rot-proof; the premier ship and exposed-work timber." }),
    "sitka-timber": freeze({ hardness: 0.44, elasticity: 0.52, rot: 0.46, density: 0.46, workability: 0.86, grain: "straight", conifer: true, note: "Light, resonant and elastic; masts, spars and soundboards." }),
    "hemlock-timber": freeze({ hardness: 0.47, elasticity: 0.48, rot: 0.42, density: 0.5, workability: 0.8, grain: "straight", conifer: true, note: "General construction softwood; takes nails and paint but not ground contact." }),
    "eucalyptus-timber": freeze({ hardness: 0.86, elasticity: 0.57, rot: 0.7, density: 0.82, workability: 0.55, grain: "interlocked", conifer: false, note: "Dense, abrasive and springy; tool handles, cart frames and heavy export." }),
    "cork-timber": freeze({ hardness: 0.68, elasticity: 0.42, rot: 0.82, density: 0.66, workability: 0.64, grain: "interlocked", conifer: false, note: "The living bark is cork; the timber is dense, rot-proof and slow to work." }),
    "holm-timber": freeze({ hardness: 0.88, elasticity: 0.44, rot: 0.84, density: 0.86, workability: 0.5, grain: "interlocked", conifer: false, note: "Extremely hard evergreen oak for bearings, wheels and heirloom furniture." }),
    "aleppo-timber": freeze({ hardness: 0.5, elasticity: 0.46, rot: 0.58, density: 0.52, workability: 0.8, grain: "straight", conifer: true, note: "Resinous Mediterranean pine for framing, boxes and pitch-rich kindling." }),
    "miombo-timber": freeze({ hardness: 0.72, elasticity: 0.5, rot: 0.62, density: 0.7, workability: 0.62, grain: "straight", conifer: false, note: "Dry-season hardwood for carts, tool handles and furniture." }),
    "teak-timber": freeze({ hardness: 0.82, elasticity: 0.48, rot: 0.95, density: 0.78, workability: 0.68, grain: "straight", conifer: false, note: "Oily, dimensionally stable and rot-proof; the export furniture standard." }),
    "sal-timber": freeze({ hardness: 0.78, elasticity: 0.44, rot: 0.8, density: 0.74, workability: 0.62, grain: "interlocked", conifer: false, note: "Heavy construction hardwood for sleepers, bridges and temple posts." }),
    "dipterocarp-timber": freeze({ hardness: 0.7, elasticity: 0.5, rot: 0.56, density: 0.66, workability: 0.7, grain: "straight", conifer: false, note: "Tall tropical hardwood; excellent beams when the resin is worked out." }),
    "mangrove-timber": freeze({ hardness: 0.74, elasticity: 0.58, rot: 0.86, density: 0.76, workability: 0.5, grain: "interlocked", conifer: false, note: "Salt-resistant, springy and hard; piling, boat ribs and bowed work." }),
    "laurel-timber": freeze({ hardness: 0.58, elasticity: 0.4, rot: 0.62, density: 0.56, workability: 0.78, grain: "fine", conifer: false, note: "Fine-grained cabinet wood with a scent that repels insects." }),
    "poplar-timber": freeze({ hardness: 0.32, elasticity: 0.62, rot: 0.3, density: 0.34, workability: 0.9, grain: "straight", conifer: false, note: "Light, fast and easy to split; pulp, paper, boxes and backing boards." }),
    "tamarisk-timber": freeze({ hardness: 0.46, elasticity: 0.56, rot: 0.66, density: 0.46, workability: 0.7, grain: "wavy", conifer: false, note: "Salt-tolerant riparian wood for fuel, charcoal and bent handles." }),
});

const FALLBACK_WOOD = freeze({ hardness: 0.52, elasticity: 0.46, rot: 0.5, density: 0.52, workability: 0.72, grain: "straight", conifer: false, note: "Mixed local timber with no special grade recorded." });

export function woodPropertiesFor(good) {
    if (good === "logs") return FALLBACK_WOOD;
    return WOOD_PROPERTIES[good] || FALLBACK_WOOD;
}

// The three requested commercial classes — construction, furniture and export
// — plus the physical classes the shipyard, bowyer and fuel yard actually need.
// `score` is a weighted reading of the timber properties above. The grade is
// what the player sees on a sawn batch and what the market premium follows.
export const WOOD_QUALITY_CLASSES = freeze({
    construction: freeze({ id: "construction", label: "Construction grade", minScore: 0.42, premium: 0.02, use: "Framing, planks and everyday building", note: "Rot resistance and predictable grain outweigh beauty." }),
    furniture: freeze({ id: "furniture", label: "Furniture grade", minScore: 0.5, premium: 0.12, use: "Tables, chairs, cabinets and panelling", note: "Hardness, workability and figure decide the cabinetmaker's price." }),
    export: freeze({ id: "export", label: "Export grade", minScore: 0.56, premium: 0.24, use: "Long-distance trade and royal gift work", note: "Dense, stable and recognisable; the good a foreign buyer asks for by name." }),
    ship: freeze({ id: "ship", label: "Ship timber", minScore: 0.55, premium: 0.2, use: "Keels, ribs, masts and repairs", note: "Straight, long and rot-resistant; a cracked mast is a lost voyage." }),
    bow: freeze({ id: "bow", label: "Bow stave", minScore: 0.48, premium: 0.18, use: "Bows, tool springs and bent handles", note: "Elasticity without hidden knots; the stave must return true." }),
    fuel: freeze({ id: "fuel", label: "Fuel grade", minScore: 0.2, premium: 0, use: "Hearths, kilns and charcoal", note: "Density and dryness matter more than a clean board." }),
    paper: freeze({ id: "paper", label: "Fibre grade", minScore: 0.3, premium: 0.04, use: "Pulp, paper and packing", note: "Soft, long fibres beat hard, decorative grain." }),
    cork: freeze({ id: "cork", label: "Cork grade", minScore: 0.45, premium: 0.16, use: "Cork bark, floats and stoppers", note: "Only the living cork-oak bark is graded here." }),
});
export const WOOD_QUALITY_IDS = freeze(Object.keys(WOOD_QUALITY_CLASSES));

const GRAIN_BONUS = freeze({ straight: 0.12, fine: 0.08, interlocked: 0.03, wavy: 0.02, coarse: -0.04 });

function qualityScore(properties, classId) {
    const p = properties;
    if (classId === "construction") return p.rot * 0.45 + p.workability * 0.35 + p.hardness * 0.2;
    if (classId === "furniture") return p.workability * 0.42 + p.hardness * 0.34 + (GRAIN_BONUS[p.grain] || 0);
    if (classId === "export") return p.hardness * 0.36 + p.rot * 0.28 + p.density * 0.2 + (GRAIN_BONUS[p.grain] || 0);
    if (classId === "ship") return p.rot * 0.42 + p.elasticity * 0.3 + (p.grain === "straight" ? 0.16 : 0) + p.density * 0.12;
    if (classId === "bow") return p.elasticity * 0.56 + (p.grain === "straight" ? 0.12 : 0) + p.workability * 0.2;
    if (classId === "paper") return p.workability * 0.42 + (1 - p.density) * 0.32 + p.elasticity * 0.14;
    if (classId === "cork") return p.rot * 0.34 + p.elasticity * 0.26 + p.workability * 0.2;
    return p.density * 0.55 + p.hardness * 0.25;
}

export function woodQualityFor(good, classId = "construction") {
    const definition = WOOD_QUALITY_CLASSES[classId] || WOOD_QUALITY_CLASSES.construction;
    const properties = woodPropertiesFor(good);
    const score = Math.max(0, Math.min(1, qualityScore(properties, definition.id)));
    const grade = score >= 0.78 ? "select" : score >= 0.62 ? "first" : score >= definition.minScore ? "standard" : "utility";
    return freeze({
        classId: definition.id, label: definition.label, grade, score,
        premium: definition.premium, use: definition.use, note: definition.note,
        reliable: score >= definition.minScore,
    });
}

// Sawmill specialisations. The ordinary profile is byte-compatible with the
// existing mill. The other four are real retoolings: they accept a narrower
// timber class and change the batch, so the player chooses between flexibility,
// plank volume, fuel, ship stock and bow stock.
export const SAW_PROFILES = freeze({
    general: freeze({
        id: "general", label: "General saw bench", accepts: "any", planksDelta: 0, firewoodDelta: 0,
        qualityClass: "construction", note: "Accepts every log and regional timber. Nothing is gained, nothing is lost.",
    }),
    hardwood: freeze({
        id: "hardwood", label: "Hardwood saw", accepts: "hardwood", planksDelta: 1, firewoodDelta: -1,
        qualityClass: "furniture", note: "Hard, dense timber only. Slower feed, one extra plank and less fuel.",
    }),
    softwood: freeze({
        id: "softwood", label: "Softwood saw", accepts: "softwood", planksDelta: 0, firewoodDelta: 1,
        qualityClass: "construction", note: "Conifer and light wood only. Fast framing stock with a larger fuel bundle.",
    }),
    ship: freeze({
        id: "ship", label: "Ship timber saw", accepts: "ship", planksDelta: -1, firewoodDelta: 0,
        qualityClass: "ship", extra: freeze({ shipTimber: 1 }), note: "Long, straight, rot-resistant stems. Cuts a ship timber beside the planks.",
    }),
    bow: freeze({
        id: "bow", label: "Bow stave bench", accepts: "bow", planksDelta: -1, firewoodDelta: 0,
        qualityClass: "bow", extra: freeze({ bowStaves: 1 }), note: "Elastic, straight-grained wood. Cuts one bow stave instead of a second plank.",
    }),
});
export const SAW_PROFILE_IDS = freeze(Object.keys(SAW_PROFILES));

export function sawProfileFor(id) {
    return SAW_PROFILES[id] || SAW_PROFILES.general;
}

export function sawProfileAccepts(profileId, timberId) {
    const profile = sawProfileFor(profileId);
    if (profile.accepts === "any") return true;
    if (!timberId || timberId === "logs") return profile.accepts === "softwood";
    const def = REGIONAL_TIMBER_BY_GOOD[timberId];
    if (!def) return profile.accepts === "softwood";
    const properties = woodPropertiesFor(timberId);
    if (profile.accepts === "hardwood") return !properties.conifer && properties.hardness >= 0.58;
    if (profile.accepts === "softwood") return properties.conifer;
    if (profile.accepts === "ship") return properties.grain === "straight" && properties.rot >= 0.62;
    if (profile.accepts === "bow") return properties.elasticity >= 0.52;
    return true;
}

// Returns null when the selected profile cannot cut this stem, so the caller
// can show a real reason instead of silently falling back to the general mill.
export function sawBatchFor(timber, profileId = "general") {
    const profile = sawProfileFor(profileId);
    const id = timber?.id || "logs";
    if (!sawProfileAccepts(profile.id, id)) return null;
    const def = REGIONAL_TIMBER_BY_GOOD[id] || null;
    const basePlanks = Math.max(1, Number(def?.planks) || Number(timber?.planks) || 2);
    const baseFirewood = Math.max(0, Number(def?.firewoodYield) || Number(timber?.firewood) || 1);
    const output = {
        planks: Math.max(0, basePlanks + profile.planksDelta),
        firewood: Math.max(0, baseFirewood + profile.firewoodDelta),
        ...(profile.extra || {}),
    };
    for (const key of Object.keys(output)) if (output[key] <= 0) delete output[key];
    const quality = woodQualityFor(id, profile.qualityClass);
    return freeze({ id, profile: profile.id, output: freeze(output), quality });
}

// Finished goods. These are ordinary hauled goods: they live in the warehouse
// ledger, are carried by the existing carriers and are sold through the shared
// goods book. `use` is shown in the atlas and the market row.
export const INDUSTRY_GOODS = freeze({
    charcoal: freeze({ label: "Charcoal", plural: "charcoal", basePrice: 4, use: "Smelters, braziers and winter fuel", mode: "charcoal" }),
    potash: freeze({ label: "Potash", plural: "potash", basePrice: 6, use: "Soap, glass and fulling", mode: "potash" }),
    furniture: freeze({ label: "Furniture", plural: "furniture", basePrice: 18, use: "Household comfort and export gift work", mode: "furniture" }),
    pitch: freeze({ label: "Pitch", plural: "pitch", basePrice: 7, use: "Ship seams, siege engines and waterproofing", mode: "resin" }),
    tar: freeze({ label: "Tar", plural: "tar", basePrice: 5, use: "Rope, cart grease and naval stores", mode: "tar" }),
    tannin: freeze({ label: "Tannin", plural: "tannin", basePrice: 5, use: "Leather dressing and mordant", mode: "tannery" }),
    dye: freeze({ label: "Dye", plural: "dye", basePrice: 8, use: "Cloth, banners and manuscript ink", mode: "dyeworks" }),
    medicine: freeze({ label: "Medicine", plural: "medicine", basePrice: 12, use: "Clinic cases and winter fevers", mode: "apothecary" }),
    paper: freeze({ label: "Paper", plural: "paper", basePrice: 6, use: "Chancery, school and archive", mode: "papermill" }),
    silk: freeze({ label: "Silk", plural: "silk", basePrice: 20, use: "Court cloth, banners and export", mode: "sericulture" }),
    rubber: freeze({ label: "Rubber", plural: "rubber", basePrice: 14, use: "Waterproofing, seals and tropical export", mode: "rubber" }),
    bambooFibre: freeze({ label: "Bamboo fibre", plural: "bamboo fibre", basePrice: 7, use: "Light frames, rope, paper and mats", mode: "bamboo" }),
    palmOil: freeze({ label: "Palm oil", plural: "palm oil", basePrice: 8, use: "Soap, lamps and kitchen trade", mode: "palm" }),
    palmFrond: freeze({ label: "Palm fronds", plural: "palm fronds", basePrice: 4, use: "Thatch, baskets and light shelter", mode: "palm" }),
    spices: freeze({ label: "Spices", plural: "spices", basePrice: 16, use: "Preserving, court kitchen and long-distance trade", mode: "spice" }),
    cork: freeze({ label: "Cork", plural: "cork", basePrice: 10, use: "Floats, stoppers, insulation and export", mode: "cork" }),
    smokedFish: freeze({ label: "Smoked fish", plural: "smoked fish", basePrice: 7, use: "Keepable food for households and expeditions", mode: "fishery" }),
    preserves: freeze({ label: "Preserves", plural: "preserves", basePrice: 8, use: "Keepable fruit, nuts and mushrooms for winter", mode: "preserves" }),
    shipTimber: freeze({ label: "Ship timber", plural: "ship timber", basePrice: 14, use: "Keels, ribs and masts", mode: "ship" }),
    bowStaves: freeze({ label: "Bow staves", plural: "bow staves", basePrice: 12, use: "Bows, springs and bent handles", mode: "bow" }),
});
export const INDUSTRY_GOOD_KEYS = freeze(Object.keys(INDUSTRY_GOODS));

export const FURNITURE_STYLES = freeze({
    "boreal-taiga": freeze({ id: "nordic-plank", label: "Nordic plank", premium: 0.08, note: "Heavy trestles, carved edges and pine-scented chests." }),
    "temperate-rainforest": freeze({ id: "rainforest-bent", label: "Rainforest bentwood", premium: 0.12, note: "Steam-bent beech and fern-frond inlay." }),
    "mediterranean-hardleaf": freeze({ id: "citrus-inlay", label: "Citrus inlay", premium: 0.16, note: "Dark holm oak with pale citrus-wood stars." }),
    "temperate-broadleaf": freeze({ id: "carved-oak", label: "Carved oak", premium: 0.1, note: "Joined oak, linenfold panels and turned legs." }),
    "tropical": freeze({ id: "lacquered-cane", label: "Lacquered cane", premium: 0.18, note: "Teak frames, cane seats and resin lacquer." }),
    "savanna": freeze({ id: "wrought-acacia", label: "Wrought acacia", premium: 0.12, note: "Hard acacia with inset leather and brass studs." }),
    "coastal": freeze({ id: "driftwood", label: "Driftwood", premium: 0.08, note: "Salt-bleached frames and rope-lashed joints." }),
    "mountain": freeze({ id: "alpine-joined", label: "Alpine joined", premium: 0.1, note: "Tight spruce joinery built for small rooms." }),
    "wetland": freeze({ id: "steam-bent", label: "Steam-bent", premium: 0.09, note: "Alder and willow bent over steam." }),
    "default": freeze({ id: "court-joinery", label: "Court joinery", premium: 0.06, note: "Plain, sound workshop furniture for the royal household." }),
});

export function furnitureStyleFor(typeOrKey) {
    const key = typeof typeOrKey === "string" ? typeOrKey : String(typeOrKey?.key || "");
    if (!key) return FURNITURE_STYLES.default;
    if (FURNITURE_STYLES[key]) return FURNITURE_STYLES[key];
    if (/tropical|jungle|mangrove|monsoon/i.test(key)) return FURNITURE_STYLES.tropical;
    if (/savanna|miombo|acacia/i.test(key)) return FURNITURE_STYLES.savanna;
    if (/coast|mangrove|salt/i.test(key)) return FURNITURE_STYLES.coastal;
    if (/mountain|subalpine|alpine/i.test(key)) return FURNITURE_STYLES.mountain;
    if (/swamp|wetland|carr|alluvial/i.test(key)) return FURNITURE_STYLES.wetland;
    if (/mediterr|hardleaf/i.test(key)) return FURNITURE_STYLES["mediterranean-hardleaf"];
    if (/taiga|boreal/i.test(key)) return FURNITURE_STYLES["boreal-taiga"];
    return FURNITURE_STYLES["temperate-broadleaf"];
}

// Seventeen workshop paths. Standard inputs come through the ordinary carrier
// chain; raw inputs are taken from the real forest-gathering ledger. A mode
// with `requiresAny` is unavailable where the wood cannot supply it, so a
// cedar tar kiln cannot appear in a treeless desert or a rubber press in a
// boreal pine wood.
export const FOREST_WORKS_MODES = freeze({
    charcoal: freeze({
        id: "charcoal", label: "Charcoal clamp", short: "CHARCOAL",
        description: "Slow-burn stacked cordwood into dense charcoal for smiths, braziers and winter fuel.",
        standard: freeze({ firewood: 3 }), raw: freeze({}), output: freeze({ charcoal: 2 }),
        requiresAny: freeze([]), use: "Fuel and metallurgy", longTerm: "A permanent fuel sink gives coppice and firewood a second buyer.",
    }),
    potash: freeze({
        id: "potash", label: "Potash works", short: "POTASH",
        description: "Leach hardwood ash and boil it down to potash for soap, glass and fulling.",
        standard: freeze({ firewood: 3 }), raw: freeze({ bark: 1 }), output: freeze({ potash: 1 }),
        requiresAny: freeze(["bark"]), use: "Soap and glass", longTerm: "Turns the bark and ash of thinning into a high-value export.",
    }),
    furniture: freeze({
        id: "furniture", label: "Furniture manufactory", short: "FURNITURE",
        description: "A regional cabinet shop: local timber, local style, a named batch and a quality grade.",
        standard: freeze({ planks: 2 }), timber: freeze({ amount: 1, classId: "furniture" }), raw: freeze({}), output: freeze({ furniture: 1 }),
        style: true, requiresAny: freeze([]), use: "Comfort and export", longTerm: "Every forest type has its own style, so a mature realm can furnish several courts.",
    }),
    resin: freeze({
        id: "resin", label: "Resin still", short: "RESIN",
        description: "Distil tapped conifer resin into pitch for ship seams and siege engines.",
        standard: freeze({}), raw: freeze({ resin: 3 }), output: freeze({ pitch: 2 }),
        requiresAny: freeze(["resin"]), use: "Shipbuilding and sieges", longTerm: "Links standing conifer woods to naval and military supply.",
    }),
    tar: freeze({
        id: "tar", label: "Tar kiln", short: "TAR",
        description: "Bake resin-rich wood and firewood in a sealed kiln for tar and pitch.",
        standard: freeze({ firewood: 1 }), raw: freeze({ resin: 4 }), output: freeze({ tar: 2 }),
        requiresAny: freeze(["resin"]), use: "Rope, carts and naval stores", longTerm: "A slow, smoky workshop that rewards a managed pine belt.",
    }),
    tannery: freeze({
        id: "tannery", label: "Tannin yard", short: "TANNIN",
        description: "Strip bark and steep it into tannin liquor for leather and dye mordants.",
        standard: freeze({}), raw: freeze({ bark: 3 }), output: freeze({ tannin: 2 }),
        requiresAny: freeze(["bark"]), use: "Leather and dye", longTerm: "Makes bark a crop instead of a by-product of felling.",
    }),
    dyeworks: freeze({
        id: "dyeworks", label: "Dye works", short: "DYE",
        description: "Berries, lichen and tannin produce a fast, repeatable dye lot.",
        standard: freeze({ tannin: 1 }), raw: freeze({ berries: 2, lichen: 1 }), output: freeze({ dye: 2 }),
        requiresAny: freeze(["berries", "lichen", "elderberries", "rowan-berries", "blueberries"]), use: "Cloth and banners", longTerm: "A seasonal colour trade that changes with the berry crop.",
    }),
    apothecary: freeze({
        id: "apothecary", label: "Forest apothecary", short: "MEDICINE",
        description: "Barks, herbs and resin become a measured medicine stock for the clinic and the road.",
        standard: freeze({}), raw: freeze({ herbs: 2, bark: 1, resin: 1 }), output: freeze({ medicine: 1 }),
        requiresAny: freeze(["herbs", "bark"]), use: "Health and expeditions", longTerm: "Turns a good herb year into a buffer against plague and winter.",
    }),
    paper: freeze({
        id: "paper", label: "Paper mill", short: "PAPER",
        description: "Ret fibre bark and herbs, beat them with water and pull sheets for the chancery.",
        standard: freeze({ water: 2 }), raw: freeze({ bark: 2, herbs: 1 }), output: freeze({ paper: 2 }),
        requiresAny: freeze(["bark"]), use: "School, court and archive", longTerm: "A quiet good that supports every later book and charter.",
    }),
    silk: freeze({
        id: "silk", label: "Mulberry silk house", short: "SILK",
        description: "Feed mulberry leaf to silkworms and reel the cocoons into a luxury cloth good.",
        standard: freeze({ firewood: 1 }), raw: freeze({ "mulberry-leaf": 3 }), output: freeze({ silk: 2 }),
        requiresAny: freeze(["mulberry-leaf"]), use: "Court and export", longTerm: "A rare warm-wood speciality that makes one region a fashion capital.",
    }),
    rubber: freeze({
        id: "rubber", label: "Rubber press", short: "RUBBER",
        description: "Tap tropical latex, smoke it and press waterproof sheets and seals.",
        standard: freeze({}), raw: freeze({ "natural-rubber": 3 }), output: freeze({ rubber: 2 }),
        requiresAny: freeze(["natural-rubber"]), use: "Waterproofing and trade", longTerm: "A tropical monopoly good that changes the value of a jungle colony.",
    }),
    bamboo: freeze({
        id: "bamboo", label: "Bamboo splitting yard", short: "BAMBOO",
        description: "Split giant culms into fibre, mats and light construction bundles.",
        standard: freeze({}), raw: freeze({ bamboo: 3 }), output: freeze({ bambooFibre: 2 }),
        requiresAny: freeze(["bamboo"]), use: "Light construction and rope", longTerm: "Makes a fast-growing tropical wood a renewable industrial input.",
    }),
    palm: freeze({
        id: "palm", label: "Palm press and thatch yard", short: "PALM",
        description: "Press palm fruit for oil and bundle fronds for thatch, baskets and shade.",
        standard: freeze({}), raw: freeze({ "palm-oil": 2, "palm-fibre": 2 }), output: freeze({ palmOil: 2, palmFrond: 1 }),
        requiresAny: freeze(["palm-oil", "palm-fibre"]), use: "Soap, lamps and shelter", longTerm: "A two-product grove economy that rewards wet tropical sites.",
    }),
    spice: freeze({
        id: "spice", label: "Spice sorting house", short: "SPICE",
        description: "Dry, sort and blend pepper, cinnamon and other forest spices for the long road.",
        standard: freeze({}), raw: freeze({ "black-pepper": 2, "cinnamon-bark": 2 }), output: freeze({ spices: 2 }),
        requiresAny: freeze(["black-pepper", "cinnamon-bark", "nutmeg", "cloves", "cardamom", "allspice"]), use: "Preserving and export", longTerm: "The richest long-distance trade good, and the hardest to secure.",
    }),
    cork: freeze({
        id: "cork", label: "Cork stripping shed", short: "CORK",
        description: "Strip cork-oak bark in the dry season, cure it and cut floats, stoppers and insulation.",
        standard: freeze({}), raw: freeze({ "cork-bark": 3 }), output: freeze({ cork: 2 }),
        requiresAny: freeze(["cork-bark"]), use: "Floats, stoppers and export", longTerm: "A nine-year bark cycle gives a Mediterranean realm a patient income.",
    }),
    fishery: freeze({
        id: "fishery", label: "Stream smokehouse", short: "FISH",
        description: "Split and smoke river fish so a good run keeps through the lean months.",
        standard: freeze({ firewood: 1 }), raw: freeze({ "river-fish": 3 }), output: freeze({ smokedFish: 2 }),
        requiresAny: freeze(["river-fish", "fish", "lake-fish"]), use: "Keepable food", longTerm: "Adds a food store that does not spoil like fresh catch.",
    }),
    preserves: freeze({
        id: "preserves", label: "Forest preserve kitchen", short: "PRESERVES",
        description: "Cook fruit, nuts and mushrooms with water into jars that outlast the harvest.",
        standard: freeze({ water: 1 }), raw: freeze({ berries: 2, mushrooms: 2 }), output: freeze({ preserves: 2 }),
        requiresAny: freeze(["berries", "mushrooms", "chestnuts", "hazelnuts", "crab-apples", "sloes", "elderberries"]), use: "Winter food", longTerm: "A way to turn a glut into a reserve instead of a price collapse.",
    }),
});
export const FOREST_WORKS_MODE_IDS = freeze(Object.keys(FOREST_WORKS_MODES));

export function forestWorksMode(id) {
    return FOREST_WORKS_MODES[id] || null;
}

function goodId(entry) {
    return typeof entry === "string" ? entry : String(entry?.id || "");
}

// A stand can supply a mode when its own type/formation list contains at least
// one of the requested raw goods. This uses the already-built forest survey,
// never a second map scan.
export function modeFitsStand(mode, stand) {
    if (!mode) return false;
    if (!stand?.forest && !stand?.regionalType) return false;
    if (!mode.requiresAny?.length) return true;
    const available = new Set();
    for (const good of stand.goods || []) available.add(goodId(good));
    for (const good of stand.regionalType?.goods || []) available.add(goodId(good));
    for (const good of stand.formation?.goods || []) available.add(goodId(good));
    return mode.requiresAny.some(id => available.has(id));
}

export function modeRegionLabel(mode, stand) {
    if (!mode) return "No workshop selected";
    if (!mode.requiresAny?.length) return "Any managed woodland";
    return mode.requiresAny.join(" · ");
}

// The 30 points are not a checklist hidden in code. They are the player-facing
// field guide, and every row names the real consumer that makes it true.
const req = (point, title, system, playerUse, longTerm, consumer) => freeze({
    id: "1.2.23.1." + point, point, title, system, playerUse, longTerm, consumer,
});

export const FOREST_INDUSTRY_REQUIREMENTS = freeze([
    req(151, "Regional wood species with their own properties",
        "Every regional timber now carries hardness, elasticity, rot resistance, density, workability and grain. The sawmill, forest works and market all read the same record.",
        "Open the Forest Atlas or a sawmill dossier to compare a redwood mast with a holm-oak bearing block before you cut.",
        "A new realm is a new material palette: the same furniture plan is a different business in a taiga, a cork oak wood or a mangrove coast.",
        "Sawmill batch planning, Forest Works furniture, timber quotes and the atlas wood card."),
    req(152, "Wood quality classes for construction, furniture and export",
        "Eight quality classes score each timber and stamp every saw batch with a grade. The grade changes the sale premium and the workshop that will accept it.",
        "Choose a saw profile to produce the class your next building or export contract needs instead of sawing anonymous planks.",
        "Quality gives a reason to keep older, denser stands and to trade for a timber your own forest cannot grow.",
        "Saw profile output, Forest Works furniture quality, industry market premium and dossier grade line."),
    req(153, "Specialised sawmills for hardwood and softwood",
        "The sawmill has five real profiles: general, hardwood, softwood, ship and bow. A profile narrows accepted stems and changes planks, fuel and special output.",
        "Retool a mill beside a specialised timber yard, then feed it the species the profile accepts.",
        "A mature realm specialises its mills by region and buys the missing class from another realm.",
        "Sawmill production plan, supply requests, timber market and building dossier selector."),
    req(154, "Furniture manufactories with regional styles",
        "The furniture mode consumes planks and one furniture-grade regional timber. The local forest type selects a style with its own premium and note.",
        "Build a Forest Works in a distinctive wood, set FURNITURE and sell the named style at the industry exchange.",
        "Furnishing several courts and collecting regional styles is a long cosmetic and economic goal.",
        "Forest Works furniture batches, style record, furniture quality, warehouse good and industry market."),
    req(155, "Resin as a raw material for pitch, glue and medicine",
        "Resin is already a seasonal forest good; the resin still and apothecary now consume it for pitch and medicine.",
        "Gather resin in summer, store it, then run the still when naval or clinic demand is high.",
        "Resin links standing conifer woods to three different strategic stocks instead of a single sale button.",
        "Forest Works resin and apothecary modes, forest gathering stock, pitch and medicine goods."),
    req(156, "Pitch and tar for shipbuilding and sieges",
        "Pitch and tar are physical goods produced by the resin still and tar kiln. They are priced by the industry exchange and consumed by ship-timber demand.",
        "Hold pitch for a ship timber batch or sell it when the exchange is high.",
        "Naval stores make a pine belt strategically valuable and give war preparation an economic cost.",
        "Forest Works resin/tar output, industry market, ship timber production and warehouse logistics."),
    req(157, "Cork from Mediterranean cork oaks",
        "Cork oak now yields cork bark. Only the Mediterranean hardleaf wood can supply the cork stripping shed.",
        "Manage a southern wood, gather cork bark in the dry season and cure it into floats and stoppers.",
        "A slow bark cycle rewards a patient Mediterranean realm and creates a durable export identity.",
        "Cork bark forest good, cork stripping shed, cork warehouse good and industry quote."),
    req(158, "Tannins for tanneries and dyeworks",
        "Bark is steeped into tannin, a physical good used as a dye mordant and leather dressing.",
        "Turn low-value bark from thinning into tannin before the dyeworks needs it.",
        "Bark becomes a reason to keep mixed broadleaf woods and to schedule felling by end use.",
        "Forest Works tannery, tannin good, dyeworks input and industry market."),
    req(159, "Natural dyes from bark, leaves and berries",
        "The dyeworks combines berries, lichen and tannin into repeatable dye lots. The input list follows what the stand actually grows.",
        "Pick a berry-rich wood, run the dyeworks in autumn and sell dye to the cloth trade.",
        "Seasonal colour batches give the player a yearly rhythm and a reason to protect understorey plants.",
        "Forest Works dyeworks, forest gathering stock, dye good and industry exchange."),
    req(160, "Medicinal barks, resins and herbs",
        "The apothecary consumes herbs, bark and resin for medicine. The clinic and expeditions remain the narrative consumers.",
        "Stock medicine before winter, a plague or a long expedition.",
        "A good herb year becomes a real health buffer, and a bad year forces trade or restraint.",
        "Forest Works apothecary, medicine good, health stock and expedition supply."),
    req(161, "Regional fruits and berries as food",
        "Existing seasonal gathering already delivers berries, crab apples, sloes and tropical fruit. The preserve kitchen now turns a glut into keepable jars.",
        "Gather a summer or autumn surplus, preserve it and carry the jars into winter.",
        "The orchard-like woods become a food strategy rather than a one-day sale.",
        "Forest gathering, preserves mode, food delivery and winter reserve."),
    req(162, "Nuts and seeds as durable stores",
        "Acorns, beechnuts, chestnuts, hazelnuts and tropical nuts remain mast goods; pannage and the preserve kitchen consume them.",
        "Use mast for stables or preserve it for the household, depending on the winter ahead.",
        "A mast year is a genuine windfall that shapes livestock and food planning.",
        "Pannage, forest gathering, preserves mode and food reserve."),
    req(163, "Mushrooms as seasonal food and trade",
        "Mushrooms remain a strong autumn good. The preserve kitchen and the market both give them a later use.",
        "Gather the autumn flush, preserve part and sell the rest before spoilage.",
        "A short, intense season creates a yearly decision and a reason to watch the forest floor.",
        "Forest gathering, spoilage, preserves mode and industry market."),
    req(164, "Hunting regional wildlife",
        "The existing herd and fauna model still owns every hunt. Regional species, quality bands and processed game/fur/hides remain the chain.",
        "Hunt the species your wood actually carries, then process the catch before it spoils.",
        "Regional trophies, quality bands and processed goods support a hunter's long career.",
        "Forest fauna, forest gathering hunt stock, processForestHunt and cured goods."),
    req(165, "Honey and wax from woodland beekeeping",
        "Honey and beeswax are existing gathered goods; the preserve kitchen and market give them a stable outlet.",
        "Protect flowering edges and gather in the summer flow.",
        "Apiary-friendly woods become a recurring income and a pollination story.",
        "Forest gathering, honey/beeswax goods, preserves and market sale."),
    req(166, "Fishing in forest streams and floodplains",
        "River fish is already a seasonal good. The stream smokehouse now turns it into keepable smoked fish.",
        "Fish the floodplain run, then smoke the catch before it spoils.",
        "A wet forest becomes a food engine and a reason to protect water quality.",
        "Fishery mode, river-fish stock, smoked fish good and food reserve."),
    req(167, "Wood pasture for cattle, sheep and goats",
        "The existing pannage system feeds stables from mast and hay. The atlas now names the wood-pasture link and the preserve kitchen uses the same mast.",
        "Feed stables from a mast year instead of buying feed, and keep a reserve for winter.",
        "Livestock, mast and woodland management become one seasonal plan.",
        "Forest pannage, stable feeding, mast goods and preserves."),
    req(168, "Charcoal burning for metallurgy",
        "The charcoal clamp is a Forest Works mode consuming firewood and producing charcoal.",
        "Build a works near coppice, run charcoal in winter and sell to smiths or the exchange.",
        "A permanent fuel demand makes coppice management profitable and supports metalworking.",
        "Charcoal mode, firewood input, charcoal good and industry market."),
    req(169, "Tar ovens for pitch and shipbuilding",
        "The tar kiln is a separate mode from the resin still: it needs resin and firewood and produces tar.",
        "Choose tar when rope and cart demand is high, pitch when shipbuilding is the priority.",
        "Two smoky paths give the player a real industrial choice instead of one button.",
        "Tar kiln mode, resin raw stock, tar good and ship-timber economy."),
    req(170, "Potash from wood ash for glass and soap",
        "The potash works consumes firewood and bark and produces potash.",
        "Use the ash of thinning and bark waste to supply soap and glass works.",
        "A waste-to-value chain that rewards a mature, well-managed wood.",
        "Potash mode, firewood/bark inputs, potash good and market."),
    req(171, "Separation of construction timber and firewood",
        "Saw profiles now split the stem into planks, firewood or a special product. Construction grades, fuel grades and special grades are distinct.",
        "Retool the mill for the product the realm needs; do not burn a furniture-grade stem as fuel.",
        "The same tree can be a beam, a chair or a fire, and the choice is visible in the ledger.",
        "Saw profiles, quality classes, firewood demand and building construction."),
    req(172, "Firewood demand from households and workshops",
        "The existing settlement heating pass already draws firewood from local stores. The new saw/fuel split makes that demand part of the production choice.",
        "Keep a local firewood store through winter and decide how much timber to divert from planks.",
        "Cold winters and growing towns turn fuel into a permanent strategic concern.",
        "Settlement heating, firewood warehouse good, saw profile output and winter."),
    req(173, "Shipbuilding timber from long, straight stems",
        "The ship saw profile accepts straight, rot-resistant stems and outputs ship timber beside planks. Pitch demand gives it a strategic partner.",
        "Retool a mill in a coastal or river timber yard and sell ship timber to the admiralty exchange.",
        "A navy-oriented realm needs a dedicated timber district, not a generic sawmill.",
        "Ship saw profile, ship timber good, pitch mode and industry market."),
    req(174, "Bow wood from elastic timbers",
        "The bow stave bench accepts elastic, straight-grained wood and outputs bow staves.",
        "Find yew, mangrove or another elastic species, then retool the mill for bow staves.",
        "A specialised military wood good that rewards regional knowledge and forest protection.",
        "Bow saw profile, bow staves good, quality class and market."),
    req(175, "Paper from fibres and bark",
        "The paper mill consumes bark, herbs and water for paper.",
        "Turn bark and a wet-site water supply into paper for school, court and archive.",
        "A knowledge economy needs a local fibre chain, not an imported abstraction.",
        "Paper mill mode, paper good, water logistics and market."),
    req(176, "Silk from mulberry woods",
        "Mulberry leaf is a new warm-wood gathered good. The silk house consumes it for silk.",
        "Find a Mediterranean or warm broadleaf wood with mulberry leaf and build a silk house.",
        "A rare regional luxury that supports court prestige and long-distance trade.",
        "Mulberry leaf forest good, silk house mode, silk good and industry market."),
    req(177, "Rubber from tropical tree species",
        "Natural rubber is already a tropical forest good; the rubber press turns it into a waterproof trade good.",
        "Manage a tropical latex stand, gather in the wet season and press rubber for export.",
        "A tropical colony gets a strategic export that no temperate realm can copy.",
        "Rubber press mode, natural-rubber stock, rubber good and market."),
    req(178, "Bamboo fibres for light construction",
        "Giant bamboo is already a tropical wood good; the splitting yard produces bamboo fibre.",
        "Harvest bamboo brakes, split fibre and use it for light frames, rope and paper.",
        "A fast-renewing industrial input that makes tropical forestry distinct from temperate logging.",
        "Bamboo splitting yard, bamboo fibre good, tropical gathering and market."),
    req(179, "Palm oil and palm fronds as regional goods",
        "Palm oil and palm fibre are existing tropical goods; the palm press produces palm oil and palm fronds.",
        "Run a palm grove works for soap, lamps and thatch.",
        "A two-product grove economy with food, craft and shelter uses.",
        "Palm press mode, palmOil/palmFrond goods, tropical gathering and market."),
    req(180, "Spices from forest plants for long-distance trade",
        "Pepper, cinnamon and other tropical spices are existing gathered goods; the spice house sorts them into a high-value export lot.",
        "Build a spice house in a spice-rich jungle and time sales against the exchange.",
        "The richest and most dangerous long-distance trade, tying forest protection to realm wealth.",
        "Spice house mode, spice raw goods, spices good and industry market."),
]);
