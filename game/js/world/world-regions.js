// Static provinces of the world beyond the realm. This is the shared identity
// layer for the schematic world map, not a second map simulation: ownership,
// control and loyalty live in the saved worldMap state, while this catalog only
// names the ten places and their border graph. The crown and all four
// diplomatic realms are represented, so a region can change hands without
// inventing a new kingdom record.
import { DIPLOMATIC_REALMS } from "../systems/diplomacy-config.js";

export const CROWN_OWNER_ID = "crown";
export const WORLD_REGION_CATALOG_VERSION = 1;
export const WORLD_REGION_LIMIT = 10;

const REGION_BLUEPRINTS = Object.freeze([
    {
        id: "crown-heartland", name: "Crown Heartland", ownerId: CROWN_OWNER_ID,
        terrain: "heartland", resource: "food", baseYield: 3,
        control: 76, loyalty: 72, garrison: 3,
        anchor: Object.freeze({ x: 0.46, y: 0.46 }),
        neighbours: Object.freeze(["crown-march", "northmere-fen", "redpass-steppe", "goldcoast-vines"]),
        description: "The settled core around the royal seats: fields, orchards and the roads that feed them."
    },
    {
        id: "crown-march", name: "Crown March", ownerId: CROWN_OWNER_ID,
        terrain: "march", resource: "wood", baseYield: 2,
        control: 62, loyalty: 61, garrison: 2, defaultAutonomy: 1,
        anchor: Object.freeze({ x: 0.57, y: 0.57 }),
        neighbours: Object.freeze(["crown-heartland", "northmere-pines", "ironvale-pass", "goldcoast-harbor", "redpass-gorge"]),
        description: "A wooded border march whose forester villages guard the approaches to the heartland."
    },
    {
        id: "northmere-pines", name: "Northmere Pines", ownerId: "northmere",
        terrain: "pinewood", resource: "wood", baseYield: 3,
        control: 68, loyalty: 62, garrison: 2,
        anchor: Object.freeze({ x: 0.35, y: 0.17 }),
        neighbours: Object.freeze(["northmere-fen", "crown-march", "redpass-steppe", "ironvale-crags"]),
        description: "The guild's deep pine belt, worked by contracted lumber camps and river floats."
    },
    {
        id: "northmere-fen", name: "Northmere Fen", ownerId: "northmere",
        terrain: "fen", resource: "food", baseYield: 2,
        control: 57, loyalty: 55, garrison: 1,
        anchor: Object.freeze({ x: 0.62, y: 0.17 }),
        neighbours: Object.freeze(["northmere-pines", "crown-heartland", "ironvale-crags"]),
        description: "Peat cuttings, eel weirs and winter pasture on the northern waterline."
    },
    {
        id: "ironvale-crags", name: "Ironvale Crags", ownerId: "ironvale",
        terrain: "crags", resource: "stone", baseYield: 3,
        control: 71, loyalty: 65, garrison: 4,
        anchor: Object.freeze({ x: 0.81, y: 0.33 }),
        neighbours: Object.freeze(["ironvale-pass", "northmere-pines", "northmere-fen", "goldcoast-vines"]),
        description: "High quarries and fortified caravan roads held by the Ironvale marshals."
    },
    {
        id: "ironvale-pass", name: "Ironvale Pass", ownerId: "ironvale",
        terrain: "pass", resource: "stone", baseYield: 2,
        control: 60, loyalty: 57, garrison: 3,
        anchor: Object.freeze({ x: 0.83, y: 0.61 }),
        neighbours: Object.freeze(["ironvale-crags", "crown-march", "goldcoast-vines", "goldcoast-harbor"]),
        description: "The eastern toll pass where stone, wool and silver change hands under guard."
    },
    {
        id: "goldcoast-vines", name: "Goldcoast Vines", ownerId: "goldcoast",
        terrain: "vineyard", resource: "food", baseYield: 3,
        control: 66, loyalty: 60, garrison: 2,
        anchor: Object.freeze({ x: 0.62, y: 0.79 }),
        neighbours: Object.freeze(["goldcoast-harbor", "crown-heartland", "crown-march", "ironvale-crags", "ironvale-pass", "redpass-gorge"]),
        description: "Terraced vineyards and market gardens supplying the southern league."
    },
    {
        id: "goldcoast-harbor", name: "Goldcoast Harbor", ownerId: "goldcoast",
        terrain: "harbor", resource: "gold", baseYield: 2,
        control: 58, loyalty: 52, garrison: 2,
        anchor: Object.freeze({ x: 0.36, y: 0.82 }),
        neighbours: Object.freeze(["goldcoast-vines", "crown-march", "ironvale-pass", "redpass-gorge", "redpass-steppe"]),
        description: "A crowded harbour of salt, credit and customs houses at the southern mouth."
    },
    {
        id: "redpass-gorge", name: "Redpass Gorge", ownerId: "redpass",
        terrain: "gorge", resource: "stone", baseYield: 2,
        control: 64, loyalty: 58, garrison: 3,
        anchor: Object.freeze({ x: 0.18, y: 0.66 }),
        neighbours: Object.freeze(["redpass-steppe", "crown-heartland", "crown-march", "goldcoast-vines", "goldcoast-harbor"]),
        description: "A red-rock gorge of guard posts, rope bridges and stubborn quarrymen."
    },
    {
        id: "redpass-steppe", name: "Redpass Steppe", ownerId: "redpass",
        terrain: "steppe", resource: "food", baseYield: 2,
        control: 53, loyalty: 49, garrison: 2,
        anchor: Object.freeze({ x: 0.17, y: 0.33 }),
        neighbours: Object.freeze(["redpass-gorge", "crown-heartland", "northmere-pines", "northmere-fen", "goldcoast-harbor"]),
        description: "Open grazing and waystations on the western road, always short of water."
    }
]);

export const WORLD_REGION_CATALOG = Object.freeze(REGION_BLUEPRINTS.map(region => Object.freeze({
    ...region,
    anchor: Object.freeze({ ...region.anchor }),
    neighbours: Object.freeze([...region.neighbours])
})));
export const WORLD_REGION_IDS = Object.freeze(WORLD_REGION_CATALOG.map(region => region.id));
export const WORLD_REGION_BY_ID = new Map(WORLD_REGION_CATALOG.map(region => [region.id, region]));
export const WORLD_KINGDOM_IDS = Object.freeze([CROWN_OWNER_ID, ...DIPLOMATIC_REALMS.map(realm => realm.id)]);
export const WORLD_KINGDOM_NAMES = Object.freeze(Object.fromEntries([
    [CROWN_OWNER_ID, "The Crown"],
    ...DIPLOMATIC_REALMS.map(realm => [realm.id, realm.name])
]));

export function regionDefinitionFor(regionId) {
    return WORLD_REGION_BY_ID.get(String(regionId || "")) || null;
}

export function regionIsKnown(regionId) {
    return WORLD_REGION_BY_ID.has(String(regionId || ""));
}

export function regionIsNeighbour(regionId, otherId) {
    const region = regionDefinitionFor(regionId);
    return Boolean(region && region.neighbours.includes(String(otherId || "")));
}

export function regionOwnerIsKingdom(ownerId) {
    return WORLD_KINGDOM_IDS.includes(String(ownerId || ""));
}
