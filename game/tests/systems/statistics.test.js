import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { createPersonProfile } from "../../js/systems/people.js";
import { STATISTICS_CATEGORIES, buildStatisticsCatalog, formatStatisticValue } from "../../js/systems/statistics.js";

function resident(index, name, role = "resident") {
    const entity = {
        id: "person-" + index,
        personId: "person-" + index,
        type: TYPE.VILLAGER,
        dead: false,
        x: index % 12,
        y: 2 + Math.floor(index / 12),
        job: role,
        isBuilding: () => false
    };
    entity.person = createPersonProfile(entity, { role, species: "human" });
    entity.person.name = name;
    entity.person.role = role;
    entity.person.jobExperience = 14 + index;
    return entity;
}

function farm() {
    return {
        id: "farm-1",
        type: TYPE.FARM,
        dead: false,
        x: 8,
        y: 9,
        construction: { stage: 3 },
        inventory: { grain: 12 },
        isBuilding: () => true
    };
}

test("the statistics catalogue exposes thousands of live readings across every domain", () => {
    resetState();
    state.hasStarted = true;
    state.tick = 240;
    state.year = 5;
    state.kingdomName = "Test Crown";
    state.entities.push(farm());
    for (let index = 0; index < 40; index++) {
        state.entities.push(resident(index, "Resident " + String(index).padStart(2, "0"), index % 4 === 0 ? "farmer" : "resident"));
    }
    const catalog = buildStatisticsCatalog();
    assert.ok(catalog.total >= 2000, "expected a genuinely large catalogue, got " + catalog.total);
    assert.ok(catalog.categoryCounts.people > 1000);
    for (const id of ["overview", "realm", "population", "people", "economy", "resources", "buildings", "city", "politics", "court", "diplomacy", "military", "research", "faith", "health", "justice", "dynasty", "ecology", "logistics", "cards", "chronicle", "performance"]) {
        assert.ok(catalog.categoryCounts[id] > 0, "missing statistics domain " + id);
    }
    assert.equal(catalog.rows.length, catalog.total);
    assert.deepEqual(catalog.categories.map(entry => entry.id), STATISTICS_CATEGORIES.map(entry => entry.id));
    assert.ok(catalog.rows.every(row => row.id && row.search.includes(row.categoryLabel.toLowerCase())));
    const residentRows = catalog.rows.filter(row => row.category === "people");
    assert.ok(residentRows.some(row => row.group.startsWith("Resident 07") && row.label === "Trait · Courage"));
    assert.ok(residentRows.some(row => row.group.startsWith("Resident 07") && row.label === "Skill · Farming"));
    assert.ok(residentRows.some(row => row.group.startsWith("Resident 07") && row.label === "Need · Rest"));
    assert.ok(catalog.rows.some(row => row.group === "TYPE · Farmstead" && row.label === "Structures" && row.value === 1));
    assert.ok(catalog.rows.some(row => row.group === "#farm-1 · Farmstead · INVENTORY" && row.label === "Grain" && row.value === 12));
    assert.ok(catalog.rows.some(row => row.group === "ROOM BONUSES · EVERY 20 DAYS" && row.label === "Accessible rooms"));
    assert.ok(catalog.rows.some(row => row.group === "ROOM BONUS CAPS" && row.label === "Cap · Gold"));
});

test("the catalogue is deterministic and safe for a fresh realm", () => {
    resetState();
    state.hasStarted = true;
    state.tick = 90;
    state.entities.push(resident(0, "Ada Ashford"));
    const first = buildStatisticsCatalog();
    const second = buildStatisticsCatalog();
    const shape = catalog => catalog.rows.map(row => [row.category, row.group, row.label, row.display]);
    assert.deepEqual(shape(second), shape(first));
    assert.ok(first.rows.some(row => row.group.startsWith("Ada Ashford") && row.label === "Trait · Courage"));
    resetState();
    const empty = buildStatisticsCatalog();
    assert.ok(empty.total > 0);
    assert.ok(empty.categoryCounts.overview > 0);
    assert.ok(empty.rows.some(row => row.label === "Population" && row.value === 0));
});

test("statistic values are bounded, readable and do not use fragile locale formatting", () => {
    assert.equal(formatStatisticValue(1234.4), "1,234");
    assert.equal(formatStatisticValue(12.34), "12.3");
    assert.equal(formatStatisticValue(-4.5), "-4.5");
    assert.equal(formatStatisticValue(50, "/ 100"), "50 / 100");
    assert.equal(formatStatisticValue(true), "YES");
    assert.equal(formatStatisticValue(false), "NO");
    assert.equal(formatStatisticValue(Number.NaN), "—");
    assert.equal(formatStatisticValue("a".repeat(200)).length, 178);
});
