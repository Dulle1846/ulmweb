// Building production and recurring settlement income. Physical producers
// place goods into their local stores; logistics carriers move them to a
// warehouse or consumer. Only bread is converted to the royal food ledger at
// the warehouse, after the carrier has actually delivered it.
import { TYPE } from "../core/types.js";
import { state } from "../core/state.js";
import { getEntitiesOfType } from "../world/entities.js";
import { addResource } from "../systems/resources.js";
import { getWorkforceSnapshot, getBuildingEfficiency } from "../systems/economy.js";
import { RECIPES, REGIONAL_TIMBER_KEYS, REGIONAL_TIMBER_SET } from "../systems/city-config.js";
import {
    ensureInventory, addLocalOutput, getAvailableOutput, getInputCapacity, getPhysicalStock,
    requestSupply, requestTimberSupply, requestHaul, getBuildingSupplyReason, outputSpace, recordGoodMovement,
    findLocalWarehouse, consumeFromWarehouse
} from "../systems/logistics.js";
import { regionalTimberGood, signatureTimberForRegionalType } from "../world/regional-forests.js";
import { findNearestResourceNode, getForestHabitatAt, harvestForest, extractStone } from "../systems/resource-geography.js";
import { getHazardExtractionFactor } from "../systems/hazard-modifiers.js";

import { recordResourceMovement } from "../systems/goods-book.js";

const PRODUCTION_INTERVAL = 6;
const CIVIC_INTERVAL = 55;
// Ask for a cartload instead of only the next batch. A mill that requests two
// grain every recipe consumes them before the carrier has walked back, which
// starved every downstream bakery no matter how much grain sat in a store.
const SUPPLY_BATCH = 12;
// Production ceilings keep the settlement from mining, pumping and sawing
// until every store is full. Each good is produced until this much exists
// across stores and carriers; construction and consumption create room again.
const recipeEntries = new WeakMap();
function entriesFor(recipe) {
    let entries = recipeEntries.get(recipe);
    if (!entries) {
        entries = {
            input: Object.entries(recipe.input || {}),
            output: Object.entries(recipe.output || {})
        };
        recipeEntries.set(recipe, entries);
    }
    return entries;
}
// Every physical good has a bounded production ceiling. Regional timbers get
// a smaller one: they are a specialty stream beside the ordinary log chain,
// not a second bulk timber economy.
const stockTargetList = {
    logs: 80, planks: 60, firewood: 50, stoneBlocks: 60, cutStone: 60,
    water: 40, grain: 120, flour: 40, ale: 40
};
// A regional type and its effects depend on the tile, seed, climate and base
// formation, never on the current stock. Cache that immutable subset so a
// lumber camp does not rebuild a full forest stand after every harvest batch.
// The cache is bounded and keyed by the world seed; camp sites are static.
const REGIONAL_SITE_CACHE = new Map();
const REGIONAL_SITE_CACHE_LIMIT = 4096;
function regionalForestAt(x, y) {
    const key = (Number(state.worldSeed) || 1) + ":" + Math.floor(x) + ":" + Math.floor(y);
    const cached = REGIONAL_SITE_CACHE.get(key);
    if (cached !== undefined) return cached;
    const habitat = getForestHabitatAt(Math.floor(x), Math.floor(y));
    const stand = habitat?.forestStand || null;
    const value = stand ? Object.freeze({
        effects: stand.regionalEffects || null,
        type: stand.regionalType || null,
        timberFactor: Number(stand.dynamics?.silviculture?.timberFactor) || 1,
        system: stand.dynamics?.silviculture?.system || null,
    }) : null;
    if (REGIONAL_SITE_CACHE.size >= REGIONAL_SITE_CACHE_LIMIT) REGIONAL_SITE_CACHE.clear();
    REGIONAL_SITE_CACHE.set(key, value);
    return value;
}
for (const good of REGIONAL_TIMBER_KEYS) stockTargetList[good] = 18;
const STOCK_TARGETS = Object.freeze(stockTargetList);

function ledger() {
    const economy = state.economy || (state.economy = {});
    const production = economy.productionChains || (economy.productionChains = {});
    for (const key of ["logsHarvested", "stoneExtracted", "planksProduced", "flourProduced", "breadProduced", "waterDrawn", "grainHarvested", "farmFood", "farmFoodBooked", "millWoodConsumed", "millBonusFood", "tavernFoodConsumed", "tavernGoldProduced", "aleBrewed", "aleConsumed", "regionalTimberProduced"]) {
        production[key] = Math.max(0, Number(production[key]) || 0);
    }
    return production;
}

// Producers ask for a haul when they finish a batch, but a producer whose
// output store is already full never reaches that code again. Sweeping stored
// output every production tick breaks that deadlock without creating
// duplicate jobs (requestHaul refuses a second job for the same good).
function requestStoredHauls(building) {
    const recipe = RECIPES[building.type];
    if (!recipe?.output) return;
    for (const good of Object.keys(recipe.output)) {
        const available = getAvailableOutput(building, good);
        if (available > 0) requestHaul(building, good, available);
    }
}

function canWork(building, workforce) {
    return !building.construction || building.construction.stage >= 3
        ? getBuildingEfficiency(building, workforce) > 0
        : false;
}

function requestInputs(building) {
    const recipe = RECIPES[building.type];
    if (!recipe?.input) return true;
    const inventory = ensureInventory(building);
    for (const [good, amount] of entriesFor(recipe).input) {
        const available = Math.max(0, Number(inventory?.input?.[good]) || 0);
        if (available < amount) {
            const target = Math.min(SUPPLY_BATCH, getInputCapacity(building.type));
            requestSupply(building, good, Math.max(amount, target) - available);
            return false;
        }
    }
    return true;
}

function consumeInputs(building) {
    const recipe = RECIPES[building.type];
    const inventory = ensureInventory(building);
    for (const [good, amount] of entriesFor(recipe).input) {
        if (inventory.input[good] < amount) return false;
    }
    for (const [good, amount] of entriesFor(recipe).input) {
        inventory.input[good] -= amount;
        recordGoodMovement({
            type: "consumed", good, quantity: amount,
            from: { kind: "building", id: building.id }, to: { kind: "recipe", id: recipe.label },
            cause: "recipe-input"
        });
    }
    return true;
}

function finishOutput(building, output, production) {
    const recipe = RECIPES[building.type];
    for (const [good, amount] of Object.entries(output)) {
        const accepted = addLocalOutput(building, good, amount, { cause: "recipe-output" });
        if (accepted > 0) {
            if (good === "logs") production.logsHarvested += accepted;
            else if (good === "planks") production.planksProduced += accepted;
            else if (good === "flour") production.flourProduced += accepted;
            else if (good === "bread") production.breadProduced += accepted;
            else if (good === "water") production.waterDrawn += accepted;
            else if (good === "grain") production.grainHarvested += accepted;
            else if (good === "ale") production.aleBrewed += accepted;
            else if (REGIONAL_TIMBER_SET.has(good)) {
                production.regionalTimberProduced = Math.max(0, Number(production.regionalTimberProduced) || 0) + accepted;
            }
            requestHaul(building, good, getAvailableOutput(building, good));
        }
    }
}

// The sawmill has two real recipes. Logs keep their shipped yield byte for
// byte; a named regional timber is sawn by its own density. The plan is read
// only from the mill's own input store, so no warehouse is scanned per tick.
function bestStoredTimber(inventory) {
    let best = null, bestPlanks = 0;
    for (const good of REGIONAL_TIMBER_KEYS) {
        if (Math.max(0, Number(inventory?.input?.[good]) || 0) < 2) continue;
        const def = regionalTimberGood(good);
        const planks = def?.planks || 1;
        if (planks <= bestPlanks) continue;
        best = good; bestPlanks = planks;
    }
    return best;
}

function planSawBatch(building) {
    const inventory = ensureInventory(building);
    // A regional timber already delivered to the bench is sawn first: it is
    // the specialty product the player asked for, and every regional board
    // yields at least the ordinary plank batch. Logs remain the fallback for
    // every realm and every old save that has no regional timber at all.
    const good = bestStoredTimber(inventory);
    if (good) {
        const def = regionalTimberGood(good);
        return {
            good, amount: 2,
            output: { planks: def.planks, firewood: def.firewoodYield },
        };
    }
    if (Math.max(0, Number(inventory?.input?.logs) || 0) >= 2) {
        return { good: "logs", amount: 2, output: { planks: 2, firewood: 1 } };
    }
    return null;
}

function sawSupplyPhase(building) {
    const id = String(building.id ?? "");
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    return (Math.floor(state.tick / PRODUCTION_INTERVAL) + Math.abs(hash)) % 5;
}

// Logs stay the primary supply order. Every fifth order asks for a reachable
// regional timber so the specialty recipe actually runs in a mature realm
// without starving the ordinary log chain. If no timber is stored, the order
// falls back to logs in the same tick.
function requestSawInputs(building) {
    if (sawSupplyPhase(building) === 0 && requestTimberSupply(building, REGIONAL_TIMBER_KEYS)) return false;
    if (requestSupply(building, "logs", SUPPLY_BATCH)) return false;
    requestTimberSupply(building, REGIONAL_TIMBER_KEYS);
    return false;
}

function consumeSawInput(building, plan) {
    const inventory = ensureInventory(building);
    const available = Math.max(0, Number(inventory.input[plan.good]) || 0);
    const amount = Math.min(plan.amount, available);
    if (amount < plan.amount) return false;
    inventory.input[plan.good] -= amount;
    recordGoodMovement({
        type: "consumed", good: plan.good, quantity: amount,
        from: { kind: "building", id: building.id }, to: { kind: "recipe", id: RECIPES[building.type].label },
        cause: "recipe-input"
    });
    return true;
}

function canStoreOutput(building, output) {
    let required = 0;
    for (const key in output) required += Math.max(0, Number(output[key]) || 0);
    return outputSpace(building) >= required;
}

function produceRecipe(building, workforce, production, knownEfficiency = null, extractionFactor = 1) {
    const recipe = RECIPES[building.type];
    if (!recipe || recipe.field) return;
    // Unique workshops have no bulk output. Their inputs, workers and finished
    // records are handled on the bounded craft cadence.
    if (recipe.unique) {
        building.productionReason = building.productionReason || "Awaiting workshop stock";
        return;
    }
    // getBuildingEfficiency is zero for an unfinished site and for an
    // unstaffed building, so the old canWork() call was a second evaluation of
    // the same function. Reuse the caller's value for the batch and for the
    // construction yield below.
    const workEfficiency = knownEfficiency === null || knownEfficiency === undefined
        ? getBuildingEfficiency(building, workforce)
        : knownEfficiency;
    if (workEfficiency <= 0) {
        building.productionReason = building.construction && building.construction.stage < 3 ? "Under construction" : "No staff assigned";
        return;
    }
    ensureInventory(building);
    // The Forester's Lodge is a stewardship building: fields.js plants and
    // tends stock. Its catalogue entry keeps site:"forest" for placement,
    // but must never run the Lumber Yard's zero-batch harvest path.
    if (building.type === TYPE.FORESTER) {
        building.productionReason = building.foresterReason || "Tending the forest";
        return;
    }
    // The saw bench decides its recipe from the input store before the stock
    // ceiling is applied, because a regional hardwood yields a different plank
    // count than the ordinary log batch.
    const sawBatch = building.type === TYPE.SAWMILL ? planSawBatch(building) : null;
    if (building.type === TYPE.SAWMILL && !sawBatch) {
        requestSawInputs(building);
        building.productionReason = getBuildingSupplyReason(building) || "Waiting for logs or regional timber";
        return;
    }
    // Skip goods that are already stockpiled, but keep a secondary output
    // flowing: a sawmill whose plank rack is full can still burn logs for
    // firewood instead of idling through the winter.
    const allowedOutput = {};
    for (const [good, amount] of Object.entries(sawBatch ? sawBatch.output : recipe.output)) {
        const target = STOCK_TARGETS[good];
        if (target && getPhysicalStock(good) >= target) continue;
        allowedOutput[good] = amount;
    }
    if ((sawBatch ? Object.keys(sawBatch.output).length : entriesFor(recipe).output.length) && !Object.keys(allowedOutput).length) {
        building.productionReason = "Reserve is fully stocked";
        return;
    }
    if (recipe.site === "forest" || recipe.site === "stone" || recipe.site === "water") {
        if (!canStoreOutput(building, recipe.site === "forest" ? { logs: recipe.batch } : recipe.site === "stone" ? { stoneBlocks: Math.max(1, Math.floor(recipe.batch * 2 / 2)) } : { water: recipe.batch })) {
            building.productionReason = "Output store is full";
            return;
        }
        const node = findNearestResourceNode(recipe.site, building.x, building.y, recipe.site === "water" ? 8 : 7);
        if (!node) {
            building.productionReason = recipe.site === "forest" ? "No forest in working range" : recipe.site === "stone" ? "No stone deposit in working range" : "No water in working range";
            return;
        }
        if (recipe.site === "forest") {
            // Weather and the regional type both set how much timber a crew can
            // actually bring out. The habitat cache keeps this a map lookup for
            // an unchanged stand; it is the same full node fauna already uses.
            const regionalSite = regionalForestAt(node.x, node.y);
            const regionalTimber = Math.max(0.7, Math.min(1.35, Number(regionalSite?.effects?.timber) || 1));
            const managementTimber = Math.max(0.75, Math.min(1.10, Number(regionalSite?.timberFactor) || 1));
            const batch = Math.max(1, Math.round(recipe.batch * extractionFactor * regionalTimber * managementTimber));
            const taken = harvestForest(node.x, node.y, batch);
            if (taken <= 0) { building.productionReason = "Forest stand is depleted"; return; }
            finishOutput(building, { logs: taken }, production);
            // A regional stand yields its signature timber beside the log
            // batch. One unit every few batches keeps the specialty chain fed
            // without displacing the ordinary logs that construction needs.
            // Dense timbers earn a shorter cadence, soft pioneers a longer one.
            const cadence = regionalTimber >= 1.15 ? 4 : regionalTimber <= 0.8 ? 6 : 5;
            if (outputSpace(building) > 0
                && ((Math.floor(state.tick / PRODUCTION_INTERVAL) + Math.floor(node.x) * 7 + Math.floor(node.y) * 13) % cadence === 0)) {
                const regionalType = regionalSite?.type || null;
                const signature = signatureTimberForRegionalType(regionalType);
                if (signature && getPhysicalStock(signature.id) < (STOCK_TARGETS[signature.id] || 18)) {
                    finishOutput(building, { [signature.id]: 1 }, production);
                }
            }
            return;
        }
        if (recipe.site === "stone") {
            const batch = Math.max(1, Math.round(recipe.batch * 2 * extractionFactor));
            const taken = extractStone(node.x, node.y, batch);
            if (taken <= 0) { building.productionReason = "Stone deposit is depleted"; return; }
            production.stoneExtracted += taken;
            finishOutput(building, { stoneBlocks: Math.max(1, Math.floor(taken / 2)) }, production);
            return;
        }
        if (recipe.site === "water") {
            finishOutput(building, { water: recipe.batch }, production);
            return;
        }
    }
    if (!sawBatch && !requestInputs(building)) {
        building.productionReason = getBuildingSupplyReason(building) || "Waiting for input stock";
        return;
    }
    const efficiency = Math.max(0.35, workEfficiency);
    const output = {};
    for (const [good, amount] of Object.entries(allowedOutput)) output[good] = Math.max(0, Math.round(amount * efficiency));
    if (!canStoreOutput(building, output)) {
        building.productionReason = "Output store is full";
        return;
    }
    if (sawBatch && !consumeSawInput(building, sawBatch)) return;
    if (!sawBatch && !consumeInputs(building)) return;
    finishOutput(building, output, production);
    // Grain used to exist only inside the mill -> bakery -> carrier chain. A
    // realm with active farms and no spare carrier could starve beside a full
    // granary. Farms now retain a measured subsistence share for their own
    // households; it scales with the same worker efficiency as the grain crop
    // and is booked like every other food movement.
    if (building.type === TYPE.FARM) {
        const subsistence = Math.max(0, (Number(output.grain) || 0) * 1.0);
        if (subsistence > 0) production.farmFood += subsistence;
    }
    building.productionReason = null;
}

function bookFarmSubsistence(production) {
    const total = Math.max(0, Number(production.farmFood) || 0);
    const booked = Math.max(0, Number(production.farmFoodBooked) || 0);
    const delta = Math.round((total - booked) * 100) / 100;
    if (delta <= 0) return;
    addResource("food", delta);
    recordResourceMovement("food", delta, "farm-subsistence", {
        from: { kind: "realm", id: "farms" },
        to: { kind: "realm", id: "royal-stores" },
        key: "food:farms:" + state.tick
    });
    production.farmFoodBooked = total;
}

// Every producer still runs exactly every PRODUCTION_INTERVAL ticks. Three
// stable phases, chosen from the entity id, keep the complete settlement from
// booking all batches in one block: phases run on 6/8/10, then 12/14/16 and so
// on. The opening test tick still runs every producer so the production
// contract at tick zero is unchanged.
function productionPhase(building) {
    const id = String(building.id ?? "");
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    return (Math.abs(hash) % 3) * 2;
}
function productionDue(tick, building, stagger) {
    if (tick === 0 || !stagger) return true;
    return tick >= PRODUCTION_INTERVAL && (tick - PRODUCTION_INTERVAL + productionPhase(building)) % PRODUCTION_INTERVAL === 0;
}

export function updateBuildingIncome() {
    const tick = state.tick;
    const productionTick = tick === 0 || (tick >= PRODUCTION_INTERVAL && tick % 2 === 0);
    const fullProductionTick = tick === 0 || tick % PRODUCTION_INTERVAL === 0;
    const civicTick = tick % CIVIC_INTERVAL === 0;
    if (!productionTick && !civicTick) return;
    // A handful of producers is cheaper than the scheduling itself. Only a
    // full settlement splits its batches across the stable phases.
    let producerCount = 0;
    if (productionTick) {
        for (const entity of state.entities) {
            if (!entity.dead && entity.isBuilding() && RECIPES[entity.type]) producerCount++;
        }
    }
    const staggerProduction = producerCount > 10;
    const extraction = getHazardExtractionFactor();
    const workforce = getWorkforceSnapshot();
    const production = ledger();
    if (productionTick) {
        for (const building of state.entities) {
            if (!building.dead && building.isBuilding() && RECIPES[building.type] && productionDue(tick, building, staggerProduction)) {
                const efficiency = getBuildingEfficiency(building, workforce);
                produceRecipe(building, workforce, production, efficiency, extraction);
                requestStoredHauls(building);
                // Construction is paid from the royal wood and stone stores,
                // not from the physical log/block chain. Without this income,
                // a direct-build campaign spends its opening stock and then
                // permanently dead-ends, no matter how much timber is sawn.
                const constructionYield = efficiency * extraction;
                if (constructionYield > 0) {
                    if (building.type === TYPE.LUMBER) addResource("wood", constructionYield);
                    else if (building.type === TYPE.QUARRY) addResource("stone", constructionYield);
                }
            }
        }
        if (fullProductionTick) for (const temple of getEntitiesOfType(TYPE.TEMPLE)) {
            if (temple.construction && temple.construction.stage < 3) continue;
            state.morale = Math.min(100, state.morale + 0.6 * getBuildingEfficiency(temple, workforce));
        }
        if (fullProductionTick) for (const mine of getEntitiesOfType(TYPE.GOLDMINE)) {
            if (mine.construction && mine.construction.stage < 3) continue;
            addResource("gold", (state.seasonIndex === 3 ? 1 : 2) * getBuildingEfficiency(mine, workforce) * extraction);
        }
        bookFarmSubsistence(production);
    }
    if (civicTick) {
        for (const tavern of getEntitiesOfType(TYPE.TAVERN)) {
            if (tavern.construction && tavern.construction.stage < 3) continue;
            const efficiency = getBuildingEfficiency(tavern, workforce);
            if (efficiency <= 0) continue;
            // A brewery is a real producer, not decoration. A nearby cellar
            // turns one cask into a premium night of trade and lifts morale;
            // the book keeps the movement idempotent across settlement passes.
            const aleCellar = findLocalWarehouse("ale", tavern.x, tavern.y, 12);
            const ale = aleCellar ? consumeFromWarehouse(aleCellar, "ale", 1, {
                cause: "tavern-ale", houseId: "tavern:" + tavern.id,
                key: "ale:tavern:" + tavern.id + ":" + state.tick
            }) : 0;
            if (ale > 0) {
                production.aleConsumed += ale;
                addResource("gold", 2 * efficiency);
                state.morale = Math.min(100, state.morale + 0.8 * efficiency);
            }
            const provisions = Math.min(Number(state.resources.food) || 0, efficiency);
            if (provisions <= 0) continue;
            recordResourceMovement("food", -provisions, "tavern-provisions", {
                from: { kind: "realm", id: "royal-stores" }, to: { kind: "building", id: tavern.id },
                key: "food:tavern:" + tavern.id + ":" + state.tick
            });
            addResource("food", -provisions);
            const gold = 3 * efficiency * (provisions / Math.max(0.0001, efficiency));
            addResource("gold", gold);
            production.tavernFoodConsumed += provisions;
            production.tavernGoldProduced += gold;
            state.morale = Math.min(100, state.morale + 0.6 * efficiency);
        }
        for (const mill of getEntitiesOfType(TYPE.MILL)) {
            if (mill.construction && mill.construction.stage < 3) continue;
            const flour = mill.inventory?.output?.flour || 0;
            if (flour > 0) requestHaul(mill, "flour", flour);
        }
    }
}
