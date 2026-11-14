// Fixed-step simulation orchestrator.
import { state } from "../core/state.js";
import { resetIncome } from "../systems/resources.js";
import { updateMorale } from "../systems/morale.js";
import { checkRandomEvents,addLog } from "../systems/events.js";
import { updateMarket } from "../systems/market.js";
import { updateRealmCycle } from "../systems/realm-cycle.js";
import { updateDiplomacy } from "../systems/diplomacy.js";
import { updateCourt } from "../systems/court.js";
import { updateNobility } from "../systems/nobility.js";
import { updateCivic } from "../systems/civic.js";
import { updateEconomy } from "../systems/economy.js";
import { updateEdicts } from "../systems/edicts.js";
import { updateHealth } from "../systems/health.js";
import { updateMilitary } from "../systems/military.js";
import { updateFaith } from "../systems/faith.js";
import { updateJustice } from "../systems/justice.js";
import { updateResearch } from "../systems/research.js";
import { updatePopulation } from "../systems/population.js";
import { updateCitizenRegister } from "../systems/population-register.js";
import { updateWeather } from "../world/weather.js";
import { updateBuildingIncome } from "./buildings.js";
import { updateCraftProduction } from "../systems/craft-production.js";
import { updateVillagers } from "./villagers.js";
import { updateConstruction } from "../systems/construction.js";
import { regrowForests } from "../systems/resource-geography.js";
import { updateFields } from "../systems/fields.js";
import { updateForestFauna } from "../systems/forest-fauna.js";
import { updateForestSuccession } from "../systems/forest-succession.js";
import { updateForestPannage } from "../systems/forest-pannage.js";
import { updateLogistics } from "../systems/logistics.js";
import { updateSettlement } from "../systems/settlement.js";
import { updateCombat } from "./combat.js";
import { queueMessage } from "../core/presentation-effects.js";
import { updatePeople } from "../systems/people.js";
import { updateBirths } from "../systems/births.js";
import { updateSocialLife } from "../systems/social.js";
import { updatePersonalAgency } from "../systems/agency.js";
import { updateMortality } from "../systems/mortality.js";
import { updateGuardianships } from "../systems/guardianship.js";
import { updateRoyalSuccession } from "../systems/royal-dynasty.js";
import { updateCreatures } from "../systems/creatures.js";
import { updateAmbitions } from "../systems/ambitions.js";
import { updateEndeavours } from "../systems/endeavours.js";
import { settleCrownSupply } from "../systems/crown-supply.js";
import { spoilForestGoods } from "../systems/forest-gathering.js";
import { updateMicroEvents } from "../systems/micro-events.js";
import { updateExpeditions } from "../systems/expeditions.js";

const nowMs = () => globalThis.performance?.now?.() ?? Date.now();
const ANNUAL_SLICE_BUDGET_MS = 6;

// The annual rollover is deep but its systems are independent in strict order.
// Headless callers run all of them in one call; the presented game loop runs
// one small slice per frame so no low-end device gets a yearly long task. No
// daily system, random draw or tick runs between slices, so the resulting state
// is identical to the synchronous sequence.
const ANNUAL_TASKS = [
    { name: "faith", run() { updateFaith(); } },
    { name: "justice", run() { updateJustice(); } },
    { name: "research", run() { updateResearch(); } },
    { name: "edicts", run() { updateEdicts(); } },
    { name: "people", run() { updatePeople(); } },
    { name: "mortality", run(annual) { annual.deaths = updateMortality(); } },
    { name: "guardianships", run(annual) { annual.guardianships = updateGuardianships(); } },
    { name: "succession", run(annual) { annual.succession = updateRoyalSuccession(); } },
    { name: "creatures", run() { updateCreatures(); } },
    { name: "social", run(annual) { annual.socialResult = updateSocialLife(); } },
    { name: "agency", run() { updatePersonalAgency(); } },
    { name: "births", run(annual) { annual.newborn = updateBirths(); } },
    { name: "diplomacy", run() { updateDiplomacy(); } },
    { name: "court", run() { updateCourt(); } },
    { name: "nobility", run() { updateNobility(); } },
    { name: "civic", run() { updateCivic(); } },
    { name: "endeavours", run() { updateEndeavours(); } },
    { name: "crownSupply", run() { settleCrownSupply(); } }
];

let annualSlicingEnabled = false;
let annualPending = null;

export function setAnnualMaintenanceSlicing(enabled) {
    annualSlicingEnabled = enabled === true;
}

export function resetAnnualMaintenance() {
    annualPending = null;
}

export function hasPendingAnnualMaintenance() {
    return annualPending !== null;
}

function createAnnualMaintenance() {
    return {
        index: 0,
        deaths: [],
        guardianships: [],
        socialResult: null,
        newborn: null,
        succession: null
    };
}

function runAnnualTasks(annual, budgetMs, forceAll = false) {
    const started = nowMs();
    for (;;) {
        const task = ANNUAL_TASKS[annual.index];
        task.run(annual);
        annual.index++;
        if (annual.index >= ANNUAL_TASKS.length) return true;
        if (forceAll || !annualSlicingEnabled || nowMs() - started < budgetMs) continue;
        return false;
    }
}

function logAnnualResults(annual) {
    if (annual.succession?.changed) {
        addLog("THE CROWN PASSES TO " + (annual.succession.king.person?.name || "THE HEIR"), "#e8c77b", "dynasty");
    }
    for (const death of annual.deaths) {
        addLog("A RESIDENT DIED: " + death.name + " · " + death.cause, "#b99a9a", "death");
    }
    for (const assignment of annual.guardianships) {
        addLog("A GUARDIAN TOOK RESPONSIBILITY FOR " + assignment.wardName + ": " + assignment.guardianName, "#d8c18a", "family");
    }
    if (annual.socialResult?.partnerships?.length) {
        for (const partnership of annual.socialResult.partnerships) {
            addLog("A PARTNERSHIP FORMED: " + partnership.first + " & " + partnership.second, "#e8c77b", "family");
        }
    }
}

function completeAnnualMaintenance(annual) {
    annualPending = null;
    logAnnualResults(annual);
    finishSimulationTick(annual.newborn);
}

// Run the next maintenance slice. The game loop calls this without consuming
// simulation time, so the clock cannot build a catch-up backlog while the realm
// is paused for a few frames at the year boundary.
export function advanceAnnualMaintenance() {
    if (!annualPending) return false;
    if (!runAnnualTasks(annualPending, ANNUAL_SLICE_BUDGET_MS)) return false;
    completeAnnualMaintenance(annualPending);
    return true;
}

// Saving from inside a maintenance window must capture a complete tick. This
// path is deliberately allowed to take the full annual cost once, outside the
// presented frame budget, instead of persisting a half-updated year.
export function finishAnnualMaintenanceForSave() {
    if (!annualPending) return false;
    runAnnualTasks(annualPending, Number.POSITIVE_INFINITY, true);
    completeAnnualMaintenance(annualPending);
    return true;
}

function finishSimulationTick(newborn) {
    state.seasonIndex = Math.floor(state.dayOfYear / 100) % 4;
    if ((state.worldOptions?.climate || "temperate") === "tropical") spoilForestGoods(1);
    resetIncome();
    updateSettlement();
    // The standing grain contract delivers once per season. This is a single
    // bounded call four times a year, not a new per-tick system.
    if (state.tick % 100 === 0 && (state.crownSupply?.grainLevel || 0) >= 4) settleCrownSupply();
    const newcomer = newborn ? null : updatePopulation();
    updateCitizenRegister();
    if (newborn) addLog("A CHILD WAS BORN: " + newborn.person.name, "#e8c77b", "family");
    else if (newcomer) addLog("A NEW RESIDENT HAS JOINED THE REALM", "#a3d6a7", "population");
    updateFields(); updateForestSuccession(); if (state.resourceGeography) regrowForests(400, { slice: state.tick % 400, slices: 400 }); updateForestFauna(); updateForestPannage(); updateBuildingIncome(); updateCraftProduction(); updateLogistics(); updateConstruction(); updateVillagers(); updateMilitary(); updateCombat(); updateExpeditions(); checkRandomEvents();
    updateWeather(); updateMorale(); updateMarket(); updateEconomy(); updateRealmCycle(); updateHealth(); updateAmbitions();
    // Procedural chronicle events are independent of the decision-bearing
    // issue inbox. They never open a modal or wait for the player; the bounded
    // timeline and presentation queue keep them off the simulation hot path.
    updateMicroEvents();
    state.entities = state.entities.filter(entity => !entity.dead);
    if (state.raidActive && !state.entities.some(entity => entity.isEnemy())) {
        state.totalRaidsSurvived++; state.raidActive = false; addLog("RAID DEFEATED — THE REALM HOLDS", "#a5d6a7", "military");
    }
    if (state.year >= 12 && state.morale > 80 && !state.victory) {
        state.victory = true; addLog("THE KINGDOM ENDURES", "#e4bd72", "milestone");
        queueMessage("YOUR KINGDOM ENDURES", "A LEGEND WAS BORN", 8000);
    }
    if (state.morale < 8 && state.tick > 800 && !state.gameOver) {
        state.gameOver = true; addLog("THE REALM FELL — MORALE COLLAPSED", "#e9857b", "milestone");
        queueMessage("THE REALM FELL", "MORALE COLLAPSED", 0);
    }
}

export function updateSimulation() {
    if (state.isPaused || state.gameOver || !state.hasStarted) return;
    // Defensive path for callers that invoke updateSimulation directly while
    // the presented loop owns an in-flight rollover. The game loop itself
    // advances maintenance without consuming simulation time.
    if (annualPending) {
        advanceAnnualMaintenance();
        return;
    }
    const previousYear = state.year;
    state.tick++; state.dayOfYear++;
    if (state.dayOfYear >= 400) { state.dayOfYear = 0; state.year++; }
    if (state.year > previousYear) {
        annualPending = createAnnualMaintenance();
        if (!runAnnualTasks(annualPending, ANNUAL_SLICE_BUDGET_MS)) return;
        completeAnnualMaintenance(annualPending);
        return;
    }
    finishSimulationTick(null);
}
