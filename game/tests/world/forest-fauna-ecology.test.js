import test from "node:test";
import assert from "node:assert/strict";
import {
    FOREST_FAUNA_POINTS, FOREST_FAUNA_POINT_IDS, FOREST_FAUNA_NOTES, FAUNA_SEASONS,
    faunaSeasonAt, forestFaunaEcologyFor, forestFaunaSignalsFor,
    forestFaunaCommunityFor, forestFaunaEcologySummary, forestFaunaFieldGuide,
} from "../../js/world/forest-fauna-ecology.js";
import {
    FOREST_FAUNA, forestGoodsFor, forestStandAt,
} from "../../js/world/forest-ecology.js";
import { forestFaunaHabitatScore } from "../../js/systems/forest-fauna.js";

const SEASON_DAY = Object.freeze({ spring: 40, summer: 140, autumn: 240, winter: 340 });

const STRUCTURE = Object.freeze({
    deadwoodProfile: Object.freeze({
        total: 0.62, standing: 0.36, fallen: 0.5, stumps: 0.14,
        decay: 0.68, habitat: 0.82, cavityTreesPerHa: 15,
    }),
    edgeProfile: Object.freeze({ active: true, mantleCover: 0.76, widthM: 18 }),
    gapProfile: Object.freeze({ fraction: 0.3, regenerationShare: 0.72, light: 0.55 }),
    understoryProfile: Object.freeze({ shrub: 0.72, sapling: 0.62, browse: 0.3 }),
    herbProfile: Object.freeze({ cover: 0.72, food: 0.78, medicine: 0.55, flowering: 0.72 }),
    litterProfile: Object.freeze({ depthCm: 9, cToN: 20, quality: 0.7 }),
    epiphyteCover: 0.52, lianaCover: 0.3, canopyGap: 0.3, layers: 6,
});

const DYNAMICS = Object.freeze({
    structure: STRUCTURE,
    soil: Object.freeze({
        mycorrhiza: 0.82, decomposition: 0.72, rootDepth: 0.7,
        waterUptake: 0.62, humusDepthCm: 8,
    }),
    working: Object.freeze({
        forage: Object.freeze({
            mast: 0.82, berries: 0.62, honey: 0.58, mushrooms: 0.66,
            game: 0.74, herbs: 0.6, fibre: 0.3,
        }),
        habitat: Object.freeze({ score: 0.84 }),
    }),
    health: Object.freeze({
        siteFitness: 0.86, diseaseResistance: 0.72, pestFactor: 0.3,
        droughtStress: 0.1, wetStress: 0.05, coldStress: 0.1,
    }),
    silviculture: Object.freeze({ browsePressure: 0.12, timberFactor: 1 }),
    regeneration: Object.freeze({ geneticDiversity: 0.72, factor: 1.1 }),
    age: Object.freeze({ phase: "old-growth", cohorts: { young: 0.1, mature: 0.5, ancient: 0.4 } }),
});

function rich(overrides = {}) {
    const base = {
        forest: true, x: 14, y: 11, seed: 20261126,
        type: "oakwood", formation: "oakwood",
        regionalType: { key: "temperate-broadleaf", label: "Sommergrüner Laubmischwald" },
        regionalLabel: "Sommergrüner Laubmischwald",
        regionalEffects: { fauna: 1.1, forage: 1.05, work: 1 },
        ageClass: "ancient", canopy: 0.86, density: 0.82,
        moisture: 0.7, wetness: 0.74, temperature: 0.55, height: 0.32,
        coniferShare: 0.1, broadleafShare: 0.9, deadwood: 0.62,
        mastCrop: 0.8, edge: true, clearing: 0.22, light: 0.3,
        ground: {
            litter: 0.7, moss: 0.62, flowers: 0.7, mushrooms: 0.55,
            compaction: 0.1, huntingPressure: 0.12, pools: 0.3, logs: 0.5,
        },
        understory: { shrub: 0.66, berry: 0.55, fern: 0.4, sapling: 0.5 },
        structure: STRUCTURE,
        dynamics: DYNAMICS,
        species: [{ id: "oak", weight: 0.55 }, { id: "beech", weight: 0.3 }, { id: "willow", weight: 0.15 }],
        goods: ["timber", "game", "honey", "mushrooms", "berries", "fish"],
        fauna: ["deer", "roe-deer", "boar", "fox", "owl", "woodpecker", "songbird", "beaver", "otter"],
    };
    return { ...base, ...overrides };
}

function poor(overrides = {}) {
    return {
        forest: true, x: 3, y: 4, seed: 7,
        type: "pinewood", formation: "pinewood",
        regionalType: { key: "pine-birch", label: "Kiefern-Birkenwald" },
        regionalEffects: { fauna: 0.9, forage: 0.9, work: 1 },
        ageClass: "young", canopy: 0.92, density: 0.9,
        moisture: 0.22, wetness: 0.18, temperature: 0.6, height: 0.4,
        coniferShare: 0.95, broadleafShare: 0.05, deadwood: 0.04,
        mastCrop: 0.05, edge: false, clearing: 0.02, light: 0.15,
        ground: {
            litter: 0.1, moss: 0.05, flowers: 0.02, mushrooms: 0.02,
            compaction: 0.7, huntingPressure: 0.4, pools: 0, logs: 0.02,
        },
        understory: { shrub: 0.05, berry: 0.02, fern: 0.05, sapling: 0.05 },
        structure: {},
        dynamics: { structure: {}, soil: {}, working: {}, health: { siteFitness: 0.35, pestFactor: 0.8 } },
        species: [{ id: "pine", weight: 0.95 }],
        goods: ["timber"],
        fauna: ["deer", "fox"],
        ...overrides,
    };
}

function ecology(stand, season = "summer", extra = {}) {
    return forestFaunaEcologyFor(stand, { day: SEASON_DAY[season], ...extra });
}

function findForestStand(overrides = {}, predicate = null) {
    for (let y = 0; y < 48; y += 3) {
        for (let x = 0; x < 48; x += 3) {
            const stand = forestStandAt(x + 0.5, y + 0.5, {
                seed: 20261126, moisture: 0.62, temperature: 0.55, height: 0.35,
                climate: "temperate", forests: 68, faunaDetail: true, ...overrides,
            });
            if (stand.forest && (!predicate || predicate(stand))) return stand;
        }
    }
    return null;
}

test("all thirty point records exist, are bounded and deterministic", () => {
    assert.equal(FOREST_FAUNA_POINT_IDS.length, 30);
    const sections = [
        "deer", "boar", "bear", "wolf", "lynx", "raptors", "owls", "woodpeckers",
        "songbirds", "beavers", "otters", "smallPredators", "lagomorphs", "rodents",
        "bats", "insects", "ants", "wildBees", "butterflies", "deadwoodBeetles",
        "amphibians", "reptiles", "fish", "waterFilters", "fungi", "mossLichen",
        "parasites", "scavengers", "cycles", "corridors",
    ];
    const record = ecology(rich());
    for (const [index, section] of sections.entries()) {
        const pointId = FOREST_FAUNA_POINT_IDS[index];
        assert.equal(FOREST_FAUNA_POINTS[pointId].key, section);
        assert.ok(record[section], `${pointId} must own a record`);
        assert.equal(record[section].id, pointId, `${section} must name its point id`);
    }
    const again = ecology(rich());
    assert.deepEqual(again, record, "the same stand and day must produce the same fauna record");
    assert.match(record.headline, /deer|boar|wolf|bear|beaver|otter/i);
    assert.match(forestFaunaEcologySummary(record), /browse/i);
    assert.deepEqual(forestFaunaSignalsFor(rich()), record.signals);
    assert.equal(ecology(null), null);
});

test("the field guide expands all thirty points with live facts and field notes", () => {
    const guide = forestFaunaFieldGuide(ecology(rich()));
    assert.equal(guide.length, 30);
    assert.equal(new Set(guide.map(entry => entry.id)).size, 30);
    for (const [index, entry] of guide.entries()) {
        assert.equal(entry.id, FOREST_FAUNA_POINT_IDS[index]);
        assert.equal(entry.title, FOREST_FAUNA_POINTS[entry.id].title);
        assert.equal(entry.group, FOREST_FAUNA_POINTS[entry.id].group);
        assert.equal(entry.note, FOREST_FAUNA_NOTES[entry.id]);
        assert.ok(entry.note.length >= 60, entry.id + " needs a useful field note");
        assert.equal(entry.facts.length, 2, entry.id + " needs two live readings");
        assert.ok(entry.facts.every(fact => fact && !/undefined|NaN/.test(fact)),
            entry.id + " must not leak missing values");
    }
    assert.equal(forestFaunaFieldGuide(null).length, 0);
});

test("091 regional deer follow the regional forest and climate", () => {
    const boreal = ecology(rich({ regionalType: { key: "boreal-taiga", label: "Borealer Nadelwald" }, species: [{ id: "spruce", weight: 1 }] }));
    assert.equal(boreal.deer.species[0].id, "moose");
    const temperate = ecology(rich());
    assert.deepEqual(temperate.deer.species.map(entry => entry.id), ["red-deer", "roe-deer", "fallow-deer"]);
    const mediterranean = ecology(rich({ regionalType: { key: "mediterranean-hardleaf", label: "Mediterraner Hartlaubwald" } }));
    assert.equal(mediterranean.deer.species[0].id, "fallow-deer");
    const tropical = ecology(rich({ tropical: {}, regionalType: { key: "tropical-rainforest", label: "Tropischer Regenwald" } }));
    assert.equal(tropical.deer.species[0].id, "red-brocket");
    const savanna = ecology(rich({ regionalType: { key: "miombo", label: "Miombo-Wald" } }));
    assert.equal(savanna.deer.species[0].id, "greater-kudu");
    assert.equal(new Set(temperate.deer.species.map(entry => entry.id)).size, 3);
    assert.ok(temperate.deer.densityPer100Ha > 2);
    assert.ok(temperate.deer.densityPer100Ha < 30);
    assert.equal(temperate.deer.rutSeason, false);
    assert.equal(ecology(rich(), "autumn").deer.rutSeason, true);
    assert.ok(temperate.deer.hunting.quotaPer100Ha >= 0);
});

test("092 boar rooting responds to mast and litter and damages the floor", () => {
    const mastRich = ecology(rich({ dynamics: { ...DYNAMICS, working: { ...DYNAMICS.working, forage: { ...DYNAMICS.working.forage, mast: 0.95 } } } }));
    const mastPoor = ecology(poor());
    assert.ok(mastRich.boar.rooting > mastPoor.boar.rooting);
    assert.ok(mastRich.boar.sounderSize > mastPoor.boar.sounderSize);
    assert.ok(mastRich.boar.soilDamage > 0);
    assert.ok(mastRich.boar.mastUse > mastPoor.boar.mastUse);
    assert.ok(mastRich.boar.cropRisk >= 0 && mastRich.boar.cropRisk <= 100);
    assert.ok(mastRich.boar.earthworms > mastPoor.boar.earthworms);
    assert.equal(mastRich.boar.farrowingSeason, false);
    assert.equal(ecology(mastRich, "spring").boar.farrowingSeason, true);
});

test("093 bears are rare apex predators tied to mast, berries and old growth", () => {
    const ancient = ecology(rich());
    const young = ecology(poor());
    assert.ok(ancient.bear.densityPer100Km2 > young.bear.densityPer100Km2);
    assert.ok(ancient.bear.densityPer100Km2 <= 6);
    assert.ok(ancient.bear.densityPer100Km2 >= 0);
    assert.ok(ancient.bear.denSites >= 1);
    assert.ok(ancient.bear.danger > 0 && ancient.bear.danger <= 1);
    assert.ok(ancient.bear.prey.includes("deer"));
    assert.equal(ancient.bear.berrySeason, false);
    assert.equal(ecology(ancient, "autumn").bear.berrySeason, true);
    assert.ok(ancient.bear.cubs === false || ancient.bear.cubs === true);
});

test("094 wolves form packs with territory, prey and a real hunt chance", () => {
    const record = ecology(rich({ regionalType: { key: "spruce-fir", label: "Fichten-Tannenwald" }, coniferShare: 0.8, broadleafShare: 0.2 }));
    assert.equal(record.wolf.present, true);
    assert.ok(record.wolf.packSize >= 2);
    assert.ok(record.wolf.territoryKm2 >= 70);
    assert.ok(record.wolf.huntSuccess > 0 && record.wolf.huntSuccess <= 1);
    assert.ok(record.wolf.livestockRisk >= 0 && record.wolf.livestockRisk <= 1);
    assert.ok(record.wolf.prey.includes("deer"));
    assert.equal(record.wolf.howlSeason, false);
    assert.equal(ecology(rich(), "winter").wolf.howlSeason, true);
    const isolated = ecology(poor({ ground: { ...poor().ground, huntingPressure: 1 } }));
    assert.ok(isolated.wolf.packSize <= record.wolf.packSize);
});

test("095 lynxes are solitary ambush hunters with bounded territory", () => {
    const record = ecology(rich());
    assert.equal(record.lynx.solitary, true);
    assert.ok(record.lynx.territoryKm2 >= 12 && record.lynx.territoryKm2 <= 50);
    assert.ok(record.lynx.stealth > 0 && record.lynx.stealth <= 1);
    assert.ok(record.lynx.ambushCover > 0);
    assert.ok(record.lynx.prey.includes("roe-deer"));
    assert.ok(record.lynx.densityPer100Km2 >= 0 && record.lynx.densityPer100Km2 <= 4);
});

test("096 raptors report forest health and increase with edge and cavities", () => {
    const richRecord = ecology(rich());
    const poorRecord = ecology(poor());
    assert.ok(richRecord.raptors.indicator > poorRecord.raptors.indicator);
    assert.ok(richRecord.raptors.forestHealth > 0 && richRecord.raptors.forestHealth <= 100);
    assert.ok(richRecord.raptors.pairs > poorRecord.raptors.pairs);
    assert.ok(richRecord.raptors.species.length >= 2);
    assert.ok(richRecord.raptors.huntingLanes > 0);
});

test("097 owls and 098 woodpeckers need hollows and standing deadwood", () => {
    const richRecord = ecology(rich());
    const poorRecord = ecology(poor());
    assert.ok(richRecord.owls.pairs > poorRecord.owls.pairs);
    assert.ok(richRecord.owls.hollows > poorRecord.owls.hollows);
    assert.ok(richRecord.owls.oldTrees > poorRecord.owls.oldTrees);
    assert.ok(richRecord.woodpeckers.pairs > poorRecord.woodpeckers.pairs);
    assert.ok(richRecord.woodpeckers.standingDeadwoodUse > poorRecord.woodpeckers.standingDeadwoodUse);
    assert.ok(richRecord.woodpeckers.cavitiesExcavated > poorRecord.woodpeckers.cavitiesExcavated);
    assert.ok(richRecord.woodpeckers.drumming > 0);
});

test("099 songbirds sing at dawn and fall quiet in winter", () => {
    const summer = ecology(rich(), "summer");
    const winter = ecology(rich(), "winter");
    assert.ok(summer.songbirds.chorus.dawn > summer.songbirds.chorus.midday);
    assert.ok(summer.songbirds.chorus.dusk > summer.songbirds.chorus.midday);
    assert.ok(summer.songbirds.chorus.dawn > winter.songbirds.chorus.dawn);
    assert.ok(summer.songbirds.speciesRichness >= winter.songbirds.speciesRichness);
    assert.ok(summer.songbirds.speciesRichness >= 3 && summer.songbirds.speciesRichness <= 34);
    assert.match(summer.songbirds.chorusWindow, /dawn/i);
    assert.match(winter.songbirds.chorusWindow, /contact|sparse/i);
});

test("100 beavers build dams, ponds and water storage in wet woods", () => {
    const wet = ecology(rich({
        type: "alluvial", regionalType: { key: "floodplain", label: "Auenwald" },
        species: [{ id: "willow", weight: 0.6 }, { id: "alder", weight: 0.4 }],
        wetness: 0.9,
    }));
    const dry = ecology(poor());
    assert.equal(wet.beavers.present, true);
    assert.ok(wet.beavers.colonies >= 1);
    assert.ok(wet.beavers.dams >= 1);
    assert.ok(wet.beavers.pondsHa > 0);
    assert.ok(wet.beavers.waterStorageM3 > 0);
    assert.ok(wet.beavers.floodRisk > 0);
    assert.ok(wet.beavers.coppiceUse > dry.beavers.coppiceUse);
    assert.equal(dry.beavers.present, false);
});

test("101 otters follow clean water and fish, not muddy stands", () => {
    const clean = ecology(rich({ wetness: 0.9, ground: { ...rich().ground, compaction: 0.02 } }));
    const dirty = ecology(rich({ wetness: 0.9, ground: { ...rich().ground, compaction: 0.95, huntingPressure: 0.9 } }));
    assert.ok(clean.otters.individuals > dirty.otters.individuals);
    assert.ok(clean.otters.cleanWaterNeed > 0);
    assert.ok(clean.otters.fishShare > 0);
    assert.ok(clean.otters.territoryKm >= 8 && clean.otters.territoryKm <= 30);
    assert.equal(ecology(poor()).otters.individuals, 0);
});

test("102 marten and weasel are distinct small predators", () => {
    const record = ecology(rich());
    assert.ok(record.smallPredators.marten.densityPer100Km2 >= 0);
    assert.ok(record.smallPredators.weasel.densityPer100Km2 > 0);
    assert.ok(record.smallPredators.marten.prey.includes("mouse"));
    assert.ok(record.smallPredators.weasel.prey.includes("rabbit"));
    assert.ok(record.smallPredators.weasel.rodentControl > 0);
    assert.ok(record.smallPredators.weasel.burrows >= 1);
    assert.ok(record.smallPredators.smallPreyRelief >= 0);
});

test("103 hares prefer open edges, rabbits follow dry sunny cultural ground", () => {
    const open = ecology(rich({ edge: true, clearing: 0.5, canopy: 0.45 }));
    const closed = ecology(rich({ edge: false, clearing: 0, canopy: 0.95, moisture: 0.7 }));
    assert.ok(open.lagomorphs.hare.densityPer100Ha > closed.lagomorphs.hare.densityPer100Ha);
    assert.ok(open.lagomorphs.hare.openEdge > 0);
    assert.ok(open.lagomorphs.rabbit.warrens >= 0);
    assert.ok(open.lagomorphs.rabbit.culturalFollower > 0);
    assert.ok(open.lagomorphs.rabbit.prey.includes("fox"));
    assert.equal(ecology(rich(), "spring").lagomorphs.hare.leverets, 2);
    assert.equal(ecology(rich(), "winter").lagomorphs.hare.leverets, 0);
});

test("104 rodents cache and disperse seed according to mast", () => {
    const richRecord = ecology(rich());
    const poorRecord = ecology(poor());
    assert.ok(richRecord.rodents.seedCacheKgHa > poorRecord.rodents.seedCacheKgHa);
    assert.ok(richRecord.rodents.seedDispersal > poorRecord.rodents.seedDispersal);
    assert.ok(richRecord.rodents.abundance > poorRecord.rodents.abundance);
    assert.ok(richRecord.rodents.cachedSpecies.includes("acorns"));
    assert.ok(richRecord.rodents.hoards >= 1);
    assert.ok(richRecord.rodents.owlPrey > 0);
});

test("105 bats roost in cavities and hibernate in winter", () => {
    const richRecord = ecology(rich());
    const poorRecord = ecology(poor());
    assert.ok(richRecord.bats.roosts > poorRecord.bats.roosts);
    assert.ok(richRecord.bats.nightlyInsectKg > 0);
    assert.ok(richRecord.bats.species.length >= 3);
    assert.equal(ecology(rich(), "winter").bats.activity, "hibernating");
    assert.equal(ecology(rich(), "summer").bats.activity, "nursery");
});

test("106 insects separate pollination, pest pressure and bird food", () => {
    const richRecord = ecology(rich());
    const poorRecord = ecology(poor());
    assert.ok(richRecord.insects.pollinators > poorRecord.insects.pollinators);
    assert.ok(richRecord.insects.pests >= 0 && richRecord.insects.pests <= 100);
    assert.ok(richRecord.insects.foodForBirdsKgHa > 0);
    assert.ok(richRecord.insects.speciesRichness > poorRecord.insects.speciesRichness);
    assert.ok(richRecord.insects.decomposers > 0);
    const outbreak = ecology(rich({
        dynamics: { ...DYNAMICS, health: { ...DYNAMICS.health, diseaseResistance: 0.1, droughtStress: 0.9, pestFactor: 0.9 } },
        disturbance: "bark-beetle", coniferShare: 0.9,
    }));
    assert.ok(outbreak.insects.pests > richRecord.insects.pests);
});

test("107 ants turn soil, defend pests and swarm in summer", () => {
    const spring = ecology(rich(), "spring");
    const poorRecord = ecology(poor());
    assert.ok(spring.ants.moundsPerHa > poorRecord.ants.moundsPerHa);
    assert.ok(spring.ants.soilTurnoverKgHaYear > 0);
    assert.ok(spring.ants.pestDefence > 0);
    assert.equal(spring.ants.swarming, false);
    assert.equal(ecology(rich(), "summer").ants.swarming, true);
});

test("108 wild bees have deadwood, ground and cavity nest sites", () => {
    const record = ecology(rich());
    const poorRecord = ecology(poor());
    assert.ok(record.wildBees.speciesRichness > poorRecord.wildBees.speciesRichness);
    assert.ok(record.wildBees.deadwoodNesters > 0);
    assert.ok(record.wildBees.groundNesters > 0);
    assert.ok(record.wildBees.pollinationShare > 0);
    assert.ok(record.wildBees.nestingSites > 0);
    assert.ok(record.wildBees.honeyPotential > 0);
});

test("109 butterflies fly in the warm season and disappear in winter", () => {
    const summer = ecology(rich(), "summer");
    const winter = ecology(rich(), "winter");
    assert.ok(summer.butterflies.speciesRichness > 0);
    assert.ok(summer.butterflies.flightWeeks > 0);
    assert.equal(winter.butterflies.flightWeeks, 0);
    assert.equal(winter.butterflies.seasonalColour, 0);
    assert.match(summer.butterflies.brood, /brood/);
    assert.ok(summer.butterflies.nectarSources > 0);
});

test("110 deadwood beetles are old-growth indicators", () => {
    const ancient = ecology(rich());
    const young = ecology(poor());
    assert.ok(ancient.deadwoodBeetles.speciesRichness > young.deadwoodBeetles.speciesRichness);
    assert.ok(ancient.deadwoodBeetles.oldGrowthIndicator > young.deadwoodBeetles.oldGrowthIndicator);
    assert.ok(ancient.deadwoodBeetles.deadwoodNeed > young.deadwoodBeetles.deadwoodNeed);
    assert.ok(ancient.deadwoodBeetles.redListed >= 0);
    assert.match(ancient.deadwoodBeetles.flightSeason, /spring|autumn/i);
});

test("111 amphibians need wet hollows and hibernate in winter", () => {
    const wet = ecology(rich({ wetness: 0.85, ground: { ...rich().ground, pools: 0.6 } }));
    const dry = ecology(poor());
    assert.equal(wet.amphibians.present, true);
    assert.ok(wet.amphibians.pools > 0);
    assert.equal(dry.amphibians.present, false);
    assert.equal(ecology(rich(), "winter").amphibians.chorusSeason, "hibernating");
    assert.match(ecology(rich(), "spring").amphibians.chorusSeason, /spawning/i);
    assert.ok(wet.amphibians.moistureNeed > 0);
});

test("112 reptiles need sunny clearings, not closed canopy", () => {
    const sunny = ecology(rich({ canopy: 0.4, clearing: 0.5, edge: true }));
    const closed = ecology(rich({ canopy: 0.95, clearing: 0, edge: false }));
    assert.ok(sunny.reptiles.abundance > closed.reptiles.abundance);
    assert.ok(sunny.reptiles.baskingSites > closed.reptiles.baskingSites);
    assert.ok(sunny.reptiles.sunnyClearings > 0);
    assert.match(sunny.reptiles.winterRefuge, /litter|root/i);
});

test("113 fish need clear, shaded water and follow the season", () => {
    const clean = ecology(rich({ wetness: 0.9, ground: { ...rich().ground, compaction: 0.02 } }));
    const muddy = ecology(rich({ wetness: 0.9, ground: { ...rich().ground, compaction: 0.95 } }));
    assert.ok(clean.fish.biomassKgHa > muddy.fish.biomassKgHa);
    assert.ok(clean.fish.waterQuality > muddy.fish.waterQuality);
    assert.ok(clean.fish.shadeNeed > 0);
    assert.equal(clean.fish.present, true);
    assert.equal(ecology(poor()).fish.present, false);
});

test("114 crayfish and mussels are water-quality indicators", () => {
    const clean = ecology(rich({ wetness: 0.9, ground: { ...rich().ground, compaction: 0.02 } }));
    const muddy = ecology(rich({ wetness: 0.9, ground: { ...rich().ground, compaction: 0.95 } }));
    assert.ok(clean.waterFilters.indicator > muddy.waterFilters.indicator);
    assert.ok(clean.waterFilters.mussels.populationPerM2 > muddy.waterFilters.mussels.populationPerM2);
    assert.ok(clean.waterFilters.mussels.filteredLitresDay > 0);
    assert.ok(clean.waterFilters.crayfish.populationPerM2 >= 0);
});

test("115 fungi split food, medicine and decomposition", () => {
    const autumn = ecology(rich(), "autumn");
    const spring = ecology(rich(), "spring");
    assert.ok(autumn.fungi.yieldKgHa > spring.fungi.yieldKgHa);
    assert.ok(autumn.fungi.edible > 0);
    assert.ok(autumn.fungi.medicinal > 0);
    assert.ok(autumn.fungi.decomposers > 0);
    assert.ok(autumn.fungi.mycorrhizal > 0);
    assert.equal(autumn.fungi.fruiting, "main flush");
});

test("116 moss and lichen report humidity and old growth", () => {
    const wet = ecology(rich({ moisture: 0.85, wetness: 0.8 }));
    const dry = ecology(poor());
    assert.ok(wet.mossLichen.humidityIndicator > dry.mossLichen.humidityIndicator);
    assert.ok(wet.mossLichen.mossCover > dry.mossLichen.mossCover);
    assert.ok(wet.mossLichen.oldGrowthIndicator > dry.mossLichen.oldGrowthIndicator);
    assert.ok(wet.mossLichen.airQuality > 0);
    assert.ok(dry.mossLichen.desiccationRisk > 0);
});

test("117 parasites name their hosts and track herd density", () => {
    const dense = ecology(rich());
    const sparse = ecology(rich({ ground: { ...rich().ground, huntingPressure: 0.9 }, canopy: 0.3, clearing: 0.6 }));
    assert.equal(dense.parasites.hosts.length, 4);
    assert.ok(dense.parasites.hosts.some(entry => entry.host === "deer" && entry.parasite === "Deer tick"));
    assert.ok(dense.parasites.load >= sparse.parasites.load);
    assert.ok(dense.parasites.ticksPerDeer >= 0);
    assert.ok(dense.parasites.herdCondition > 0 && dense.parasites.herdCondition <= 100);
});

test("118 scavengers remove carcasses and return nutrients", () => {
    const summer = ecology(rich(), "summer");
    const winter = ecology(rich(), "winter");
    assert.ok(summer.scavengers.carcassRemovalDays <= winter.scavengers.carcassRemovalDays);
    assert.ok(summer.scavengers.nutrientReturnKgHaYear > 0);
    assert.ok(summer.scavengers.species.includes("Raven"));
    assert.ok(summer.scavengers.abundance > 0);
    assert.ok(winter.scavengers.winterReliance > 0);
});

test("119 predator-prey cycles are deterministic, bounded and labelled", () => {
    const first = ecology(rich());
    const second = ecology(rich());
    assert.deepEqual(first.cycles, second.cycles);
    assert.ok(first.cycles.hareLynx.phase >= 0 && first.cycles.hareLynx.phase < 1);
    assert.ok(["trough", "building", "peak", "decline"].includes(first.cycles.hareLynx.label));
    assert.ok(first.cycles.hareLynx.periodYears >= 5);
    assert.ok(first.cycles.voleOwl.periodYears >= 2);
    assert.ok(first.cycles.mast.periodYears >= 4);
    assert.ok(first.cycles.predationPressure >= 0 && first.cycles.predationPressure <= 100);
    const later = ecology(rich(), "summer", { day: SEASON_DAY.summer + 400 });
    assert.notEqual(later.cycles.hareLynx.phase, first.cycles.hareLynx.phase);
});

test("120 corridors connect woods through edge, water and transition belts", () => {
    const linked = ecology(rich({ regionalTransitionShare: 0.4, regionalTransitionLabel: "Auenwald" }));
    const isolated = ecology(poor({ edge: false, clearing: 0, regionalTransitionShare: 0 }));
    assert.ok(linked.corridors.quality > isolated.corridors.quality);
    assert.ok(linked.corridors.connectivity > isolated.corridors.connectivity);
    assert.ok(linked.corridors.links >= isolated.corridors.links);
    assert.ok(linked.corridors.nearestWoodKm <= isolated.corridors.nearestWoodKm);
    assert.ok(["north", "east", "south", "west"].includes(linked.corridors.direction));
    assert.equal(linked.corridors.targetRegionalType, "Auenwald");
});

test("the food web binds the guilds into one bounded network", () => {
    const record = ecology(rich());
    assert.ok(record.foodWeb.nodes.length >= 8);
    assert.ok(record.foodWeb.links.length >= 10);
    assert.ok(record.foodWeb.richness === record.foodWeb.nodes.length);
    assert.ok(record.foodWeb.links.some(link => link.from === "deer" && link.to === "wolves"));
    assert.ok(record.foodWeb.links.some(link => link.from === "fish" && link.to === "otters"));
    assert.match(record.foodWeb.keystone, /wolve|raptor|bird/i);
    assert.ok(record.foodWeb.nodes.every(node => node.biomass >= 0 && node.biomass <= 100));
});

test("the shared stand and goods path consume the fauna record", () => {
    const stand = findForestStand();
    assert.ok(stand?.faunaEcology, "faunaDetail must attach the record to a real stand");
    assert.equal(stand.faunaEcology.season, faunaSeasonAt(150).name);
    assert.ok(stand.faunaEcology.signals.biodiversity > 0);
    assert.ok(Array.isArray(forestFaunaCommunityFor(stand)));
    assert.ok(forestFaunaCommunityFor(stand).every(id => FOREST_FAUNA[id]),
        "every visible community marker must have a renderer/species entry");
    assert.ok(FAUNA_SEASONS.includes(stand.faunaEcology.season));

    const goodsStand = {
        forest: true, productivity: 1, goods: ["honey", "game", "mushrooms", "berries"],
        regionalEffects: { forage: 1 },
        dynamics: { goods: { boost: {}, extra: [] }, silviculture: {}, working: {} },
        faunaEcology: { signals: { honeyYield: 1, gameYield: 1, mushroomYield: 1, seedDispersal: 1, fishYield: 1, biodiversity: 1 } },
    };
    const boosted = forestGoodsFor(goodsStand, 240, "temperate");
    const plain = forestGoodsFor({
        ...goodsStand,
        faunaEcology: { signals: { honeyYield: 0, gameYield: 0, mushroomYield: 0, seedDispersal: 0, fishYield: 0, biodiversity: 0 } },
    }, 240, "temperate");
    for (const id of ["honey", "game", "mushrooms", "berries"]) {
        const high = boosted.find(good => good.id === id);
        const low = plain.find(good => good.id === id);
        assert.ok(high && low, id + " must stay in the seasonal goods list");
        assert.ok(high.abundance > low.abundance, id + " must respond to its fauna consumer");
    }
});

test("the herd model reads the new guilds", () => {
    const wet = ecology(rich({ wetness: 0.9, ground: { ...rich().ground, compaction: 0.02 } }));
    const dry = ecology(poor());
    assert.ok(forestFaunaHabitatScore(rich({ wetness: 0.9 }), "beaver", 150)
        > forestFaunaHabitatScore(poor(), "beaver", 150));
    assert.ok(forestFaunaHabitatScore(rich(), "bear", 150)
        > forestFaunaHabitatScore(poor(), "bear", 150));
    assert.ok(wet.signals.fish > dry.signals.fish);
    assert.ok(wet.signals.beaver > dry.signals.beaver);
});
