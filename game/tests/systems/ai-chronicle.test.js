import test from "node:test";
import assert from "node:assert/strict";
import {state, resetState} from "../../js/core/state.js";
import {SAVE_SCHEMA_VERSION, validateSaveSnapshot} from "../../js/core/save-validation.js";
import {
    AI_ACTION_COSTS,
    AI_CHRONICLE_LIMITS,
    createAiChronicleState,
    normalizeAiChronicleState,
    validateAiChronicleState
} from "../../js/core/ai-chronicle-state.js";
import {
    applyAiEntry,
    buildAiContext,
    buildAiPrompt,
    generateAiChronicleEntry,
    offlineAiEntry
} from "../../js/systems/ai-chronicle.js";
import {renderAiArchiveSection, renderAiContactSummary} from "../../js/presentation/ai-chronicle-panel.js";

function realm() {
    resetState();
    state.hasStarted = true;
    state.kingdomName = "Avalon";
    state.playerName = "Aurelia";
    state.year = 12;
    state.tick = 4400;
    state.resources = {wood: 300, stone: 300, gold: 300, food: 300};
    state.identity = {
        kingdomName: "Avalon",
        motto: "We keep what we build.",
        culture: "frontier"
    };
    state.government = {form: "feudal"};
    state.eventLog = [{
        id: 1,
        text: "The first harvest was carried into the royal granary.",
        tick: 4390,
        year: 12
    }];
    state.politics = {legitimacy: 50};
    state.morale = 70;
    state.aiChronicle = createAiChronicleState();
}

function bookEntry(overrides = {}) {
    return {
        id: "test-book",
        title: "The Book of Grain",
        author: "Aurelia",
        genre: "realm chronicle",
        summary: "A history of the first harvest.",
        excerpt: "The granary doors opened and the people remembered the promise.",
        createdYear: 12,
        createdTick: 4400,
        source: "offline",
        ...overrides
    };
}

test("schema 11 carries a bounded, normalized AI chronicle", () => {
    assert.equal(SAVE_SCHEMA_VERSION, 11);
    const empty = createAiChronicleState();
    assert.deepEqual(empty.books, []);
    assert.equal(empty.lastSource, "none");
    const normalized = normalizeAiChronicleState({
        books: Array.from({length: 40}, (_, index) => bookEntry({id: "b" + index})),
        artifacts: [{name: "A", description: "D"}],
        contacts: {},
        lastSource: "offline",
        totalGenerated: 40
    });
    assert.equal(normalized.books.length, AI_CHRONICLE_LIMITS.books);
    assert.equal(normalized.totalGenerated, 40);
    assert.equal(validateAiChronicleState(normalized), true);
    assert.throws(() => validateAiChronicleState({...normalized, books: Array.from({length: 25}, () => bookEntry())}));
});

test("offline chronicler produces real books from realm facts and applies bounded effects", () => {
    realm();
    const context = buildAiContext("book");
    const prompt = buildAiPrompt("book", context);
    assert.match(prompt, /Avalon/);
    assert.match(prompt, /first harvest/);
    assert.match(prompt, /Aurelia/);
    const entry = offlineAiEntry("book", context);
    assert.ok(entry.title.includes("Grain") || entry.title.includes("Ash") || entry.title.includes("Book"));
    const applied = applyAiEntry("book", {...entry, id: "book-1", createdYear: 12, createdTick: 4400, source: "offline"});
    assert.equal(applied.ok, true);
    assert.equal(state.resources.gold, 300 - AI_ACTION_COSTS.book.gold);
    assert.equal(state.aiChronicle.books.length, 1);
    assert.equal(state.aiChronicle.lastSource, "offline");
    assert.equal(state.politics.legitimacy, 51);
    assert.ok(state.morale > 70);
    assert.equal(state.aiChronicle.totalGenerated, 1);
    assert.deepEqual(state.aiChronicle.lastEffect, {kind: "book", legitimacy: 1, morale: 0.4, bond: 0, trust: 0});
    assert.match(renderAiArchiveSection(), /data-ai-archive-entry="book"/);
    assert.match(renderAiArchiveSection(), /OPEN THE ATELIER/);
});

test("valid AI JSON is accepted and invalid AI JSON falls back to the offline chronicler", async () => {
    realm();
    const goodFetcher = async () => ({
        ok: true,
        json: async () => ({entry: {
            title: "The River Ledger",
            author: "Mara",
            genre: "civic treatise",
            summary: "A careful account of the river and its households.",
            excerpt: "The river is a ledger; every household writes one line in it."
        }})
    });
    const good = await generateAiChronicleEntry("book", {fetcher: goodFetcher});
    assert.equal(good.ok, true);
    assert.equal(good.source, "ai");
    assert.equal(good.entry.title, "The River Ledger");
    assert.equal(good.entry.author, "Mara");

    const badFetcher = async () => ({
        ok: true,
        json: async () => ({entry: {title: "broken"}})
    });
    const bad = await generateAiChronicleEntry("book", {fetcher: badFetcher});
    assert.equal(bad.ok, true);
    assert.equal(bad.source, "offline");
    assert.match(bad.entry.title, /Book|Grain|Ash/);
});

test("conversations create durable contacts and cap memories and conversations", () => {
    realm();
    const conversation = {
        id: "conversation-1",
        personId: "person-1",
        personName: "Mara",
        summary: "The crown spoke with Mara about the grain stores.",
        lines: [
            {speaker: "citizen", text: "The stores are lower than the clerks say."},
            {speaker: "ruler", text: "Then we will count them together."}
        ],
        sentiment: "warm",
        bondDelta: 2,
        memory: "Mara asked for an honest count.",
        rumor: "A neighbor says the granary is short.",
        createdYear: 12,
        createdTick: 4400,
        source: "offline"
    };
    for (let index = 0; index < 6; index++) {
        assert.equal(applyAiEntry("conversation", {...conversation, id: "c" + index}).ok, true);
    }
    const contact = state.aiChronicle.contacts["person-1"];
    assert.equal(contact.bond, 62);
    assert.equal(contact.trust, 56);
    assert.equal(contact.memories.length, AI_CHRONICLE_LIMITS.memories);
    assert.equal(state.aiChronicle.conversations.length, 6);
    assert.equal(state.aiChronicle.conversations[0].personName, "Mara");
    assert.deepEqual(state.aiChronicle.lastEffect, {kind: "conversation", legitimacy: 0, morale: 0, bond: 2, trust: 1});
    assert.match(renderAiContactSummary(), /data-ai-contact="person-1"/);
    assert.match(renderAiContactSummary(), /OPEN PERSON DOSSIER/);
});

test("the offline chronicler uses each commission sequence and applies bounded artifact effects", () => {
    realm();
    const firstContext = buildAiContext("book");
    const first = offlineAiEntry("book", firstContext);
    assert.equal(applyAiEntry("book", {...first, id: "book-1", createdYear: 12, createdTick: 4400, source: "offline"}).ok, true);
    const secondContext = buildAiContext("book");
    const second = offlineAiEntry("book", secondContext);
    assert.notEqual(first.title, second.title);
    assert.notEqual(first.summary, second.summary);
    const titleParts = first.title.replace("The Book of ", "").split(" and ");
    assert.equal(titleParts.length, 2);
    assert.notEqual(titleParts[0], titleParts[1]);
    assert.ok(!first.summary.includes(".."));
    const artifact = offlineAiEntry("artifact", buildAiContext("artifact"));
    assert.match(artifact.description, /^(A|An) /);
    assert.ok(!artifact.description.includes("  "));
    const applied = applyAiEntry("artifact", {...artifact, id: "artifact-1", createdYear: 12, createdTick: 4400, source: "offline"});
    assert.equal(applied.ok, true);
    assert.equal(state.resources.stone, 300 - AI_ACTION_COSTS.artifact.stone);
    assert.equal(state.politics.legitimacy, 53);
    assert.deepEqual(state.aiChronicle.lastEffect, {kind: "artifact", legitimacy: 2, morale: 0, bond: 0, trust: 0});
    assert.ok(state.politics.legitimacy <= 100);
    assert.ok(state.morale <= 100);
});

test("legitimacy, morale, bond and trust clamp at their upper bounds", () => {
    realm();
    state.politics.legitimacy = 99;
    state.morale = 99.9;
    assert.equal(applyAiEntry("book", bookEntry({id: "cap-book"})).ok, true);
    assert.equal(state.politics.legitimacy, 100);
    assert.equal(state.morale, 100);
    const conversation = {
        id: "cap-conversation", personId: "cap-person", personName: "Mara",
        summary: "A final audience at the edge of the record.",
        lines: [{speaker: "citizen", text: "We remember."}, {speaker: "ruler", text: "And we are remembered."}],
        sentiment: "warm", bondDelta: 3, memory: "A bounded memory.", rumor: "",
        createdYear: 12, createdTick: 4400, source: "offline"
    };
    state.aiChronicle.contacts["cap-person"] = {personId: "cap-person", name: "Mara", bond: 99, trust: 99, lastTopic: "", lastTick: 0, memories: []};
    assert.equal(applyAiEntry("conversation", conversation).ok, true);
    assert.equal(state.aiChronicle.contacts["cap-person"].bond, 100);
    assert.equal(state.aiChronicle.contacts["cap-person"].trust, 100);
    assert.ok(state.politics.legitimacy <= 100);
    assert.ok(state.morale <= 100);
    assert.equal(state.aiChronicle.lastEffect.bond, 3);
});

test("book and artifact caps and resource refusal are enforced", () => {
    realm();
    state.resources.gold = 1000;
    state.resources.stone = 1000;
    for (let index = 0; index < 30; index++) {
        assert.equal(applyAiEntry("book", bookEntry({id: "b" + index})).ok, true);
    }
    assert.equal(state.aiChronicle.books.length, AI_CHRONICLE_LIMITS.books);
    state.resources.gold = 0;
    const refused = applyAiEntry("artifact", {
        id: "a", name: "Cup", description: "A cup.", material: "stone", era: "year 1",
        inscription: "", provenance: "", value: 4, createdYear: 12, createdTick: 4400, source: "offline"
    });
    assert.equal(refused.ok, false);
    assert.match(refused.reason, /afford/i);
});

test("save validation accepts a migrated AI chronicle and rejects an oversized one", () => {
    const snapshot = {
        worldSeed: 7,
        saveSchemaVersion: SAVE_SCHEMA_VERSION,
        entities: [],
        resources: {wood: 0, stone: 0, gold: 0, food: 0},
        incomeThisTick: {wood: 0, stone: 0, gold: 0, food: 0},
        aiChronicle: normalizeAiChronicleState({books: [bookEntry()], artifacts: [], contacts: {}, totalGenerated: 1})
    };
    assert.equal(validateSaveSnapshot(snapshot), true);
    assert.throws(() => validateSaveSnapshot({...snapshot, aiChronicle: {books: Array.from({length: 25}, () => bookEntry()), artifacts: [], conversations: [], contacts: {}}}));
});
