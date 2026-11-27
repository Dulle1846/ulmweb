// Fixed-step simulation orchestrator.
import { state } from "../core/state.js";
import { resetIncome } from "../systems/resources.js";
import { updateMorale } from "../systems/morale.js";
import { checkRandomEvents,addLog } from "../systems/events.js";
import { updateMarket } from "../systems/market.js";
import { updateRealmCycle } from "../systems/realm-cycle.js";
import { updateDiplomacy, updateDiplomaticMissions } from "../systems/diplomacy.js";
import { updateCourt } from "../systems/court.js";
import { updateAdvisor } from "../systems/advisor.js";
import { updateNobility } from "../systems/nobility.js";
import { updateNobleFeuds } from "../systems/noble-feuds.js";
import { updateNobleHosts } from "../systems/noble-host.js";
import { updateEspionage } from "../systems/espionage.js";
import { updateCivic } from "../systems/civic.js";
import { updateEconomy } from "../systems/economy.js";
import { updateForestIndustry } from "../systems/forest-industries.js";
import { updateForestCulture } from "../systems/forest-culture.js";
import { updateForestGuild } from "../systems/forest-guild.js";
import { updateGrandConsumers } from "../systems/grand-consumers.js";
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
import { SETTLEMENT_INTERVAL, updateServices, updateSettlementNeeds } from "../systems/settlement.js";
import { updateCombat } from "./combat.js";
import { queueMessage } from "../core/presentation-effects.js";
import { updatePeople } from "../systems/people.js";
import { updateBirths } from "../systems/births.js";
import { updateSocialLife } from "../systems/social.js";
import { updatePersonalAgency } from "../systems/agency.js";
import { updateMortality } from "../systems/mortality.js";
import { updateGuardianships } from "../systems/guardianship.js";
import { updateRoyalSuccession } from "../systems/royal-dynasty.js";
import { updateRoyalEducation } from "../systems/royal-education.js";
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
import { updateEnvironmentalHazardYear, updateEnvironmentalHazards } from "../systems/environmental-hazards.js";
import { isEndlessEnabled, recoverEndlessMorale, updateEndlessRealm, updateEndlessRelief } from "../systems/endless.js";
import { updateSpecialBiomes } from "../systems/special-biome-state.js";
import { updateRoadWear } from "../systems/roads.js";
import { updateSettlementMaintenance } from "../systems/settlement-owners.js";
import { updateScenario } from "../systems/scenario.js";
import { updateWorldMap } from "../systems/world-map.js";
import { updateForestWarfare } from "../systems/forest-warfare.js";
import { updateCampaignProgress, settleAnnualCampaigns } from "../systems/feudal-campaigns.js";
import { updateCouncilDocket } from "../systems/council-laws.js";

// The annual rollover is deep but its systems are independent in strict order.
// Headless callers run all of them in one call; the presented game loop runs
// exactly one system per frame. A byte budget was not enough: the first annual
// call on a loaded mature realm can spend most of its time in JIT compilation
// inside one system, so the loop must not stack a second system onto that
// frame. No daily system, random draw or tick runs between slices, so the
// resulting state is identical to the synchronous sequence.
const ANNUAL_TASKS = [
    { name: "faith", run() { updateFaith(); } },
    { name: "justice", run() { updateJustice(); } },
    { name: "research", run() { updateResearch(); } },
    { name: "edicts", run() { updateEdicts(); } },
    { name: "people", run() { updatePeople(); } },
    { name: "mortality", run(annual) { annual.deaths = updateMortality(); } },
    { name: "guardianships", run(annual) { annual.guardianships = updateGuardianships(); } },
    { name: "succession", run(annual) { annual.succession = updateRoyalSuccession(); } },
    { name: "royalEducation", run(annual) { annual.royalEducation = updateRoyalEducation(); } },
    { name: "royalCrisis", run(annual) { annual.royalCrisis = updateRoyalCrisis(); } },
    { name: "creatures", run() { updateCreatures(); } },
    { name: "social", run(annual) { annual.socialResult = updateSocialLife(); } },
    { name: "agency", run() { updatePersonalAgency(); } },
    { name: "births", run(annual) { annual.newborn = updateBirths(); } },
    { name: "diplomacy", run() { updateDiplomacy(); } },
    { name: "court", run() { updateCourt(); } },
    // The council reads the settled factions from court. One bounded annual
    // session votes every lobbied bill with the dedicated "council" stream.
    { name: "councilDocket", run(annual) { annual.councilDocket = updateCouncilDocket(); } },
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
    // Envoy missions read the Chancellor and the foreign desk settled above.
    // One bounded annual audit only checks mandates, envoys and treaty ladders;
    // the player's staged decisions still make the actual negotiation roll.
    { name: "diplomaticMissions", run(annual) { annual.diplomaticMissions = updateDiplomaticMissions(); } },
    { name: "civic", run() { updateCivic(); } },
    { name: "endeavours", run() { updateEndeavours(); } },
    { name: "crownSupply", run() { settleCrownSupply(); } },
    // Settlement seats first receive their bounded annual crown allotment, then
    // the one bounded road survey wears the network and assesses each owner's
    // obligation. Neither pass touches the per-tick hot path.
    { name: "settlementMaintenance", run(annual) { annual.settlementMaintenance = updateSettlementMaintenance(); } },
    { name: "roadSurvey", run(annual) { annual.roadSurvey = updateRoadWear(); } },
    // The forest war council settles one bounded year on the same fronts the
    // world map is about to survey. It reads the treaty the court just settled
    // and writes province control, pressure, scars and reserved timber before
    // the world survey sees them.
    { name: "forestWarfare", run(annual) { annual.forestWarfare = updateForestWarfare(); } },
    // The world survey runs once per year, after diplomacy and the settlement
    // grants: it moves standing caravans through the existing market stock and
    // reads the border pressure the realms just settled.
    { name: "worldMap", run(annual) { annual.worldMap = updateWorldMap(); } },
    // Feudal contracts read the settled houses, hosts and theatres above. One
    // annual pass settles ready campaigns with the dedicated campaign stream;
    // nothing here touches combat's random draw order.
    { name: "campaignSettle", run(annual) { annual.campaignSettle = settleAnnualCampaigns(); } },
    // One bounded hazard pass at the year boundary: eruption, earthquake,
    // ashfall and real destruction on volcanic ground. Temperate worlds return
    // immediately, so the shared campaign keeps its existing tick cost.
    // 1.2.20 settles the long-lived hazard processes once per year: multi-year
    // drought, plague spread along trade routes, wildfire zones, flood scars,
    // climate drift and the arcane burden. The seasonal pass below handles the
    // four in-year hazard seasons, so neither adds per-tick work.
    { name: "environmentalHazards", run(annual) { annual.environmentalHazards = updateEnvironmentalHazardYear(); } },
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
// The last maintenance slice and the first daily tick are separate frames. A
// mature year boundary used to finish both in one frame, which pushed an
// otherwise healthy low-end frame over 50 ms. No simulation time passes while
// these flags are set, so the order and the resulting state are unchanged.
let annualFinishPending = null;
// A daily tick is split into bounded deterministic slices in the presented
// loop: settlement services, household needs, winter/crown, population/citizen,
// land, economy/labour, then the remaining realm systems. A heavy autumn
// harvest, a season atlas pass and a cold JIT path can no longer stack into one
// low-end frame. Headless callers keep the whole tick in one call, so campaign
// determinism and save order are unchanged.
let pendingDayPhase = 0;
let pendingDayNewborn = null;
let pendingSettlementNeeds = false;

export function setAnnualMaintenanceSlicing(enabled) {
    annualSlicingEnabled = enabled === true;
}

export function resetAnnualMaintenance() {
    annualPending = null;
    annualFinishPending = null;
    pendingDayPhase = 0;
    pendingDayNewborn = null;
}

export function hasPendingAnnualMaintenance() {
    return annualPending !== null || annualFinishPending !== null || pendingDayPhase !== 0;
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
        royalEducation: null,
        volcanoHazards: null,
        coastHazards: null,
        roadSurvey: null,
        settlementMaintenance: null,
        worldMap: null,
        winterAnnual: null,
        environmentalHazards: null,
        biomeAtlas: null
    };
}

function runAnnualTasks(annual, forceAll = false) {
    for (;;) {
        const task = ANNUAL_TASKS[annual.index];
        task.run(annual);
        annual.index++;
        if (annual.index >= ANNUAL_TASKS.length) return true;
        if (forceAll || !annualSlicingEnabled) continue;
        return false;
    }
}

function logAnnualResults(annual) {
    if (annual.succession?.changed) {
        addLog("THE CROWN PASSES TO " + (annual.succession.king.person?.name || "THE HEIR"), "#e8c77b", "dynasty");
    }
    if (annual.royalEducation?.ready?.length) {
        addLog("A ROYAL STUDENT IS READY FOR A COMING-OF-AGE AUDIENCE", "#e8c77b", "dynasty");
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

function scheduleAnnualCompletion(annual) {
    annualPending = null;
    annualFinishPending = annual;
}

function completeAnnualMaintenance(annual, splitDaily = true) {
    annualPending = null;
    annualFinishPending = null;
    logAnnualResults(annual);
    // In the presented loop the year-start day uses the same bounded slices as
    // every other day: season/atlas first, then settlement, population, land,
    // production, health and the rest. Headless callers and saves keep the
    // complete synchronous tick.
    finishSimulationTick(annual.newborn, splitDaily);
}

// Run the next maintenance slice. The game loop calls this without consuming
// simulation time, so the clock cannot build a catch-up backlog while the realm
// is paused for a few frames at the year boundary.
export function advanceAnnualMaintenance() {
    // Empty settlement/winter slices collapse into the next slice in the same
    // frame. Only a slice that actually ran a system stops the frame, so a
    // normal day still takes the same number of frames as before while the
    // two settlement slices and the seasonal crown settlement stay isolated.
    while (true) {
        if (pendingDayPhase === 1) {
            pendingDayPhase = 2;
            if (finishDailyServices()) return false;
            continue;
        }
        if (pendingDayPhase === 2) {
            pendingDayPhase = 3;
            if (finishDailySettlementNeeds()) return false;
            continue;
        }
        if (pendingDayPhase === 3) {
            pendingDayPhase = 4;
            if (finishDailyWinterAndCrown()) return false;
            continue;
        }
        if (pendingDayPhase === 4) {
            pendingDayPhase = 5;
            finishDailyMiddle(pendingDayNewborn);
            pendingDayNewborn = null;
            return false;
        }
        if (pendingDayPhase === 5) {
            pendingDayPhase = 6;
            finishDailyLand();
            return false;
        }
        if (pendingDayPhase === 6) {
            pendingDayPhase = 7;
            finishDailyEconomy();
            return false;
        }
        if (pendingDayPhase === 7) {
            pendingDayPhase = 0;
            finishDailyRealm();
            return true;
        }
        if (annualFinishPending) {
            completeAnnualMaintenance(annualFinishPending);
            return false;
        }
        if (!annualPending) return false;
        if (!runAnnualTasks(annualPending)) return false;
        scheduleAnnualCompletion(annualPending);
        return false;
    }
}

// Saving from inside a maintenance window must capture a complete tick. This
// path is deliberately allowed to take the full annual cost once, outside the
// presented frame budget, instead of persisting a half-updated year.
export function finishAnnualMaintenanceForSave() {
    if (pendingDayPhase) {
        completeAnnualDay();
        return true;
    }
    if (annualFinishPending) {
        completeAnnualMaintenance(annualFinishPending, false);
        return true;
    }
    if (!annualPending) return false;
    runAnnualTasks(annualPending, true);
    completeAnnualMaintenance(annualPending, false);
    return true;
}

function finishSimulationTick(newborn, splitDaily = false) {
    pendingDayPhase = 0;
    pendingDayNewborn = newborn;
    pendingSettlementNeeds = false;
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
    if (splitDaily) {
        // Phase 1 is the settlement/winter/crown pass; seasons and the atlas
        // revision stay in this first frame so the new season is visible at
        // once, while the expensive household and logistics work follows on
        // later frames in the original order.
        pendingDayPhase = 1;
        return;
    }
    finishDailyPrework();
    finishDailyMiddle(newborn);
    pendingDayNewborn = null;
    finishDailyRemainder();
}

function settlementIsDue() {
    return state.hasStarted && !state.isPaused && !state.gameOver &&
        state.tick > 0 && state.tick % SETTLEMENT_INTERVAL === 0;
}

// The settlement pass is deliberately split over two frames. Service coverage
// is cheap; the household heating pass can resolve a path per house on the
// first winter day. Both still run at the same tick boundary, in the original
// order, with no simulation work between them.
function finishDailyServices() {
    resetIncome();
    if (!settlementIsDue()) return false;
    updateServices();
    pendingSettlementNeeds = true;
    return true;
}

function finishDailySettlementNeeds() {
    if (!pendingSettlementNeeds) return false;
    pendingSettlementNeeds = false;
    updateSettlementNeeds();
    return true;
}

function finishDailyWinterAndCrown() {
    let didWork = false;
    // Twenty-day winter ledger. It is a no-op outside the snow climate and
    // outside its cadence.
    if (updateWinterEconomy()) didWork = true;
    // The standing grain contract delivers once per season. This is a single
    // bounded call four times a year.
    if (state.tick % 100 === 0 && (state.crownSupply?.grainLevel || 0) >= 4) {
        settleCrownSupply();
        didWork = true;
    }
    return didWork;
}

function finishDailyPrework() {
    finishDailyServices();
    finishDailySettlementNeeds();
    finishDailyWinterAndCrown();
}

function finishDailyMiddle(newborn) {
    const newcomer = newborn ? null : updatePopulation();
    updateCitizenRegister();
    if (newborn) addLog("A CHILD WAS BORN: " + newborn.person.name, "#e8c77b", "family");
    else if (newcomer) addLog("A NEW RESIDENT HAS JOINED THE REALM", "#a3d6a7", "population");
}

// One bounded group of the daily tick. The groups preserve the exact original
// call order; only the frame boundary between them changes.
function finishDailyLand() {
    updateFields();
    updateForestSuccession();
    if (state.resourceGeography) regrowForests(400, { slice: state.tick % 400, slices: 400 });
    updateForestFauna();
    updateForestPannage();
}

function finishDailyEconomy() {
    updateBuildingIncome();
    // Regional forest workshops run at their own bounded cadence. The call is
    // a tick guard on every other day and at most eight batches per pass, so it
    // never competes with the ordinary producer settlement.
    updateForestIndustry();
    // Forest culture is a season guard plus one bounded annual pass. It does no
    // per-tile work on an ordinary day and never consumes the shared RNG.
    updateForestCulture();
    updateForestGuild();
    updateGrandConsumers();
    updateCraftProduction(annualSlicingEnabled ? { supply: 5, craft: 1 } : 0);
    updateLogistics();
    updateConstruction();
    updateVillagers();
    updateMilitary();
    updateCampaignProgress();
    updateCombat();
    updateExpeditions();
}

function finishDailyRealm() {
    checkRandomEvents();
    updateWeather(); updateMorale(); updateMarket(); updateEconomy(); updateRealmCycle(); updateHealth(); updateAmbitions();
    // Endless ages advance once per 25 years. A collapse is a recoverable
    // setback in an endless realm rather than a terminal game-over.
    updateEndlessRealm();
    updateEndlessRelief();
    // Authored scenarios evaluate one objective once per calendar day. This is
    // a bounded read of the named system's value, not a second simulation pass.
    updateScenario();
    // Rare-biome discovery is checked every 200 ticks; yields and hazards
    // settle once per year. The call itself is a couple of integer reads.
    updateSpecialBiomes();
    // 1.2.20 hazard layer. The call is a constant-time guard on the current
    // season; the real work happens at most four times a year, plus the one
    // annual task above.
    updateEnvironmentalHazards();
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

function finishDailyRemainder() {
    finishDailyLand();
    finishDailyEconomy();
    finishDailyRealm();
}

function completeAnnualDay() {
    if (pendingDayPhase <= 1) finishDailyServices();
    if (pendingDayPhase <= 2) finishDailySettlementNeeds();
    if (pendingDayPhase <= 3) finishDailyWinterAndCrown();
    if (pendingDayPhase <= 4) finishDailyMiddle(pendingDayNewborn);
    if (pendingDayPhase <= 5) finishDailyLand();
    if (pendingDayPhase <= 6) finishDailyEconomy();
    finishDailyRealm();
    pendingDayNewborn = null;
    pendingSettlementNeeds = false;
    pendingDayPhase = 0;
}

export function updateSimulation() {
    if (state.isPaused || state.gameOver || !state.hasStarted) return;
    // Defensive path for callers that invoke updateSimulation directly while
    // the presented loop owns an in-flight rollover. The game loop itself
    // advances maintenance without consuming simulation time.
    if (annualPending || annualFinishPending || pendingDayPhase) {
        advanceAnnualMaintenance();
        return;
    }
    const previousYear = state.year;
    state.tick++; state.dayOfYear++;
    if (state.dayOfYear >= 400) { state.dayOfYear = 0; state.year++; }
    if (state.year > previousYear) {
        annualPending = createAnnualMaintenance();
        // Headless callers keep the synchronous campaign order. The presented
        // loop always defers the first daily tick to the next frame, even when
        // every annual task happened to fit into this first slice.
        if (annualSlicingEnabled) {
            if (!runAnnualTasks(annualPending)) return;
            scheduleAnnualCompletion(annualPending);
            return;
        }
        runAnnualTasks(annualPending, true);
        completeAnnualMaintenance(annualPending, false);
        return;
    }
    finishSimulationTick(null, annualSlicingEnabled);
}
