// Campaign stall diagnostic. Prints why production, logistics and
// construction are stalled at the end of a short run.
import { performance } from "node:perf_hooks";
import { runCampaign } from "../tests/campaign/campaign-driver.mjs";
import { state } from "../js/core/state.js";
import { TYPE } from "../js/core/types.js";
import { getBuildingEfficiency, getWorkforceSnapshot } from "../js/systems/economy.js";
import { getWarehouseSnapshot, requestHaul, hasOverlandRoute, getAvailableOutput } from "../js/systems/logistics.js";
import { getSettlementSnapshot } from "../js/systems/settlement.js";

function makeCanvasStub() {
    return {
        width: 0, height: 0,
        getContext() {
            return {
                createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; },
                putImageData() {}
            };
        }
    };
}
globalThis.document = { createElement() { return makeCanvasStub(); } };

const years = Number(process.env.YEARS || 4);
let leak = null;
const result = runCampaign({
    years,
    onTick() {
        if (leak) return;
        const farms = state.entities.filter(entity => !entity.dead && entity.type === TYPE.FARM);
        for (const farm of farms) {
            const reserved = farm.inventory?.reservedOut?.grain || 0;
            if (reserved <= 0) continue;
            const active = (state.city?.logistics?.jobs || []).filter(job =>
                ["pending", "assigned", "blocked"].includes(job.status) && job.from?.id === farm.id && job.good === "grain");
            if (active.length) continue;
            leak = {
                tick: state.tick, year: state.year, farm: farm.id,
                output: farm.inventory?.output?.grain || 0, reserved,
                jobs: (state.city?.logistics?.jobs || []).map(job => ({
                    id: job.id, kind: job.kind, good: job.good, status: job.status,
                    quantity: job.quantity, picked: job.picked, delivered: job.delivered,
                    from: job.from, to: job.to, sourceReserved: job.sourceReserved, targetReserved: job.targetReserved
                })),
                ledger: (state.city?.logistics?.ledger || []).filter(entry => entry.good === "grain").slice(-30)
            };
            return;
        }
    }
});
if (leak) console.log("LEAK", JSON.stringify(leak, null, 2));
console.log("RESULT", JSON.stringify({
    ok: result.ok, year: result.finalYear, population: result.final.population,
    capacity: result.final.capacity, food: result.final.resources.food,
    wood: result.final.resources.wood, stone: result.final.resources.stone,
    gold: result.final.resources.gold, failures: result.diagnostics.buildFailures,
    stalls: result.diagnostics.stalledSites
}, null, 2));

const workforce = getWorkforceSnapshot();
const byWorkplace = {};
for (const villager of state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER)) {
    const key = villager.workplace ? villager.workplace.type + ":" + villager.workplace.id : "none";
    byWorkplace[key] = (byWorkplace[key] || 0) + 1;
}
console.log("STAFFING", JSON.stringify(byWorkplace, null, 2));
for (const entity of state.entities.filter(entity => !entity.dead && entity.isBuilding())) {
    const workers = workforce.workersByBuilding.get(entity) || 0;
    if (workers > 0) continue;
    console.log("UNSTAFFED", JSON.stringify({ id: entity.id, type: entity.type, x: entity.x, y: entity.y }));
}
console.log("RESOURCES", JSON.stringify(state.resources));
console.log("LEDGER", JSON.stringify(state.economy?.productionChains));
console.log("WORKFORCE", JSON.stringify({
    population: workforce.population, employed: workforce.employed,
    unemployed: workforce.unemployed, buildings: workforce.buildings
}));
console.log("NEEDS", JSON.stringify(getSettlementSnapshot()));
console.log("WAREHOUSES", JSON.stringify(getWarehouseSnapshot(), null, 2));

const relevant = new Set([TYPE.FARM, TYPE.MILL, TYPE.BAKERY, TYPE.LUMBER, TYPE.QUARRY, TYPE.SAWMILL, TYPE.MASON, TYPE.WELL, TYPE.WAREHOUSE, TYPE.HOUSE, TYPE.MARKET, TYPE.TEMPLE]);
for (const entity of state.entities) {
    if (entity.dead || !relevant.has(entity.type)) continue;
    const workers = workforce.workersByBuilding.get(entity) || 0;
    const efficiency = getBuildingEfficiency(entity, workforce);
    const input = entity.inventory?.input || {};
    const output = entity.inventory?.output || {};
    const construction = entity.construction ? `stage=${entity.construction.stage}:${entity.construction.reason || ""}:need=${JSON.stringify(entity.construction.materialNeed || {})}:deliv=${JSON.stringify(entity.construction.delivered || {})}:paid=${JSON.stringify(entity.construction.paid || {})}` : "complete";
    console.log("BUILDING", JSON.stringify({
        id: entity.id, type: entity.type, x: entity.x, y: entity.y,
        workers, efficiency: Math.round(efficiency * 100) / 100,
        productionReason: entity.productionReason || null,
        construction,
        input: Object.fromEntries(Object.entries(input).filter(([, value]) => value > 0)),
        output: Object.fromEntries(Object.entries(output).filter(([, value]) => value > 0))
    }));
}

console.log("VILLAGERS", JSON.stringify(state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).map(villager => ({
    id: villager.id, job: villager.job, x: Math.round(villager.x), y: Math.round(villager.y),
    workplace: villager.workplace ? { id: villager.workplace.id, type: villager.workplace.type, x: villager.workplace.x, y: villager.workplace.y } : null,
    distanceToLumber: Math.round(Math.hypot(villager.x - 93, villager.y - 85))
})), null, 2));

const lumber = state.entities.find(entity => !entity.dead && entity.type === TYPE.LUMBER);
if (lumber) console.log("LUMBER", JSON.stringify({
    id: lumber.id, x: lumber.x, y: lumber.y, construction: lumber.construction,
    efficiency: getBuildingEfficiency(lumber, workforce), productionReason: lumber.productionReason,
    inventory: lumber.inventory
}));

for (const farm of state.entities.filter(entity => !entity.dead && entity.type === TYPE.FARM)) {
    const warehouses = getWarehouseSnapshot().rows.filter(row => row.filters.includes("grain"));
    console.log("FARM_FLOW", JSON.stringify({
        id: farm.id, x: farm.x, y: farm.y,
        output: farm.inventory?.output?.grain || 0,
        reservedOut: farm.inventory?.reservedOut?.grain || 0,
        available: getAvailableOutput(farm, "grain"),
        routes: warehouses.map(row => ({ id: row.id, free: row.free, route: hasOverlandRoute(farm, state.entities.find(entity => entity.id === row.id)) }))
    }));
    const job = requestHaul(farm, "grain", getAvailableOutput(farm, "grain"));
    console.log("FARM_HAUL", JSON.stringify({ id: farm.id, job: job ? { id: job.id, quantity: job.quantity, to: job.to } : null, rejection: state.city?.logistics?.lastRejection }));
}

const jobs = state.city?.logistics?.jobs || [];
const byStatus = {};
for (const job of jobs) {
    const key = job.status + "|" + job.kind + "|" + job.good + "|" + (job.reason || "");
    byStatus[key] = (byStatus[key] || 0) + 1;
}
console.log("JOBS", JSON.stringify(byStatus, null, 2));
console.log("CARRIERS", JSON.stringify((state.city?.logistics?.carriers || []).map(carrier => ({
    id: carrier.id, jobId: carrier.jobId, x: Math.round(carrier.x), y: Math.round(carrier.y),
    status: carrier.status, cargo: carrier.cargo
}))));
console.log("REJECTION", JSON.stringify(state.city?.logistics?.lastRejection));
console.log("AUDIT", JSON.stringify(state.city?.logistics?.audit?.rows || []));
