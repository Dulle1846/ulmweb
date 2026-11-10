// Crown supply: standing grain contracts, paid waterworks and the upgrade of
// timber cottages into stone houses. These are deliberate annual commitments,
// not free yield multipliers: grain is bought from open trade partners, the
// waterworks has a yearly payroll, and denser housing consumes the same food
// and services as any other household.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { addResource } from "./resources.js";
import { addLog } from "./events.js";
import { recordResourceMovement } from "./goods-book.js";
import { getTradePartners } from "./market.js";

export const CROWN_SUPPLY_VERSION = 1;
export const CROWN_SUPPLY_HISTORY_LIMIT = 24;
export const GRAIN_CONTRACTS = Object.freeze([
    Object.freeze({ level: 0, label: "No standing contract", target: 0, price: 0 }),
    Object.freeze({ level: 1, label: "Village tithe", target: 120, price: 1.25 }),
    Object.freeze({ level: 2, label: "Regional granary", target: 240, price: 1.2 }),
    Object.freeze({ level: 3, label: "Royal reserve", target: 420, price: 1.15 })
]);
export const WATERWORKS_LEVELS = Object.freeze([
    Object.freeze({ level: 0, label: "No public works", coverage: 0, setup: 0, upkeep: 0 }),
    Object.freeze({ level: 1, label: "Water carts", coverage: 0.4, setup: 35, upkeep: 18 }),
    Object.freeze({ level: 2, label: "Cistern network", coverage: 0.65, setup: 80, upkeep: 36 }),
    Object.freeze({ level: 3, label: "Aqueduct service", coverage: 0.9, setup: 140, upkeep: 58 })
]);
export const STONE_HOUSE_GOLD = 55;
export const STONE_HOUSE_GOLD_WITH_MASON = 42;

const integer = (value, min = 0, max = 1_000_000) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
const currentYear = () => Math.max(1, Math.floor(Number(state.year) || 1));
const currentTick = () => Math.max(0, Math.floor(Number(state.tick) || 0));
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));

export function createCrownSupplyState() {
    return {
        version: CROWN_SUPPLY_VERSION,
        grainLevel: 0,
        grainActiveYear: 0,
        lastGrainYear: 0,
        waterworksLevel: 0,
        waterworksActiveYear: 0,
        lastWaterworksYear: 0,
        lastSettledYear: 0,
        housingUpgrades: 0,
        lastHousingYear: 0,
        lastGrainBought: 0,
        lastGrainCost: 0,
        lastWaterworksCost: 0,
        history: []
    };
}

function normalizeHistoryEntry(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    return {
        year: integer(entry.year, 0),
        grainLevel: integer(entry.grainLevel, 0, 3),
        grainBought: integer(entry.grainBought, 0, 100000),
        grainCost: integer(entry.grainCost, 0, 100000),
        waterworksLevel: integer(entry.waterworksLevel, 0, 3),
        waterworksCost: integer(entry.waterworksCost, 0, 100000),
        housingUpgrades: integer(entry.housingUpgrades, 0, 100000)
    };
}

export function normalizeCrownSupplyState(input = state.crownSupply) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const fresh = createCrownSupplyState();
    state.crownSupply = {
        ...fresh,
        grainLevel: integer(source.grainLevel, 0, 3),
        grainActiveYear: integer(source.grainActiveYear, 0),
        lastGrainYear: integer(source.lastGrainYear, 0),
        waterworksLevel: integer(source.waterworksLevel, 0, 3),
        waterworksActiveYear: integer(source.waterworksActiveYear, 0),
        lastWaterworksYear: integer(source.lastWaterworksYear, 0),
        lastSettledYear: integer(source.lastSettledYear, 0),
        housingUpgrades: integer(source.housingUpgrades, 0),
        lastHousingYear: integer(source.lastHousingYear, 0),
        lastGrainBought: integer(source.lastGrainBought, 0),
        lastGrainCost: integer(source.lastGrainCost, 0),
        lastWaterworksCost: integer(source.lastWaterworksCost, 0),
        history: (Array.isArray(source.history) ? source.history : []).map(normalizeHistoryEntry).filter(Boolean).slice(0, CROWN_SUPPLY_HISTORY_LIMIT)
    };
    return state.crownSupply;
}

export function ensureCrownSupply() {
    if (state.crownSupply?.version === CROWN_SUPPLY_VERSION && Array.isArray(state.crownSupply.history)) return state.crownSupply;
    return normalizeCrownSupplyState(state.crownSupply);
}

function grainContract(level) {
    return GRAIN_CONTRACTS[integer(level, 0, 3)] || GRAIN_CONTRACTS[0];
}
function waterworks(level) {
    return WATERWORKS_LEVELS[integer(level, 0, 3)] || WATERWORKS_LEVELS[0];
}
function nonWarPartners() {
    const warRealms = new Set((state.diplomacy?.realms || []).filter(realm => realm?.treaty === "war").map(realm => String(realm.id)));
    return getTradePartners().filter(partner => partner && !warRealms.has(String(partner.id)) && Number(partner.stock?.food) > 0);
}

export function getCrownGrainTarget(level = ensureCrownSupply().grainLevel) {
    const contract = grainContract(level);
    if (!contract.level) return 0;
    const population = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length;
    return Math.max(contract.target, Math.round(population * 4 + 60));
}

export function getCrownWaterCoverage() {
    const supply = ensureCrownSupply();
    if (!supply.waterworksLevel || supply.waterworksActiveYear < currentYear()) return 0;
    return waterworks(supply.waterworksLevel).coverage;
}

export function getCrownSupplySnapshot() {
    const supply = ensureCrownSupply();
    const grain = grainContract(supply.grainLevel);
    const water = waterworks(supply.waterworksLevel);
    const partners = nonWarPartners();
    const timberCottages = state.entities.filter(entity => !entity.dead && entity.type === TYPE.HOUSE && (!entity.construction || Number(entity.construction.stage) >= 3)).length;
    const stoneHouses = state.entities.filter(entity => !entity.dead && entity.type === TYPE.STONE_HOUSE && (!entity.construction || Number(entity.construction.stage) >= 3)).length;
    const mason = state.entities.some(entity => !entity.dead && entity.type === TYPE.MASON && (!entity.construction || Number(entity.construction.stage) >= 3));
    return {
        grainLevel: supply.grainLevel,
        grainLabel: grain.label,
        grainTarget: getCrownGrainTarget(supply.grainLevel),
        grainPrice: grain.price,
        grainActive: supply.grainActiveYear >= currentYear(),
        grainRouteOpen: partners.length > 0,
        grainPartners: partners.length,
        waterworksLevel: supply.waterworksLevel,
        waterworksLabel: water.label,
        waterworksCoverage: getCrownWaterCoverage(),
        waterworksActive: supply.waterworksActiveYear >= currentYear(),
        waterworksUpkeep: water.upkeep,
        waterworksSetup: water.setup,
        timberCottages,
        stoneHouses,
        housingCost: mason ? STONE_HOUSE_GOLD_WITH_MASON : STONE_HOUSE_GOLD,
        mason,
        housingUpgrades: supply.housingUpgrades,
        lastGrainBought: supply.lastGrainBought,
        lastGrainCost: supply.lastGrainCost,
        lastWaterworksCost: supply.lastWaterworksCost,
        history: supply.history.slice(0, 8)
    };
}

function record(entry) {
    const supply = ensureCrownSupply();
    supply.history.unshift(entry);
    supply.history = supply.history.slice(0, CROWN_SUPPLY_HISTORY_LIMIT);
    return entry;
}

function buyFoodToTarget(target) {
    let remaining = Math.max(0, Math.ceil(target - (Number(state.resources.food) || 0)));
    if (remaining <= 0) return { bought: 0, cost: 0 };
    const supply = ensureCrownSupply();
    const contract = grainContract(supply.grainLevel);
    const partners = nonWarPartners().sort((a, b) => Number(b.stock.food) - Number(a.stock.food));
    let bought = 0;
    let cost = 0;
    // Never spend the garrison's payroll on grain. Without this reserve the
    // contract emptied the treasury, soldiers deserted, and the war front
    // turned a food policy into a game-over.
    const soldiers = state.entities.filter(entity => !entity.dead && [TYPE.GUARD, TYPE.ARCHER, TYPE.KNIGHT].includes(entity.type)).length;
    const payrollReserve = 60 + soldiers * 8;
    const budget = Math.max(0, (Number(state.resources.gold) || 0) - payrollReserve);
    let spent = 0;
    // A partner cart carries at most 25 units. Walk the partners repeatedly so
    // a 240-food reserve is actually filled instead of stopping after one
    // cartload from each route.
    for (let pass = 0; pass < 16 && remaining > 0; pass++) {
        let boughtThisPass = 0;
        for (const partner of partners) {
            if (remaining <= 0) break;
            const stock = Math.max(0, Math.floor(Number(partner.stock.food) || 0));
            const quantity = Math.min(25, remaining, stock);
            if (quantity <= 0) continue;
            const price = Math.ceil(quantity * contract.price);
            if (spent + price > budget) break;
            if ((Number(state.resources.gold) || 0) < price) break;
            addResource("gold", -price);
            addResource("food", quantity);
            partner.stock.food = stock - quantity;
            remaining -= quantity;
            bought += quantity;
            boughtThisPass += quantity;
            cost += price;
            spent += price;
            state.market = state.market || {};
            state.market.totalTrades = (Number(state.market.totalTrades) || 0) + 1;
            state.market.totalGoldTraded = (Number(state.market.totalGoldTraded) || 0) + price;
            recordResourceMovement("food", quantity, "crown-grain-contract", {
                from: { kind: "market", id: partner.id },
                to: { kind: "realm", id: "royal-stores" }
            });
        }
        if (!boughtThisPass) break;
    }
    return { bought, cost };
}

export function setGrainContract(level) {
    const supply = ensureCrownSupply();
    const next = integer(level, 0, 3);
    if (next === 0) {
        supply.grainLevel = 0;
        supply.grainActiveYear = 0;
        addLog("THE STANDING GRAIN CONTRACT WAS ENDED", "#b99a9a", "economy");
        return { ok: true, message: "Grain contract ended", snapshot: getCrownSupplySnapshot() };
    }
    const partners = nonWarPartners();
    if (!partners.length) return { ok: false, reason: "no-open-grain-route" };
    supply.grainLevel = next;
    supply.grainActiveYear = currentYear();
    supply.lastGrainYear = currentYear();
    const result = buyFoodToTarget(getCrownGrainTarget(next));
    supply.lastGrainBought = result.bought;
    supply.lastGrainCost = result.cost;
    record({ year: currentYear(), tick: currentTick(), grainLevel: next, grainBought: result.bought, grainCost: result.cost, waterworksLevel: supply.waterworksLevel, waterworksCost: 0, housingUpgrades: 0 });
    addLog("GRAIN CONTRACT " + next + " OPENED · " + result.bought + " FOOD FOR " + result.cost + " GOLD", "#d8c18a", "economy");
    return { ok: true, message: "Grain contract " + next + " opened", bought: result.bought, cost: result.cost, snapshot: getCrownSupplySnapshot() };
}

export function setWaterworks(level) {
    const supply = ensureCrownSupply();
    const next = integer(level, 0, 3);
    if (next === 0) {
        supply.waterworksLevel = 0;
        supply.waterworksActiveYear = 0;
        addLog("THE PUBLIC WATERWORKS WERE CLOSED", "#b99a9a", "economy");
        return { ok: true, message: "Waterworks closed", snapshot: getCrownSupplySnapshot() };
    }
    const definition = waterworks(next);
    const previous = waterworks(supply.waterworksLevel);
    const setup = next > supply.waterworksLevel ? definition.setup : Math.ceil(definition.setup * 0.25);
    if ((Number(state.resources.gold) || 0) < setup) return { ok: false, reason: "not-enough-gold" };
    addResource("gold", -setup);
    supply.waterworksLevel = next;
    supply.waterworksActiveYear = currentYear();
    supply.lastWaterworksYear = currentYear();
    supply.lastWaterworksCost = setup;
    record({ year: currentYear(), tick: currentTick(), grainLevel: supply.grainLevel, grainBought: 0, grainCost: 0, waterworksLevel: next, waterworksCost: setup, housingUpgrades: 0 });
    addLog("PUBLIC WATERWORKS " + next + " COMMISSIONED · " + setup + " GOLD", "#8bb7c9", "economy");
    return { ok: true, message: "Waterworks " + definition.label + " commissioned", cost: setup, previous: previous.label, snapshot: getCrownSupplySnapshot() };
}

export function upgradeHousingStock() {
    const supply = ensureCrownSupply();
    const house = state.entities.find(entity => !entity.dead && entity.type === TYPE.HOUSE && (!entity.construction || Number(entity.construction.stage) >= 3));
    if (!house) return { ok: false, reason: "no-timber-cottage-to-upgrade" };
    const cost = getCrownSupplySnapshot().housingCost;
    if ((Number(state.resources.gold) || 0) < cost) return { ok: false, reason: "not-enough-gold" };
    addResource("gold", -cost);
    house.type = TYPE.STONE_HOUSE;
    house.maxHp = Math.max(Number(house.maxHp) || 0, 140);
    house.hp = Math.max(Number(house.hp) || 0, Math.min(house.maxHp, 120));
    house.housingUpgradeYear = currentYear();
    supply.housingUpgrades++;
    supply.lastHousingYear = currentYear();
    record({ year: currentYear(), tick: currentTick(), grainLevel: supply.grainLevel, grainBought: 0, grainCost: cost, waterworksLevel: supply.waterworksLevel, waterworksCost: 0, housingUpgrades: 1 });
    addLog("A TIMBER COTTAGE WAS REBUILT IN STONE · +2 HOUSEHOLD PLACES", "#d8c18a", "economy");
    return { ok: true, message: "Timber cottage rebuilt in stone", cost, capacity: 2, snapshot: getCrownSupplySnapshot() };
}

export function settleCrownSupply() {
    const supply = ensureCrownSupply();
    const year = currentYear();
    if (supply.lastSettledYear >= year) return null;
    supply.lastSettledYear = year;
    let waterworksCost = 0;
    if (supply.waterworksLevel > 0) {
        const definition = waterworks(supply.waterworksLevel);
        if (supply.lastWaterworksYear < year) {
            if ((Number(state.resources.gold) || 0) >= definition.upkeep) {
                addResource("gold", -definition.upkeep);
                waterworksCost = definition.upkeep;
                supply.lastWaterworksYear = year;
                supply.waterworksActiveYear = year;
            } else {
                supply.waterworksActiveYear = 0;
                addLog("THE WATERWORKS PAYROLL COULD NOT BE MET — SERVICE SUSPENDED", "#e9857b", "economy");
            }
        }
    }
    let grainBought = 0;
    let grainCost = 0;
    if (supply.grainLevel > 0 && supply.lastGrainYear < year) {
        // The contract remains active across years. Keeping grainActiveYear at
        // the signing year made the first shipment the only one ever bought.
        supply.grainActiveYear = year;
        const result = buyFoodToTarget(getCrownGrainTarget(supply.grainLevel));
        grainBought = result.bought;
        grainCost = result.cost;
        supply.lastGrainYear = year;
        supply.lastGrainBought = grainBought;
        supply.lastGrainCost = grainCost;
    }
    if (grainBought || grainCost || waterworksCost) {
        record({ year, tick: currentTick(), grainLevel: supply.grainLevel, grainBought, grainCost, waterworksLevel: supply.waterworksLevel, waterworksCost, housingUpgrades: 0 });
        addLog("CROWN SUPPLY SETTLED · " + grainBought + " FOOD · " + grainCost + " GRAIN GOLD · " + waterworksCost + " WATERWORKS", "#c9b17a", "economy");
    }
    return { grainBought, grainCost, waterworksCost };
}
