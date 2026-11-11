// Focused tests for the civilization layer added in schema 7: realm identity,
// research & scholarship, and the legacy record. Every assertion reads real
// state produced by the systems, not a label rendered by the UI.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TYPE } from "../../js/core/types.js";
import { resetState, state } from "../../js/core/state.js";
import { initStartingKingdom } from "../../js/world/entities.js";
import {
    createIdentityState, normalizeIdentity, validateIdentity,
    getCultureModifiers, getIdentitySnapshot, getHeraldryLabel, CULTURES
} from "../../js/systems/identity.js";
import {
    createLegacyState, normalizeLegacyState, validateLegacyState,
    recordDiscovery, recordLegacy, getLegacySnapshot, getLegacyModifiers
} from "../../js/systems/legacy.js";
import {
    createResearchState, normalizeResearchState, validateResearchState,
    startResearch, setResearchFunding, appointScholar, dismissScholar,
    updateResearch, getResearchSnapshot, getResearchModifiers,
    TECHNOLOGIES, FUNDING_LEVELS, MAX_SCHOLARS
} from "../../js/systems/research.js";
import { getBuildingCost } from "../../js/systems/construction.js";
import { BUILDING_COSTS } from "../../js/systems/city-config.js";
import { SAVE_SCHEMA_VERSION, validateSaveSnapshot } from "../../js/core/save-validation.js";

function setupRealm({ gold = 800, food = 600 } = {}) {
    resetState();
    state.worldSeed = 9917;
    state.tick = 20;
    state.year = 1;
    state.dayOfYear = 20;
    state.resources = { wood: 600, stone: 600, gold, food };
    state.morale = 62;
    initStartingKingdom();
    state.identity = createIdentityState({
        kingdomName: "Testhold", dynastyName: "House Vey", rulerTitle: "Warden",
        culture: "scholarly", banner: "azure", emblem: "oak", foundedYear: 1
    });
    state.legacy = createLegacyState({ foundedYear: 1 });
    state.research = createResearchState();
    return state;
}

// ── Realm identity ──────────────────────────────────────────────

test("identity normalizes unknown input and drives the realm name", () => {
    resetState();
    const identity = createIdentityState({
        kingdomName: "  Veyhold  ", culture: "nonsense", banner: "rose", emblem: "swan", foundedYear: -4
    });
    assert.equal(identity.kingdomName, "Veyhold");
    assert.equal(identity.culture, "frontier");
    assert.equal(identity.banner, "gold");
    assert.equal(identity.emblem, "crown");
    assert.equal(identity.foundedYear, 1);
    assert.equal(createIdentityState({ kingdomName: "   " }).kingdomName, "New Realm");

    state.identity = identity;
    normalizeIdentity();
    assert.equal(state.kingdomName, "Veyhold", "normalizing identity must publish the realm name");

    assert.equal(validateIdentity(identity), true);
    assert.throws(() => validateIdentity({ ...identity, culture: "desert" }), /Culture is invalid/);
    assert.throws(() => validateIdentity({ ...identity, emblem: "swan" }), /emblem is invalid/);
    assert.throws(() => validateIdentity({ ...identity, foundedYear: 0 }), /Founding year is invalid/);
});

test("culture modifiers are real and exposed to the other systems", () => {
    resetState();
    state.identity = createIdentityState({ culture: "scholarly" });
    const modifiers = getCultureModifiers();
    assert.equal(modifiers.id, "scholarly");
    assert.equal(modifiers.research, CULTURES.scholarly.research);
    assert.equal(modifiers.trade, CULTURES.scholarly.trade);
    assert.equal(modifiers.legitimacy, CULTURES.scholarly.legitimacy);
    const snapshot = getIdentitySnapshot();
    assert.equal(snapshot.cultures.length, Object.keys(CULTURES).length);
    assert.equal(snapshot.cultureDetails.label, "Scholarly");
    state.identity = createIdentityState({ banner: "crimson", emblem: "wolf" });
    assert.equal(getHeraldryLabel(), "WOLF ON CRIMSON");
});

// ── Legacy ──────────────────────────────────────────────────────

test("legacy ids stay unique across a save round trip and prestige is bounded", () => {
    resetState();
    state.year = 5;
    state.legacy = null;
    const first = recordLegacy("realm", "The first stone", "A keep is raised.");
    const second = recordLegacy("reform", "The charter", "A new law is sworn.");
    assert.equal(first.id, 1);
    assert.equal(second.id, 2);
    assert.equal(state.legacy.entries[0].id, 2);
    assert.equal(state.legacy.prestige, first.importance + second.importance);

    const restored = JSON.parse(JSON.stringify(state.legacy));
    normalizeLegacyState(restored);
    assert.equal(state.legacy.nextId, 3, "nextId must be derived from the persisted records");
    const third = recordLegacy("discovery", "A third deed");
    assert.equal(third.id, 3);

    const snapshot = getLegacySnapshot();
    assert.equal(snapshot.entryCount, 3);
    assert.equal(snapshot.era, "Early Years");
    assert.ok(getLegacyModifiers().legitimacyYear > 0);

    recordDiscovery({ label: "Crop rotation", description: "Fields recover." });
    assert.equal(state.legacy.discoveries, 1);
    assert.throws(() => validateLegacyState({ ...getLegacySnapshot(), entries: [{ title: "" }] }), /Legacy entry is invalid/);
    assert.equal(validateLegacyState(getLegacySnapshot()), true);
});

// ── Research ────────────────────────────────────────────────────

test("research gates prerequisites, completes technologies and changes real modifiers", () => {
    setupRealm();
    const baseWood = BUILDING_COSTS[TYPE.HOUSE].wood;
    assert.equal(getBuildingCost(TYPE.HOUSE).wood, baseWood, "no completed craft work means no discount");
    assert.equal(getResearchModifiers().buildDiscount, 0);

    assert.deepEqual(startResearch("irrigation"), { ok: false, reason: "prerequisite-missing" });
    assert.deepEqual(startResearch("no-such-tech"), { ok: false, reason: "unknown-technology" });

    state.research.reserve = 100;
    const masonry = startResearch("masonry");
    assert.equal(masonry.ok, true);
    assert.equal(masonry.completed.id, "masonry");
    assert.equal(state.research.completed.masonry, true);
    assert.ok(getResearchModifiers().buildDiscount > 0);
    assert.ok(getBuildingCost(TYPE.HOUSE).wood < baseWood, "masonry must lower the displayed build cost");
    assert.deepEqual(startResearch("masonry"), { ok: false, reason: "already-complete" });

    state.research.reserve = 100;
    assert.equal(startResearch("crop-rotation").completed.id, "crop-rotation");
    assert.ok(getResearchModifiers().foodDemandFactor < 1, "crop rotation must lower household food demand");

    state.research.reserve = 100;
    assert.equal(startResearch("metallurgy").completed.id, "metallurgy");
    assert.ok(getResearchModifiers().militaryBonus > 1, "metallurgy must raise soldier power");

    const snapshot = getResearchSnapshot();
    assert.equal(snapshot.modifiers.completedCount, 3);
    assert.equal(snapshot.techs.filter(tech => tech.status === "complete").length, 3);
    assert.equal(snapshot.techs.find(tech => tech.id === "guild-halls").status, "available");
    assert.equal(snapshot.techs.find(tech => tech.id === "administration").status, "locked");
    assert.equal(TECHNOLOGIES.length, 24);
    assert.equal(snapshot.branches.length, 4);
});

test("the annual research audit pays the budget and produces points", () => {
    setupRealm({ gold: 60 });
    assert.equal(setResearchFunding(1).ok, true);
    assert.equal(setResearchFunding(1).ok, false, "selecting the same funding level must not double-charge");
    assert.deepEqual(startResearch("written-law"), { ok: true, tech: TECHNOLOGIES.find(tech => tech.id === "written-law"), completed: null, snapshot: getResearchSnapshot() });
    state.year = 2;
    const before = state.resources.gold;
    const audit = updateResearch();
    assert.ok(audit.points > 0, "a funded academy must produce research points");
    assert.equal(audit.funding, 1);
    assert.equal(state.resources.gold, before - FUNDING_LEVELS[1].gold, "the yearly funding cost must be charged");
    assert.equal(state.research.history.length, 1);
    assert.equal(state.research.lastAudit.year, 2);
    assert.ok(state.research.progress > 0);
    assert.equal(validateResearchState(state.research), true);
    assert.throws(() => validateResearchState({ ...state.research, activeTech: "nonsense" }), /research project/);
    assert.throws(() => validateResearchState({ ...state.research, scholars: Array(MAX_SCHOLARS + 1).fill({ personId: "x" }) }), /Scholar list/);
    assert.equal(normalizeResearchState({ funding: 99 }).funding, FUNDING_LEVELS.length - 1);
});

test("named scholars can be appointed, dismissed and are paid at the audit", () => {
    setupRealm({ gold: 800 });
    const snapshot = getResearchSnapshot();
    assert.ok(snapshot.capacity >= 2, "the opening temple and court must open research posts");
    assert.ok(snapshot.candidates.length > 0, "the opening village must offer a scholar candidate");
    const candidate = snapshot.candidates[0];
    const appointed = appointScholar(candidate.personId);
    assert.equal(appointed.ok, true, appointed.reason);
    assert.equal(appointed.scholar.name, candidate.name);
    assert.equal(state.research.scholars.length, 1);
    assert.deepEqual(appointScholar(candidate.personId), { ok: false, reason: "already-serving" });

    const goldBefore = state.resources.gold;
    state.year = 2;
    const audit = updateResearch();
    assert.equal(audit.scholars, 1);
    assert.ok(audit.salariesPaid > 0);
    assert.ok(state.resources.gold < goldBefore);

    const dismissed = dismissScholar(candidate.personId);
    assert.equal(dismissed.ok, true);
    assert.equal(state.research.scholars.length, 0);
    assert.deepEqual(dismissScholar(candidate.personId), { ok: false, reason: "scholar-not-found" });
});

test("schema 7 saves identity, research and legacy and validates each block", () => {
    setupRealm();
    state.research.reserve = 100;
    startResearch("masonry");
    recordLegacy("realm", "A recorded deed");
    assert.equal(SAVE_SCHEMA_VERSION, 7, "schema 7 is the civilization-layer save contract");

    const snapshot = {
        worldSeed: 9917,
        entities: [],
        resources: { wood: 1, stone: 2, gold: 3, food: 4 },
        incomeThisTick: { wood: 0, stone: 0, gold: 0, food: 0 },
        identity: state.identity,
        research: state.research,
        legacy: state.legacy
    };
    assert.equal(validateSaveSnapshot(snapshot), true);
    assert.throws(() => validateSaveSnapshot({ ...snapshot, identity: { ...state.identity, culture: "void" } }), /Culture is invalid/);
    assert.throws(() => validateSaveSnapshot({ ...snapshot, research: { ...state.research, activeTech: "void" } }), /research project/);
    assert.throws(() => validateSaveSnapshot({ ...snapshot, legacy: { ...state.legacy, entries: "nope" } }), /Legacy entries/);
});

test("the save, load, simulation and UI source contracts include the civilization layer", async () => {
    const main = await readFile(new URL("../../js/app/main.js", import.meta.url), "utf8");
    const validation = await readFile(new URL("../../js/core/save-validation.js", import.meta.url), "utf8");
    const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
    const ui = await readFile(new URL("../../js/presentation/management-ui.js", import.meta.url), "utf8");
    const simulation = await readFile(new URL("../../js/simulation/simulation.js", import.meta.url), "utf8");
    assert.ok(main.includes("identity:JSON.parse") && main.includes("research:JSON.parse") && main.includes("legacy:JSON.parse"), "the snapshot must persist all three blocks");
    assert.ok(main.includes("state.identity=normalizeIdentity") && main.includes("state.research=normalizeResearchState") && main.includes("state.legacy=normalizeLegacyState"), "loading must normalize all three blocks");
    assert.ok(main.includes("6:snapshot=>") && main.includes("applyIdentityForNewRealm"), "schema 6 saves must migrate and a new realm must record its identity");
    assert.ok(validation.includes("validateIdentity") && validation.includes("validateResearchState") && validation.includes("validateLegacyState"));
    assert.equal((html.match(/data-command-tab=/g) || []).length, 20, "the command deck must expose twenty tabs, including the city charter");
    assert.ok(html.includes('data-command-tab="research"') && html.includes('id="realm-culture"'), "the founding form and research tab must exist");
    assert.ok(ui.includes("research:researchPanel") && ui.includes("research-start") && ui.includes("research-appoint"), "the research panel and its actions must be wired");
    assert.ok(ui.includes("getLegacySnapshot()") && ui.includes("LEGACY ·"), "the chronicle must show the legacy record");
    assert.ok(simulation.includes("updateResearch()"), "research must run from the yearly simulation");
});
