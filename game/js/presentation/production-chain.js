// Player-facing read model for the real production chains and warehouse
// profiles. It reads the same simulation state as the Buildings and Stores
// panels: recipes, live structures, local stores, carrier orders, physical
// stock and warehouse filters. Nothing here changes state, schedules work or
// invents a production rate; every number is derived on panel render only.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import {
    GOODS, GOOD_KEYS, RECIPES, WAREHOUSE_PROFILES, WAREHOUSE_PROFILE_IDS
} from "../systems/city-config.js";
import {
    getBuildingSupplyReason, getPhysicalStockMap, getWarehouseSnapshot
} from "../systems/logistics.js";
import { getManualLogisticsSnapshot } from "./manual-logistics.js";

const STAGE_BUILDING_LIMIT = 6;
const STAGE_ORDER_LIMIT = 4;

// Five chains cover every bulk recipe in the catalogue. The craft chain is a
// terminal branch: its unique records continue in the Lexicon, never as a bulk
// warehouse good. Stages stay ordered as a player would follow the goods.
const CHAIN_DEFINITIONS = Object.freeze([
    Object.freeze({
        id: "bread", label: "Field to loaf",
        note: "Fields grow grain, mills grind flour, bakeries bake bread; a granary or the royal keep keeps the chain fed.",
        stages: Object.freeze([
            Object.freeze({ id: "grain", label: "GROW GRAIN", types: Object.freeze([TYPE.FARM]), goods: Object.freeze(["grain"]) }),
            Object.freeze({ id: "flour", label: "MILL FLOUR", types: Object.freeze([TYPE.MILL]), goods: Object.freeze(["grain", "flour"]) }),
            Object.freeze({ id: "bread", label: "BAKE BREAD", types: Object.freeze([TYPE.BAKERY]), goods: Object.freeze(["flour", "bread"]) }),
            Object.freeze({ id: "ale", label: "BREW ALE", types: Object.freeze([TYPE.BREWERY]), goods: Object.freeze(["grain", "ale"]) }),
            Object.freeze({ id: "food-store", label: "STORE & DELIVER", types: Object.freeze([TYPE.WAREHOUSE, TYPE.KEEP]), goods: Object.freeze(["grain", "flour", "bread", "ale"]), storage: true })
        ])
    }),
    Object.freeze({
        id: "timber", label: "Forest to frame",
        note: "Lumber camps and foresters supply logs or a named timber; the sawmill makes planks and firewood for building and crafting.",
        stages: Object.freeze([
            Object.freeze({ id: "logs", label: "HARVEST TIMBER", types: Object.freeze([TYPE.LUMBER, TYPE.FORESTER]), goods: Object.freeze(["logs"]) }),
            Object.freeze({ id: "planks", label: "SAW PLANKS", types: Object.freeze([TYPE.SAWMILL]), goods: Object.freeze(["logs", "planks", "firewood"]) }),
            Object.freeze({ id: "timber-store", label: "STORE & DELIVER", types: Object.freeze([TYPE.WAREHOUSE, TYPE.KEEP]), goods: Object.freeze(["logs", "planks", "firewood"]), storage: true })
        ])
    }),
    Object.freeze({
        id: "stone", label: "Quarry to wall",
        note: "Quarries cut blocks, masons dress cut stone, and repairs consume what the stores actually hold.",
        stages: Object.freeze([
            Object.freeze({ id: "blocks", label: "CUT STONE", types: Object.freeze([TYPE.QUARRY]), goods: Object.freeze(["stoneBlocks"]) }),
            Object.freeze({ id: "dressed", label: "DRESS STONE", types: Object.freeze([TYPE.MASON]), goods: Object.freeze(["stoneBlocks", "cutStone"]) }),
            Object.freeze({ id: "stone-store", label: "STORE & DELIVER", types: Object.freeze([TYPE.WAREHOUSE, TYPE.KEEP]), goods: Object.freeze(["stoneBlocks", "cutStone"]), storage: true })
        ])
    }),
    Object.freeze({
        id: "water", label: "Well to hearth",
        note: "Dug wells fill the cisterns; households, taverns and healers draw from the same physical water book.",
        stages: Object.freeze([
            Object.freeze({ id: "draw", label: "DRAW WATER", types: Object.freeze([TYPE.WELL]), goods: Object.freeze(["water"]) }),
            Object.freeze({ id: "cistern", label: "STORE & DELIVER", types: Object.freeze([TYPE.WAREHOUSE, TYPE.KEEP]), goods: Object.freeze(["water"]), storage: true })
        ])
    }),
    Object.freeze({
        id: "craft", label: "Workshop to deed",
        note: "Smiths and scribes need delivered inputs; the unique item is committed from the Lexicon and never handled as a warehouse lot.",
        stages: Object.freeze([
            Object.freeze({ id: "smith", label: "FORGE AN ITEM", types: Object.freeze([TYPE.SMITHY]), goods: Object.freeze(["planks", "firewood"]) }),
            Object.freeze({ id: "scribe", label: "WRITE AN ITEM", types: Object.freeze([TYPE.SCRIPTORIUM]), goods: Object.freeze(["planks", "water"]) }),
            Object.freeze({ id: "craft-store", label: "FEED THE SHOP", types: Object.freeze([TYPE.WAREHOUSE, TYPE.KEEP]), goods: Object.freeze(["planks", "firewood", "water"]), storage: true })
        ])
    })
]);

function aliveBuildings() {
    return state.entities.filter(entity => !entity.dead && entity.isBuilding?.());
}
function isSite(building) {
    return Boolean(building?.construction && Number(building.construction.stage) < 3);
}
function quantity(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
}
function labelFor(good) {
    return GOODS[good]?.label || good;
}

/** Which declared chains include this building type. Bounded to five ids. */
export function chainTagsFor(type) {
    return CHAIN_DEFINITIONS.filter(chain => chain.stages.some(stage => stage.types.includes(type))).map(chain => chain.id);
}

/**
 * Derive one stage from live structures. Order previews are capped so the
 * register cannot grow with a large carrier queue. The first matching building
 * id is returned for the focus button; no click state lives in this module.
 */
function stageSnapshot(stage, buildings, stock, warehouses) {
    const matches = buildings.filter(building => stage.types.includes(building.type));
    const samples = matches.slice(0, STAGE_BUILDING_LIMIT);
    const operational = samples.filter(building => !isSite(building));
    const blocked = [];
    const orders = [];
    for (const building of operational) {
        if (stage.storage) {
            if ((warehouses.free ?? 0) <= 0) blocked.push({ id: building.id, reason: "No free warehouse space" });
            continue;
        }
        if (!building.inventory) {
            blocked.push({ id: building.id, reason: "No local store" });
            continue;
        }
        // A forester tends the stand instead of running the zero-batch lumber
        // recipe, and a workshop writes a unique record instead of a warehouse
        // lot. Neither can be judged by the ordinary recipe output-space test.
        const reason = building.type === TYPE.FORESTER || RECIPES[building.type]?.unique
            ? null
            : getBuildingSupplyReason(building);
        if (reason) blocked.push({ id: building.id, reason: String(reason) });
        const preview = getManualLogisticsSnapshot(building, { warehouseFree: warehouses.free ?? 0 });
        for (const order of preview.orders) {
            if (orders.length >= STAGE_ORDER_LIMIT) break;
            if (!order.ok) continue;
            orders.push({ kind: order.kind, good: order.good, label: order.label, quantity: order.quantity, buildingId: building.id });
        }
    }
    const stored = stage.goods.reduce((sum, good) => sum + quantity(stock?.[good]), 0);
    let status = "OPERATING";
    if (!matches.length) status = "NO STRUCTURE";
    else if (isSite(matches[0]) && !operational.length) status = "UNDER CONSTRUCTION";
    // A waiting carrier is an actionable state: show the ready order before the
    // generic reason so the player can fix the exact block from this panel.
    else if (orders.length) status = "ORDER READY · " + (orders[0].kind === "supply" ? "SUPPLY " : "HAUL ") + orders[0].quantity + " " + orders[0].label.toUpperCase();
    else if (blocked.length === operational.length && operational.length) status = String(blocked[0].reason).toUpperCase();
    return {
        id: stage.id, label: stage.label,
        count: matches.length, sites: matches.filter(isSite).length,
        ready: Math.max(0, operational.length - blocked.length),
        stock: stored,
        goods: stage.goods.map(labelFor),
        status,
        orders,
        focusBuildingId: matches[0]?.id ?? null,
        recipe: stage.storage ? "Warehouse" : (RECIPES[matches[0]?.type]?.label || "Site works")
    };
}

/** A bounded, deterministic view of all five chains for the register header. */
export function getProductionChainSnapshot() {
    const buildings = aliveBuildings();
    let stock = {};
    let warehouses = { free: 0, rows: [] };
    try {
        stock = getPhysicalStockMap() || {};
        warehouses = getWarehouseSnapshot();
    } catch { /* a realm before founding has no books; the view stays empty */ }
    return {
        chains: CHAIN_DEFINITIONS.map(chain => ({
            id: chain.id, label: chain.label, note: chain.note,
            stages: chain.stages.map(stage => stageSnapshot(stage, buildings, stock, warehouses))
        }))
    };
}

/** One row per declared profile, plus goods no store can currently accept. */
export function getWarehouseProfileSnapshot() {
    let snapshot = { rows: [] };
    let stock = {};
    try {
        snapshot = getWarehouseSnapshot();
        stock = getPhysicalStockMap() || {};
    } catch { /* no stores before the realm is founded */ }
    const rows = snapshot.rows || [];
    const profiles = WAREHOUSE_PROFILE_IDS.map(id => {
        const profile = WAREHOUSE_PROFILES[id];
        const stores = rows.filter(row => row.profile === id);
        const used = stores.reduce((sum, row) => sum + quantity(row.used), 0);
        const free = stores.reduce((sum, row) => sum + quantity(row.free), 0);
        const heldGoodKinds = GOOD_KEYS.filter(good => profile.filters.includes(good) && quantity(stock?.[good]) > 0).length;
        return {
            id, label: profile.label, description: profile.description,
            capacity: profile.capacity, accepts: profile.filters.length,
            stores: stores.length, used, free, heldGoodKinds
        };
    });
    const stranded = GOOD_KEYS.filter(good => {
        if (quantity(stock?.[good]) <= 0) return false;
        const accepting = rows.reduce((sum, row) => sum + (row.filters.includes(good) ? quantity(row.free) : 0), 0);
        return accepting <= 0;
    }).slice(0, 3).map(good => ({
        good, label: labelFor(good), stored: quantity(stock?.[good])
    }));
    return {
        profiles, stranded,
        stores: rows.length,
        used: quantity(snapshot.used),
        capacity: quantity(snapshot.capacity),
        free: quantity(snapshot.free)
    };
}

/**
 * Staged counterpart of getProductionChainSnapshot(). The read model, ordering
 * and values are identical; one stage is derived per advance() so a mature
 * realm never spends one click frame checking every building and carrier order.
 */
export function createProductionChainSnapshotBuilder() {
    const chains = CHAIN_DEFINITIONS.map(chain => ({
        id: chain.id, label: chain.label, note: chain.note, stages: []
    }));
    let buildings = [];
    let stock = {};
    let warehouses = { free: 0, rows: [] };
    let chainIndex = 0;
    let stageIndex = 0;
    let failed = false;
    return {
        prepare() {
            try {
                buildings = aliveBuildings();
                stock = getPhysicalStockMap() || {};
                warehouses = getWarehouseSnapshot();
                if (!warehouses) failed = true;
            } catch { failed = true; }
        },
        get failed() { return failed; },
        advance() {
            if (failed || chainIndex >= CHAIN_DEFINITIONS.length) return true;
            const definition = CHAIN_DEFINITIONS[chainIndex];
            chains[chainIndex].stages.push(stageSnapshot(definition.stages[stageIndex], buildings, stock, warehouses));
            stageIndex++;
            if (stageIndex >= definition.stages.length) {
                chainIndex++;
                stageIndex = 0;
            }
            return chainIndex >= CHAIN_DEFINITIONS.length;
        },
        snapshot() { return { chains }; }
    };
}

/**
 * Staged counterpart of getWarehouseProfileSnapshot(). Profiles and stranded
 * goods are derived one bounded step at a time, in the same declared order.
 */
export function createWarehouseProfileSnapshotBuilder() {
    const profiles = [];
    const stranded = [];
    let snapshot = { rows: [] };
    let stock = {};
    let phase = 0;
    let profileIndex = 0;
    let goodIndex = 0;
    let failed = false;
    return {
        prepare() {
            try {
                snapshot = getWarehouseSnapshot();
                stock = getPhysicalStockMap() || {};
                if (!snapshot) failed = true;
            } catch { failed = true; }
        },
        get failed() { return failed; },
        advance() {
            if (failed) return true;
            const rows = snapshot.rows || [];
            if (phase === 0) {
                if (profileIndex < WAREHOUSE_PROFILE_IDS.length) {
                    const id = WAREHOUSE_PROFILE_IDS[profileIndex++];
                    const profile = WAREHOUSE_PROFILES[id];
                    if (!profile) { failed = true; return true; }
                    const stores = rows.filter(row => row.profile === id);
                    const used = stores.reduce((sum, row) => sum + quantity(row.used), 0);
                    const free = stores.reduce((sum, row) => sum + quantity(row.free), 0);
                    const heldGoodKinds = GOOD_KEYS.filter(good => profile.filters.includes(good) && quantity(stock?.[good]) > 0).length;
                    profiles.push({
                        id, label: profile.label, description: profile.description,
                        capacity: profile.capacity, accepts: profile.filters.length,
                        stores: stores.length, used, free, heldGoodKinds
                    });
                    return false;
                }
                phase = 1;
                goodIndex = 0;
            }
            if (phase === 1) {
                if (goodIndex < GOOD_KEYS.length) {
                    const good = GOOD_KEYS[goodIndex++];
                    if (quantity(stock?.[good]) > 0) {
                        const accepting = rows.reduce((sum, row) => sum + (row.filters.includes(good) ? quantity(row.free) : 0), 0);
                        if (accepting <= 0 && stranded.length < 3) {
                            stranded.push({ good, label: labelFor(good), stored: quantity(stock[good]) });
                        }
                    }
                    return false;
                }
                phase = 2;
            }
            return true;
        },
        snapshot() {
            const rows = snapshot.rows || [];
            return {
                profiles, stranded,
                stores: rows.length,
                used: quantity(snapshot.used),
                capacity: quantity(snapshot.capacity),
                free: quantity(snapshot.free)
            };
        }
    };
}

/** Explain a profile choice without mutating the store to test it. */
export function warehouseProfileHint(row, profileId) {
    const profile = WAREHOUSE_PROFILES[profileId];
    if (!row || !profile) return "";
    if (profileId === "general") return profile.description;
    const held = GOOD_KEYS.filter(good => !profile.filters.includes(good) && (
        quantity(row.stored?.[good]) > 0 || quantity(row.reservedIn?.[good]) > 0 || quantity(row.reservedOut?.[good]) > 0
    ));
    if (!held.length) return profile.description;
    return "Switch blocked while holding " + held.slice(0, 3).map(labelFor).join(", ") + (held.length > 3 ? " +" + (held.length - 3) : "");
}
