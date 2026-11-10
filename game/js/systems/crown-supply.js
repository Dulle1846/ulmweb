// Crown supply: standing grain contracts, paid waterworks and the upgrade of
// timber cottages into stone houses. These are deliberate annual commitments,
// not free yield multipliers: grain is bought from open trade partners, the
// waterworks has a yearly payroll, and denser housing consumes the same food
// and services as any other household.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { addResource } from "./resources.js";
import { addLog } from "./events.js";
import { recordResourceMovement } from "./goods-book.js";import { ensureInventory, getPhysicalStock, recordGoodMovement } from "./logistics.js";
import { getTradePartners, executeTrade } from "./market.js";

export const CROWN_SUPPLY_VERSION = 2;
export const CROWN_SUPPLY_HISTORY_LIMIT = 24;
// A resident eats 0.015 food per day in the 20-day ledger, and a year is
// twenty ledgers: six food per resident per year. A soldier eats two food per
// year. The reserve target is expressed in these real annual rations, not in
// an arbitrary flat number, so "two years" means the same thing at any size.
export const POPULATION_FOOD_PER_YEAR = 6;
export const GARRISON_FOOD_PER_SOLDIER = 2;
export const COMMISSARY_KEEP = Object.freeze({ wood: 600, stone: 600 });
export const COMMISSARY_BARTER = Object.freeze({ wood: 2, stone: 3 });
export const GRAIN_CONTRACTS = Object.freeze([
   Object.freeze({ level: 0, label: "No standing contract", target: 0, reserveYears: 0, price: 0 }),
   Object.freeze({ level: 1, label: "Village tithe", target: 120, reserveYears: 1.5, price: 1.25 }),
   Object.freeze({ level: 2, label: "Regional granary", target: 240, reserveYears: 2.5, price: 1.2 }),
   Object.freeze({ level: 3, label: "Royal reserve", target: 420, reserveYears: 3.5, price: 1.15 }),
   // The war granary is the only tier whose target follows the realm's actual
   // annual demand. It exists for a standing army that must keep two years of
   // rations in hand while still paying its soldiers.
   Object.freeze({ level: 4, label: "Royal war granary", target: 420, reserveYears: 2.5, price: 1.1 })
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
        lastGrainSeason: 0,
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
        tick: integer(entry.tick, 0),
        grainLevel: integer(entry.grainLevel, 0, 4),
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
        grainLevel: integer(source.grainLevel, 0, 4),
        grainActiveYear: integer(source.grainActiveYear, 0),
        lastGrainYear: integer(source.lastGrainYear, 0),
        lastGrainSeason: integer(source.lastGrainSeason, 0),
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
    return GRAIN_CONTRACTS[integer(level, 0, 4)] || GRAIN_CONTRACTS[0];
}
function waterworks(level) {
    return WATERWORKS_LEVELS[integer(level, 0, 3)] || WATERWORKS_LEVELS[0];
}
function nonWarPartners() {
    const warRealms = new Set((state.diplomacy?.realms || []).filter(realm => realm?.treaty === "war").map(realm => String(realm.id)));
    return getTradePartners().filter(partner => partner && !warRealms.has(String(partner.id)) && Number(partner.stock?.food) > 0);
}

export function getCrownAnnualFoodDemand() {
    const population = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length;
    const soldiers = state.entities.filter(entity => !entity.dead && [TYPE.GUARD, TYPE.ARCHER, TYPE.KNIGHT].includes(entity.type));
    const mounted = soldiers.filter(entity => entity.military?.mounted).length;
    return Math.max(1, Math.round((population * POPULATION_FOOD_PER_YEAR + soldiers.length * GARRISON_FOOD_PER_SOLDIER + mounted * GARRISON_FOOD_PER_SOLDIER) * 100) / 100);
}

export function getCrownReserveYears(food = state.resources.food) {
    return Math.max(0, Number(food) || 0) / getCrownAnnualFoodDemand();
}

export function getCrownGrainTarget(level = ensureCrownSupply().grainLevel) {
    const contract = grainContract(level);
    if (!contract.level) return 0;
    const population = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length;
    const base = Math.max(contract.target, Math.round(population * 4 + 60));
    if (contract.level < 4) return base;
    return Math.max(base, Math.ceil(getCrownAnnualFoodDemand() * contract.reserveYears));
}

export function getCrownWaterCoverage() {
    const supply = ensureCrownSupply();
    if (!supply.waterworksLevel || supply.waterworksActiveYear < currentYear()) return 0;
    return waterworks(supply.waterworksLevel).coverage;
}

function openTradePartners() {
    const warRealms = new Set((state.diplomacy?.realms || []).filter(realm => realm?.treaty === "war").map(realm => String(realm.id)));
    return getTradePartners().filter(partner => partner && !warRealms.has(String(partner.id)));
}

// The crown calls in grain already held by farms and warehouses before it
// spends coin or goods. This is a transfer of the harvest, not a new yield.
export function requisitionGranary() {
    const supply = ensureCrownSupply();
    if (supply.grainLevel < 4) return { requisitioned: 0 };
    const target = getCrownGrainTarget(4);
    let remaining = Math.max(0, Math.ceil(target - (Number(state.resources.food) || 0)));
    if (remaining <= 0) return { requisitioned: 0 };
    let requisitioned = 0;
    for (const entity of state.entities) {
        if (remaining <= 0) break;
        if (entity.dead || !entity.isBuilding?.()) continue;
        const inventory = ensureInventory(entity);
        if (!inventory) continue;
        const stored = Math.min(remaining, Math.max(0, Math.floor(Number(inventory.output?.grain) || 0) - Math.floor(Number(inventory.reservedOut?.grain) || 0)));
        if (stored > 0) {
            inventory.output.grain -= stored;
            addResource("food", stored);
            recordGoodMovement({ type: "consumed", good: "grain", quantity: stored, from: { kind: "building", id: entity.id }, cause: "war-granary-requisition", key: "grain:requisition:" + currentTick() });
            requisitioned += stored;
            remaining -= stored;
        }
    }
    if (requisitioned > 0) addLog("THE WAR GRANARY CALLED IN " + requisitioned + " GRAIN FROM THE HARVEST", "#d8c18a", "economy");
    return { requisitioned };
}

// The commissary is the player's answer to a rich-in-goods, poor-in-coin
// military realm: surplus timber and stone above the construction reserve are
// sold through the existing market, and the proceeds buy grain. It costs real
// building material, never creates food, and runs only when the player asks.
export function provisionGranary() {
    const supply = ensureCrownSupply();
    if (!supply.grainLevel) return { ok: false, reason: "no-grain-contract" };
    const target = getCrownGrainTarget(supply.grainLevel);
    const shortfall = Math.ceil(target - (Number(state.resources.food) || 0));
    if (shortfall <= 0) return { ok: false, reason: "granary-already-full" };
    const requisition = requisitionGranary();
    const remainingAfterHarvest = Math.max(0, Math.ceil(target - (Number(state.resources.food) || 0)));
    if (remainingAfterHarvest <= 0) {
        return { ok: true, requisitioned: requisition.requisitioned, bought: 0, cost: 0, bartered: 0, soldWood: 0, soldStone: 0, goldRaised: 0, snapshot: getCrownSupplySnapshot() };
    }
    const contract = grainContract(supply.grainLevel);
    const soldiers = state.entities.filter(entity => !entity.dead && [TYPE.GUARD, TYPE.ARCHER, TYPE.KNIGHT].includes(entity.type)).length;
    const payrollReserve = 60 + soldiers * 8;
    const availableFood = nonWarPartners().reduce((total, partner) => total + Math.max(0, Math.floor(Number(partner.stock?.food) || 0)), 0);
    // An emergency draw may use the last building material: a realm below one
    // year of rations trades its construction reserve for grain.
    const emergency = supply.grainLevel >= 4 && getCrownReserveYears() < 1;
    const keep = emergency ? { wood: 0, stone: 0 } : COMMISSARY_KEEP;
    let soldWood = 0, soldStone = 0, goldRaised = 0;
    let bought = { bought: 0, cost: 0 };
    if (availableFood > 0) {
        const neededGold = Math.max(0, Math.ceil(remainingAfterHarvest * contract.price) + payrollReserve - (Number(state.resources.gold) || 0));
        if (neededGold > 0) {
            const partners = openTradePartners();
            const surplus = {
                wood: Math.max(0, Math.floor(Number(state.resources.wood) || 0) - keep.wood),
                stone: Math.max(0, Math.floor(Number(state.resources.stone) || 0) - keep.stone)
            };
            // Stone sells for more, so it is liquidated first; the construction
            // reserve keeps enough of both for the next building project.
            for (let trade = 0; trade < 80 && goldRaised < neededGold; trade++) {
                const resource = surplus.stone >= 25 ? "stone" : surplus.wood >= 25 ? "wood" : null;
                if (!resource) break;
                let sale = null;
                for (const partner of partners) {
                    const result = executeTrade(partner.id, resource, "sell", 25);
                    if (result.ok) { sale = result; break; }
                }
                if (!sale) break;
                surplus[resource] -= 25;
                if (resource === "stone") soldStone += 25; else soldWood += 25;
                goldRaised += sale.gold;
            }
        }
        bought = buyFoodToTarget(target);
    }
    // The war granary also accepts goods in kind when the coin treasury is
    // empty and the trade roads have no grain left. This is a barter against
    // real building material above the construction reserve, not a yield
    // increase: the realm trades goods for grain and keeps its reserve.
    let bartered = 0, barteredStone = 0, barteredWood = 0;
    if (supply.grainLevel > 0) {
        let remaining = Math.max(0, Math.ceil(target - (Number(state.resources.food) || 0)));
        for (const resource of ["stone", "wood"]) {
            if (remaining <= 0) break;
            const rate = COMMISSARY_BARTER[resource];
            const surplus = Math.max(0, Math.floor(Number(state.resources[resource]) || 0) - keep[resource]);
            const amount = Math.min(remaining, Math.floor(surplus / rate));
            if (amount <= 0) continue;
            addResource(resource, -amount * rate);
            addResource("food", amount);
            if (resource === "stone") barteredStone += amount * rate; else barteredWood += amount * rate;
            bartered += amount;
            remaining -= amount;
        }
    }
    const totalBought = bought.bought + bartered;
    if (goldRaised > 0 || totalBought > 0) {
        record({ year: currentYear(), tick: currentTick(), grainLevel: supply.grainLevel, grainBought: totalBought, grainCost: bought.cost, waterworksLevel: supply.waterworksLevel, waterworksCost: 0, housingUpgrades: 0 });
        addLog("GRANARY PROVISIONED · SOLD " + soldWood + " WOOD + " + soldStone + " STONE · " + totalBought + " FOOD SECURED" + (bartered ? " · " + bartered + " BARTERED" : ""), "#d8c18a", "economy");
    }
    return {
        ok: totalBought > 0 || goldRaised > 0,
        reason: totalBought > 0 || goldRaised > 0 ? undefined : "no-grain-available",
        soldWood, soldStone, goldRaised, bought: bought.bought, cost: bought.cost,
        requisitioned: requisition.requisitioned, bartered, barteredStone, barteredWood, emergency,
        snapshot: getCrownSupplySnapshot()
    };
}

export function getCrownSupplySnapshot() {
    const supply = ensureCrownSupply();
    const grain = grainContract(supply.grainLevel);
    const emergency = getCrownReserveYears() < 1 && supply.grainLevel >= 4;
    const keep = emergency ? { wood: 0, stone: 0 } : COMMISSARY_KEEP;
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
        annualDemand: getCrownAnnualFoodDemand(),
        reserveYears: getCrownReserveYears(),
        commissary: {
            keep,
            emergency,
            grain: getPhysicalStock("grain"),
            wood: Math.max(0, Math.floor(Number(state.resources.wood) || 0) - keep.wood),
            stone: Math.max(0, Math.floor(Number(state.resources.stone) || 0) - keep.stone),
            shortfall: Math.max(0, Math.ceil(getCrownGrainTarget(supply.grainLevel) - (Number(state.resources.food) || 0)))
        },
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
    const next = integer(level, 0, 4);
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

// A standing contract delivers grain in four seasonal shipments. Settling only
// once at the year boundary let the granary drain for a full year before the
// next purchase, so a reserve that was filled in spring was nearly empty by
// winter even though the treasury could have bought grain in summer.
export function settleCrownSupply() {
    const supply = ensureCrownSupply();
    const year = currentYear();
    const seasonKey = year * 4 + Math.max(0, Math.min(3, Math.floor(Number(state.seasonIndex) || 0)));
    const waterworksDue = supply.lastSettledYear < year;
    // The regional tiers keep their annual delivery; the war granary is the
    // only tier that receives four seasonal shipments.
    const quarterly = supply.grainLevel >= 4;
    const grainDue = supply.grainLevel > 0 && (quarterly ? supply.lastGrainSeason < seasonKey : supply.lastGrainYear < year);
    if (!waterworksDue && !grainDue) return null;
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
    if (grainDue) {
        // The contract remains active across years. Keeping grainActiveYear at
        // the signing year made the first shipment the only one ever bought.
        supply.grainActiveYear = year;
        const result = buyFoodToTarget(getCrownGrainTarget(supply.grainLevel));
        grainBought = result.bought;
        grainCost = result.cost;
        supply.lastGrainYear = year;
        supply.lastGrainSeason = seasonKey;
        supply.lastGrainBought = grainBought;
        supply.lastGrainCost = grainCost;
    }
    if (grainBought || grainCost || waterworksCost) {
        record({ year, tick: currentTick(), grainLevel: supply.grainLevel, grainBought, grainCost, waterworksLevel: supply.waterworksLevel, waterworksCost, housingUpgrades: 0 });
        addLog("CROWN SUPPLY SETTLED · " + grainBought + " FOOD · " + grainCost + " GRAIN GOLD · " + waterworksCost + " WATERWORKS", "#c9b17a", "economy");
    }
    return { grainBought, grainCost, waterworksCost };
}
