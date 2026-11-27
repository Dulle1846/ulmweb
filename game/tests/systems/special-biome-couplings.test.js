import test from "node:test";
import assert from "node:assert/strict";
import { state, resetState } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import {
    createSpecialBiomeState, generateSpecialBiomes, getSpecialBiomeSnapshot,
    normalizeSpecialBiomeState, rebuildSpecialBiomeAtlas, serializeSpecialBiomeState,
    updateSpecialBiomes, attuneSpecialBiome, validateSpecialBiomeState
} from "../../js/systems/special-biome-state.js";
import {
    BIOME_FOLLOW_UP_ARCHIVE_LIMIT, biomeFollowUpChoices, createSpecialBiomeCouplingState,
    getBiomeCombatModifiersAt, getBiomeFollowUpSnapshot, getBiomeQuestSnapshot,
    blightChoices, getBlightDecisionSnapshot, getSpecialBiomeInfluence, onSpecialBiomeDiscovered,
    resolveBiomeQuest, resolveBiomeQuestFollowUp, resolveBlightDecision, updateSpecialBiomeCouplings,
    validateSpecialBiomeCouplingState
} from "../../js/systems/special-biome-couplings.js";
import { getSpecialBiomeInfluence as getCachedInfluence } from "../../js/systems/special-biome-couplings.js";
import { getDiplomacySnapshot, updateDiplomacy } from "../../js/systems/diplomacy.js";
import { updateCombat } from "../../js/simulation/combat.js";
import { getHarvestYieldFactor } from "../../js/systems/economy-cycle.js";
import { getPopulationGrowthAllowance } from "../../js/systems/population.js";
import { getBuildingEfficiency } from "../../js/systems/economy.js";
import { updateRealmCycle, getRealmCycleSnapshot } from "../../js/systems/realm-cycle.js";
import { getExpeditionSnapshot } from "../../js/systems/expeditions.js";

const SEED = 20261161;
const SIZE = 100;

function baseWorld() {
    resetState();
    state.hasStarted = true;
    state.worldSeed = SEED;
    state.worldW = SIZE;
    state.worldH = SIZE;
    state.seaLevel = 0.33;
    state.terrainResolution = 1;
    state.terrainPixW = SIZE;
    state.terrainPixH = SIZE;
    state.heightMap = new Float32Array(SIZE * SIZE).fill(0.62);
    state.moistureMap = new Float32Array(SIZE * SIZE).fill(0.5);
    state.temperatureMap = new Float32Array(SIZE * SIZE).fill(0.55);
    state.explored = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
    state.resources = { wood: 300, stone: 300, gold: 300, food: 300 };
    state.morale = 72;
    state.seasonIndex = 1;
    state.weather = "clear";
    state.worldOptions = { climate: "temperate", resources: 55 };
    state.year = 2;
    state.tick = 200;
    state.entities = [];
}

function setAtlas(regions, options = {}) {
    baseWorld();
    state.specialBiomes = createSpecialBiomeState({ seed: SEED, rareGoods: options.rareGoods || {} }, regions);
    rebuildSpecialBiomeAtlas();
    return state.specialBiomes;
}

function region(overrides = {}) {
    return {
        id: "coupling-region",
        family: "enchanted-wood",
        x: 50,
        y: 50,
        radius: 8,
        discovered: true,
        discoveredYear: 1,
        attuned: true,
        richness: 1.1,
        ...overrides
    };
}

function soldier(type, x, y, extra = {}) {
    return {
        type,
        x,
        y,
        hp: 1000,
        maxHp: 1000,
        dead: false,
        military: { origin: "regular", rank: "veteran" },
        isEnemy: () => false,
        ...extra
    };
}

test("diplomacy reads the cached biome profile and changes annual relations", () => {
    baseWorld();
    state.entities = [];
    const baseline = updateDiplomacy();
    const baselineRelation = baseline.averageRelation;

    setAtlas([region()]);
    state.entities = [];
    const influenced = updateDiplomacy();
    assert.ok(influenced.biomeInfluence.relationDrift > 0);
    assert.ok(influenced.averageRelation > baselineRelation,
        "biome influence must move the neighbouring courts, not only the panel");
    assert.equal(influenced.realms.length, 4);
});

test("combat reads local biome cover and attrition on the battlefield", () => {
    baseWorld();
    const enemy = { x: 50, y: 50, hp: 220, maxHp: 220, dead: false, type: TYPE.TROLL, isEnemy: () => true };
    const defender = soldier(TYPE.GUARD, 51, 50);
    state.entities = [enemy, defender];
    state.tick = 13;
    updateCombat();
    const baselineDamage = defender.maxHp - defender.hp;
    assert.ok(baselineDamage > 0);

    setAtlas([region({ family: "ash-shadow", name: "Cinder Reach" })]);
    const enemy2 = { x: 50, y: 50, hp: 220, maxHp: 220, dead: false, type: TYPE.TROLL, isEnemy: () => true };
    const defender2 = soldier(TYPE.GUARD, 51, 50);
    state.entities = [enemy2, defender2];
    state.tick = 13;
    updateCombat();
    const biomeDamage = defender2.maxHp - defender2.hp;
    assert.ok(biomeDamage < baselineDamage,
        "charted cover and attunement must reduce real raid damage");
    assert.ok(getBiomeCombatModifiersAt(50, 50).enemyAttrition > 0);

    setAtlas([region({ family: "ash-shadow", name: "Cinder Reach" })]);
    const enemy3 = { x: 50, y: 50, hp: 220, maxHp: 220, dead: false, type: TYPE.TROLL, isEnemy: () => true };
    state.entities = [enemy3, soldier(TYPE.GUARD, 51, 50)];
    state.tick = 37;
    updateCombat();
    assert.ok(enemy3.hp < 220, "the same biome must bleed an attacker through attrition");
});

test("city harvest, building production and household growth read the atlas", () => {
    baseWorld();
    state.year = 10;
    // A healthy mature settlement is the precondition for the extra biome
    // growth slot; the water/safety/food gates still apply.
    state.city = { needs: { summary: { water: 1, safety: 1, satisfaction: 1 } } };
    const baselineHarvest = getHarvestYieldFactor();
    const baselineGrowth = getPopulationGrowthAllowance();
    const building = { type: TYPE.FARM, x: 2, y: 2, construction: { stage: 3 }, dead: false };
    const workforce = {
        workersByBuilding: new Map([[building, 2]]),
        skillByBuilding: new Map([[building, 50]]),
        experienceByBuilding: new Map([[building, 25]])
    };
    const baselineEfficiency = getBuildingEfficiency(building, workforce);

    setAtlas([region()]);
    state.year = 10;
    state.city = { needs: { summary: { water: 1, safety: 1, satisfaction: 1 } } };
    const influencedHarvest = getHarvestYieldFactor();
    const influencedGrowth = getPopulationGrowthAllowance();
    const influencedEfficiency = getBuildingEfficiency(building, workforce);
    assert.ok(influencedHarvest > baselineHarvest,
        "an attuned enchanted wood must raise the harvest factor");
    assert.ok(influencedGrowth > baselineGrowth,
        "attunement must open a real household growth slot");
    assert.ok(influencedEfficiency > baselineEfficiency,
        "biome production must reach the building efficiency ledger");
});

test("discovery and attunement open quests; resolving a rite has a consequence", () => {
    setAtlas([region({ attuned: false, rareGoods: {} })], { rareGoods: { "aether-herb": 4 } });
    const questSnapshot = getBiomeQuestSnapshot();
    onSpecialBiomeDiscovered(state.specialBiomes.regions[0]);
    const discovered = getBiomeQuestSnapshot();
    const survey = discovered.quests.find(quest => quest.kind === "survey");
    assert.ok(survey, "discovery must create a survey quest");
    assert.equal(discovered.active, 1);
    const surveyResult = resolveBiomeQuest(survey.id, "seal");
    assert.equal(surveyResult.ok, true);
    assert.equal(surveyResult.quest.status, "completed");
    assert.equal(getBiomeQuestSnapshot().completed, 1);

    const attune = attuneSpecialBiome("coupling-region");
    assert.equal(attune.ok, true);
    const rite = getBiomeQuestSnapshot().quests.find(quest => quest.kind === "rite");
    assert.ok(rite, "attunement must create a rite quest");
    const beforeMorale = state.morale;
    const riteResult = resolveBiomeQuest(rite.id, "perform");
    assert.equal(riteResult.ok, true);
    assert.equal(getBiomeQuestSnapshot().rites >= 1, true);
    assert.ok(state.morale > beforeMorale, "performing the rite must change the realm state");
    const followUps = getBiomeFollowUpSnapshot();
    assert.equal(followUps.open, 2);
    assert.equal(followUps.armed, 2);
    assert.ok(followUps.followUps.some(entry => entry.sourceQuestId === survey.id));
    assert.ok(followUps.followUps.some(entry => entry.sourceQuestId === rite.id));
});

test("a completed atlas quest arms one bounded follow-up with real costs and rewards", () => {
    setAtlas([region({ attuned: false, rareGoods: {} })], { rareGoods: { "aether-herb": 4 } });
    onSpecialBiomeDiscovered(state.specialBiomes.regions[0]);
    const survey = getBiomeQuestSnapshot().quests.find(quest => quest.kind === "survey");
    const resolved = resolveBiomeQuest(survey.id, "survey");
    assert.equal(resolved.ok, true);
    assert.equal(resolved.followUp.kind, "trail");
    assert.equal(resolved.followUp.stage, "open");
    assert.equal(resolved.followUp.expiresYear, state.year + 3);
    assert.equal(getBiomeFollowUpSnapshot().open, 1);
    assert.equal(biomeFollowUpChoices(resolved.followUp).length, 2);

    const food = state.resources.food;
    const gold = state.resources.gold;
    const rareId = state.specialBiomes.regions[0].resource;
    const rareBefore = state.specialBiomes.rareGoods[rareId];
    const result = resolveBiomeQuestFollowUp(resolved.followUp.id, "surveyors");
    assert.equal(result.ok, true);
    assert.equal(result.choice, "surveyors");
    assert.equal(state.resources.food, food - 8);
    assert.equal(state.resources.gold, gold - 6);
    assert.equal(state.specialBiomes.rareGoods[rareId], rareBefore + 2);
    assert.equal(result.followUp.stage, "resolved");
    assert.equal(result.snapshot.resolved, 1);
    assert.equal(result.snapshot.open, 0);
    assert.equal(resolveBiomeQuestFollowUp(resolved.followUp.id, "surveyors").reason, "follow-up-not-open");
    assert.equal(getExpeditionSnapshot().stats.chainReady, 0, "atlas follow-ups never arm an expedition landmark chain");
});

test("an unanswered atlas follow-up lapses once at its annual deadline", () => {
    setAtlas([region({ attuned: false, rareGoods: {} })], {});
    onSpecialBiomeDiscovered(state.specialBiomes.regions[0]);
    const survey = getBiomeQuestSnapshot().quests.find(quest => quest.kind === "survey");
    const resolved = resolveBiomeQuest(survey.id, "seal");
    assert.equal(resolved.followUp.stage, "open");
    state.year = resolved.followUp.expiresYear + 1;
    state.specialBiomes.lastYear = state.year - 1;
    updateSpecialBiomeCouplings();
    const snapshot = getBiomeFollowUpSnapshot();
    assert.equal(snapshot.failed, 1);
    assert.equal(snapshot.open, 0);
    assert.match(snapshot.followUps[0].note, /window closed/i);
});

test("blight forces a costed administrative decision and expiry spreads the rot", () => {
    setAtlas([region({ family: "blighted-land", name: "The Grey Wound", spread: 2, attuned: false })]);
    state.year = 2;
    updateSpecialBiomeCouplings();
    const decision = getBlightDecisionSnapshot();
    assert.ok(decision, "pressure 2 blight must place a decree before the crown");
    assert.equal(decision.choices.length, 4);
    const food = state.resources.food;
    const gold = state.resources.gold;
    const result = resolveBlightDecision("quarantine");
    assert.equal(result.ok, true);
    assert.equal(state.resources.food, food - 10);
    assert.equal(state.resources.gold, gold - 5);
    assert.equal(state.specialBiomes.regions[0].spread, 1);
    assert.equal(getBlightDecisionSnapshot(), null);
    assert.equal(getSpecialBiomeSnapshot().couplings.blightActions.quarantine, 1);

    state.year = 3;
    state.specialBiomes.regions[0].spread = 2;
    updateSpecialBiomeCouplings();
    assert.ok(getBlightDecisionSnapshot());
    const spreadBefore = state.specialBiomes.regions[0].spread;
    state.year = 4;
    updateSpecialBiomeCouplings();
    assert.equal(getBlightDecisionSnapshot(), null);
    assert.ok(state.specialBiomes.regions[0].spread > spreadBefore,
        "an unanswered decree must spread the blight");
    assert.equal(getSpecialBiomeSnapshot().couplings.failedQuests >= 0, true);
});

test("a fungal hazard can seed a real public-health outbreak", () => {
    setAtlas([region({ family: "fungal-wilds", attuned: false, cleaned: false })], {});
    state.entities = [{ type: TYPE.VILLAGER, dead: false }];
    let outbreakYear = null;
    for (let year = 2; year < 120 && !outbreakYear; year++) {
        state.year = year;
        state.specialBiomes.lastYear = year - 1;
        state.specialBiomes.lastHazardYear = 0;
        updateSpecialBiomes();
        if (state.health?.outbreakActive) outbreakYear = year;
    }
    assert.ok(outbreakYear, "the bounded annual hazard roll should produce an outbreak within the sample");
    assert.equal(state.health.disease, "spore-lung");
    assert.ok(state.entities[0].illnessUntilTick > state.tick);
});

test("realm cycle reads blight pressure and exposes it to the administration", () => {
    setAtlas([region({ family: "blighted-land", spread: 4, attuned: false })]);
    state.year = 3;
    state.tick = 200;
    const baseline = getRealmCycleSnapshot();
    state.specialBiomes.regions[0].spread = 5;
    state.specialBiomes.regions[0].discovered = true;
    state.specialBiomes.regions[0].cleansed = false;
    updateSpecialBiomeCouplings();
    updateRealmCycle();
    const influenced = getRealmCycleSnapshot();
    assert.ok(influenced.biomeInfluence.unrest > 0);
    assert.ok(influenced.scarcity >= baseline.scarcity,
        "blight administration pressure must enter the scarcity signal");
});

test("the full coupling state survives save/load and old atlas saves get a fresh coupling block", () => {
    setAtlas([region({ attuned: false })], { rareGoods: { "aether-herb": 3 } });
    onSpecialBiomeDiscovered(state.specialBiomes.regions[0]);
    const survey = getBiomeQuestSnapshot().quests.find(quest => quest.kind === "survey");
    resolveBiomeQuest(survey.id, "survey");
    attuneSpecialBiome("coupling-region");
    updateSpecialBiomeCouplings();
    const before = serializeSpecialBiomeState();
    assert.ok(before.couplings.quests.length >= 2);
    assert.equal(before.couplings.questFollowUps.length, 1);
    const restored = normalizeSpecialBiomeState(JSON.parse(JSON.stringify(before)));
    const after = serializeSpecialBiomeState();
    assert.deepEqual(after.couplings, before.couplings);
    assert.deepEqual(getSpecialBiomeInfluence(), getCachedInfluence());
    assert.equal(getSpecialBiomeSnapshot().quests.completed, before.couplings.completedQuests);
    assert.equal(getSpecialBiomeSnapshot().quests.followUps.followUps.length, 1);

    state.specialBiomes = null;
    const legacy = normalizeSpecialBiomeState(null, SEED, [region({ attuned: false })]);
    assert.ok(legacy.couplings);
    assert.equal(legacy.couplings.quests.length, 0);
    assert.equal(legacy.couplings.questFollowUps.length, 0);
    assert.equal(legacy.couplings.version, 1);
});

test("malformed coupling blocks are rejected and the influence cache is bounded", () => {
    assert.throws(() => validateSpecialBiomeState({ regions: [], couplings: { version: 99 } }), /coupling/);
    assert.throws(() => validateSpecialBiomeState({ regions: [], couplings: { quests: [{}] } }), /quest/);
    setAtlas([region()]);
    const first = getSpecialBiomeInfluence();
    const second = getSpecialBiomeInfluence();
    assert.equal(first, second, "the influence profile must be cached, not rebuilt per read");
    assert.equal(first.regions, undefined);
    assert.ok(Object.isFrozen(first));
    assert.equal(createSpecialBiomeCouplingState({ quests: "bad" }).quests.length, 0);
    assert.throws(() => validateSpecialBiomeCouplingState({ questFollowUps: [{ kind: "trail", stage: "mythic" }] }), /stage/);
    assert.throws(() => validateSpecialBiomeCouplingState({
        questFollowUps: Array.from({ length: BIOME_FOLLOW_UP_ARCHIVE_LIMIT + 1 }, () => ({ kind: "trail", stage: "open" }))
    }), /bounded array/);
});

test("blight study and quarantine open one expedition follow-up; purge and ignore do not", () => {
    setAtlas([region({ family: "blighted-land", name: "The Grey Wound", spread: 4, attuned: false })]);
    state.year = 2;
    updateSpecialBiomeCouplings();
    assert.ok(getBlightDecisionSnapshot(), "pressure 4 blight must place a decree before the crown");
    assert.ok(blightChoices().find(choice => choice.id === "study").detail.includes("one landmark follow-up"));
    assert.ok(blightChoices().find(choice => choice.id === "quarantine").detail.includes("one landmark follow-up"));
    const studied = resolveBlightDecision("study");
    assert.equal(studied.ok, true);
    assert.equal(studied.siteChain.claim, "study");
    let snapshot = getExpeditionSnapshot();
    assert.equal(snapshot.stats.chainReady, 1);
    assert.equal(snapshot.stats.chainClosed, 0);
    assert.equal(snapshot.sites.filter(site => site.chainStage === 2).length, 1);
    assert.equal(snapshot.sites.find(site => site.id === studied.siteChain.siteId).claimLabel, studied.siteChain.claimLabel);

    setAtlas([region({ family: "blighted-land", name: "The Grey Wound", spread: 4, attuned: false })]);
    state.year = 2;
    updateSpecialBiomeCouplings();
    const purged = resolveBlightDecision("purge");
    assert.equal(purged.ok, true);
    assert.equal(purged.siteChain, null);
    snapshot = getExpeditionSnapshot();
    assert.equal(snapshot.stats.chainReady, 0);
    assert.equal(snapshot.sites.filter(site => site.chainStage === 2).length, 0);

    setAtlas([region({ family: "blighted-land", name: "The Grey Wound", spread: 4, attuned: false })]);
    state.year = 2;
    updateSpecialBiomeCouplings();
    const quarantined = resolveBlightDecision("quarantine");
    assert.equal(quarantined.ok, true);
    assert.equal(quarantined.siteChain.claim, "quarantine");
    snapshot = getExpeditionSnapshot();
    assert.equal(snapshot.stats.chainReady, 1);
    assert.equal(snapshot.sites.filter(site => site.id === quarantined.siteChain.siteId)[0].claim, "quarantine");

    setAtlas([region({ family: "blighted-land", name: "The Grey Wound", spread: 4, attuned: false })]);
    state.year = 2;
    updateSpecialBiomeCouplings();
    const ignored = resolveBlightDecision("ignore");
    assert.equal(ignored.ok, true);
    assert.equal(ignored.siteChain, null);
    assert.equal(getExpeditionSnapshot().stats.chainReady, 0);
});
