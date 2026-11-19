// Fixed-step simulation orchestrator.
import { state } from "../core/state.js";
import { resetIncome } from "../systems/resources.js";
import { updateMorale } from "../systems/morale.js";
import { checkRandomEvents,addLog } from "../systems/events.js";
import { updateMarket } from "../systems/market.js";
import { updateRealmCycle } from "../systems/realm-cycle.js";
import { updateDiplomacy } from "../systems/diplomacy.js";
import { updateCourt } from "../systems/court.js";
import { updateAdvisor } from "../systems/advisor.js";
import { updateNobility } from "../systems/nobility.js";
import { updateNobleFeuds } from "../systems/noble-feuds.js";
import { updateNobleHosts } from "../systems/noble-host.js";
import { updateEspionage } from "../systems/espionage.js";
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
import { syncBiomeDiscovery, updateBiomeAtlasAnnual, updateBiomeAtlasSeason } from "../systems/biome-resource-state.js";
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
import { updateRoyalCrisis } from "../systems/royal-crisis.js";
import { updateCreatures } from "../systems/creatures.js";
import { updateAmbitions } from "../systems/ambitions.js";
import { updateEndeavours } from "../systems/endeavours.js";
import { settleCrownSupply } from "../systems/crown-supply.js";
import { spoilForestGoods } from "../systems/forest-gathering.js";
import { updateMicroEvents } from "../systems/micro-events.js";
import { updateExpeditions } from "../systems/expeditions.js";
import { updateVolcanoHazards } from "../world/volcano-hazards.js";
import { updateCoastHazards } from "../world/coast-hazards.js";
import { updateSnowHazards } from "../world/snow-hazards.js";
import { updateDisasterRecovery } from "../systems/disaster-recovery.js";
import { updateWinterAnnual, updateWinterEconomy } from "../world/winter-economy.js";
import { isEndlessEnabled, recoverEndlessMorale, updateEndlessRealm, updateEndlessRelief } from "../systems/endless.js";
import { updateSpecialBiomes } from "../systems/special-biome-state.js";
import { updateRoadWear } from "../systems/roads.js";
import { updateSettlementMaintenance } from "../systems/settlement-owners.js";

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
    { name: "royalCrisis", run(annual) { annual.royalCrisis = updateRoyalCrisis(); } },
    { name: "creatures", run() { updateCreatures(); } },
    { name: "social", run(annual) { annual.socialResult = updateSocialLife(); } },
    { name: "agency", run() { updatePersonalAgency(); } },
    { name: "births", run(annual) { annual.newborn = updateBirths(); } },
    { name: "diplomacy", run() { updateDiplomacy(); } },
    { name: "court", run() { updateCourt(); } },
    { name: "advisor", run() { updateAdvisor(); } },
    { name: "nobility", run() { updateNobility(); } },
    // Feuds resolve before the hosts so a new dispute immediately changes who
    // will march. Host upkeep then reaches the same treasury as every other
    // annual system.
    { name: "nobleFeuds", run() { updateNobleFeuds(); } },
    { name: "nobleHosts", run() { updateNobleHosts(); } },
    // The Whisper Court reads the houses and realms settled above, pays its
    // agents once a year and writes the insight combat and trade then read.
    { name: "espionage", run() { updateEspionage(); } },
    { name: "civic", run() { updateCivic(); } },
    { name: "endeavours", run() { updateEndeavours(); } },
    { name: "crownSupply", run() { settleCrownSupply(); } },
    // Settlement seats first receive their bounded annual crown allotment, then
    // the one bounded road survey wears the network and assesses each owner's
    // obligation. Neither pass touches the per-tick hot path.
    { name: "settlementMaintenance", run(annual) { annual.settlementMaintenance = updateSettlementMaintenance(); } },
    { name: "roadSurvey", run(annual) { annual.roadSurvey = updateRoadWear(); } },
    // One bounded hazard pass at the year boundary: eruption, earthquake,
    // ashfall and real destruction on volcanic ground. Temperate worlds return
    // immediately, so the shared campaign keeps its existing tick cost.
    { name: "volcanoHazards", run(annual) { annual.volcanoHazards = updateVolcanoHazards(); } },
    // One bounded coastal hazard pass at the same annual boundary. It returns
    // immediately outside the Coastlands climate, so inland campaigns keep
    // their existing tick cost and event sequence.
    { name: "coastHazards", run(annual) { annual.coastHazards = updateCoastHazards(); } },
    { name: "snowHazards", run(annual) { annual.snowHazards = updateSnowHazards(); } },
    // One bounded annual read of the destruction tags: the capped entity list
    // is read once, new wrecks are recorded, and wrecks from an earlier year
    // yield their salvage once. No per-tick work is added.
    { name: "disasterRecovery", run(annual) { annual.disasterRecovery = updateDisasterRecovery(); } },
    // 1.2.16 winter economy: one bounded annual hazard and caravan pass. It
    // returns immediately outside Snowlands, so other climates keep their
    // exact annual sequence and tick budget.
    { name: "winterAnnual", run(annual) { annual.winterAnnual = updateWinterAnnual(); } },
    // 1.2.19 settles the bounded 36-region atlas once per year: seasonal
    // regeneration, extraction pressure, pollination, predation, migration and
    // regional trade. The pass is skipped entirely when no atlas is present.
    { name: "biomeAtlas", run(annual) { annual.biomeAtlas = updateBiomeAtlasAnnual(); } }
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
        succession: null,
        royalCrisis: null,
        volcanoHazards: null,
        coastHazards: null,
        roadSurvey: null,
        settlementMaintenance: null,
        winterAnnual: null,
        biomeAtlas: null
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
    const previousSeason = Number(state.seasonIndex) || 0;
    state.seasonIndex = Math.floor(state.dayOfYear / 100) % 4;
    // A live Explore survey must not keep displaying last season's density.
    // This fires four times per year at most; the panel does the bounded
    // re-render only while it is actually open.
    if (state.seasonIndex !== previousSeason) {
        // Bounded four-per-year pass: seasonal stock curves and short-distance
        // wildlife migration. It is skipped when no atlas exists or the season
        // was already settled by a load.
        updateBiomeAtlasSeason();
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("kac:season-change", {
                detail: { seasonIndex: state.seasonIndex, year: state.year, tick: state.tick }
            }));
        }
    }
    if ((state.worldOptions?.climate || "temperate") === "tropical") spoilForestGoods(1);
    resetIncome();
    updateSettlement();
    // Twenty-day winter ledger. It is a no-op on other ticks and other climates.
    updateWinterEconomy();
    // The standing grain contract delivers once per season. This is a single
    // bounded call four times a year, not a new per-tick system.
    if (state.tick % 100 === 0 && (state.crownSupply?.grainLevel || 0) >= 4) settleCrownSupply();
    const newcomer = newborn ? null : updatePopulation();
    updateCitizenRegister();
    if (newborn) addLog("A CHILD WAS BORN: " + newborn.person.name, "#e8c77b", "family");
    else if (newcomer) addLog("A NEW RESIDENT HAS JOINED THE REALM", "#a3d6a7", "population");
    updateFields(); updateForestSuccession(); if (state.resourceGeography) regrowForests(400, { slice: state.tick % 400, slices: 400 }); updateForestFauna(); updateForestPannage(); updateBuildingIncome(); updateCraftProduction(); updateLogistics(); updateConstruction(); updateVillagers(); updateMilitary(); updateCombat(); updateExpeditions(); checkRandomEvents();
    updateWeather(); updateMorale(); updateMarket(); updateEconomy(); updateRealmCycle(); updateHealth(); updateAmbitions();
    // Endless ages advance once per 25 years. A collapse is a recoverable
    // setback in an endless realm rather than a terminal game-over.
    updateEndlessRealm();
    updateEndlessRelief();
    // Rare-biome discovery is checked every 200 ticks; yields and hazards
    // settle once per year. The call itself is a couple of integer reads.
    updateSpecialBiomes();
    // 1.2.19 region discovery follows real explored tiles. Four coarse samples
    // per season are enough to unlock a region without scanning the full map
    // on every tick; the annual pass always fixes any borderline coverage.
    if (state.tick % 100 === 0) syncBiomeDiscovery();
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
        if (isEndlessEnabled()) {
            if (recoverEndlessMorale()) {
                queueMessage("THE REALM ENDURES", "A HARSH LESSON · THE CHRONICLE CONTINUES", 8000);
            }
        } else {
            state.gameOver = true; addLog("THE REALM FELL — MORALE COLLAPSED", "#e9857b", "milestone");
            queueMessage("THE REALM FELL", "MORALE COLLAPSED", 0);
        }
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
