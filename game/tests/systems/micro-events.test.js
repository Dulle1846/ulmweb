import test from "node:test";
import assert from "node:assert/strict";
import { state, resetState } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import {
    MAX_TIMELINE_EVENTS,
    appendTimelineEvent,
    createEventTimelineState,
    normalizeEventTimelineState,
    serializeEventTimelineState,
    validateEventTimelineState
} from "../../js/core/event-timeline.js";
import { migrateSaveSnapshot } from "../../js/core/save-migrations.js";
import { SAVE_SCHEMA_VERSION } from "../../js/core/save-validation.js";
import { drainPresentationEffects } from "../../js/core/presentation-effects.js";
import { MICRO_EVENT_TEMPLATES, updateMicroEvents } from "../../js/systems/micro-events.js";
import { addLog } from "../../js/core/event-log.js";
import {
    MAX_VISIBLE_TIMELINE_CARDS, focusTimelineEvent, renderLivingTimeline, resetTimelineView, setTimelineYear
} from "../../js/presentation/event-timeline-panel.js";

function realm(seed = 73) {
    resetState();
    state.hasStarted = true;
    state.worldSeed = seed;
    state.kingdomName = "Avalon";
    state.year = 1;
    state.dayOfYear = 0;
    state.tick = 0;
    state.morale = 72;
    state.resources = { wood: 300, stone: 300, gold: 300, food: 300 };
    state.entities = [
        { id: "king", isKing: true, type: TYPE.VILLAGER, person: { id: "king", name: "Aurelia", ageYears: 40 } },
        { id: "knight", type: TYPE.GUARD, person: { id: "knight", name: "Cedric", ageYears: 28 } },
        { id: "child", type: TYPE.VILLAGER, person: { id: "child", name: "Lark", ageYears: 9 } },
        { id: "resident", type: TYPE.VILLAGER, person: { id: "resident", name: "Bram", ageYears: 34 } }
    ];
    state.eventTimeline = createEventTimelineState();
}

function runDays(days) {
    const found = [];
    for (let offset = 1; offset <= days; offset++) {
        state.tick = offset;
        state.dayOfYear = offset % 400;
        state.year = Math.floor(offset / 400) + 1;
        const event = updateMicroEvents();
        if (event) found.push(event);
    }
    return found;
}

function draft(overrides = {}) {
    return {
        tick: 1, year: 1, day: 1, category: "COURT", severity: 1,
        title: "A SMALL RECORD", text: "The realm recorded a small event.",
        location: "the lower fields", participants: [], impact: null, templateId: "test",
        ...overrides
    };
}

test("schema 11 carries a bounded, normalized living timeline", () => {
    assert.equal(SAVE_SCHEMA_VERSION, 11);
    const timeline = createEventTimelineState();
    for (let index = 0; index < MAX_TIMELINE_EVENTS + 7; index++) {
        appendTimelineEvent(timeline, draft({ tick: index + 1, year: Math.floor(index / 400) + 1, day: (index % 400) + 1, title: "RECORD " + index }));
    }
    assert.equal(timeline.events.length, MAX_TIMELINE_EVENTS);
    assert.equal(timeline.sequence, MAX_TIMELINE_EVENTS + 7);
    assert.equal(timeline.totalGenerated, MAX_TIMELINE_EVENTS + 7);
    const normalized = normalizeEventTimelineState(JSON.parse(JSON.stringify(timeline)));
    assert.equal(normalized.events.length, MAX_TIMELINE_EVENTS);
    assert.equal(normalized.sequence, MAX_TIMELINE_EVENTS + 7);
    assert.equal(normalized.events[0].sequence, MAX_TIMELINE_EVENTS + 7);
    assert.equal(validateEventTimelineState(timeline), true);
    assert.equal(serializeEventTimelineState(timeline).events.length, MAX_TIMELINE_EVENTS);
    const migrated = migrateSaveSnapshot({ saveSchemaVersion: 10, eventTimeline: undefined });
    assert.equal(migrated.saveSchemaVersion, 11);
    assert.equal(migrated.eventTimeline, null);
});

test("the procedural chronicler generates grounded, persisted and deterministic events", () => {
    realm();
    const generated = runDays(80);
    assert.ok(generated.length >= 8, "80 days should produce a real run of small events");
    assert.ok(generated.every(event => event.id.startsWith("evt-")));
    assert.ok(generated.every(event => event.source === "procedural"));
    assert.ok(generated.every(event => event.tick > 0 && event.year >= 1 && event.day >= 1));
    assert.ok(generated.some(event => event.participants.length > 0));
    assert.ok(generated.some(event => /Avalon|Aurelia|Cedric|Lark|Bram/.test(event.text)));
    assert.ok(generated.every(event => event.title && event.text.endsWith(".")));
    assert.ok(generated.every(event => !event.text.includes("..")));
    assert.equal(state.eventTimeline.events.length, generated.length);
    assert.ok(state.eventTimeline.totalGenerated >= generated.length);
    const effects = drainPresentationEffects();
    assert.ok(effects.some(effect => effect.type === "timeline-event"));
    const firstRun = generated.map(event => [event.title, event.text, event.tick]);
    realm();
    const secondRun = runDays(80).map(event => [event.title, event.text, event.tick]);
    assert.deepEqual(secondRun, firstRun, "the same seed and day count must reproduce the same chronicle");
    assert.ok(MICRO_EVENT_TEMPLATES.length >= 48);
    assert.equal(new Set(MICRO_EVENT_TEMPLATES.map(template => template.id)).size, MICRO_EVENT_TEMPLATES.length);
});

test("a full archive renders a bounded card window", () => {
    realm();
    state.eventTimeline = createEventTimelineState();
    for (let index = 0; index < MAX_TIMELINE_EVENTS; index++) {
        appendTimelineEvent(state.eventTimeline, draft({
            tick: index + 1,
            year: 1,
            day: (index % 400) + 1,
            title: "ARCHIVE PAGE " + (index + 1),
            text: "A stored page used to verify that the rendered window stays bounded."
        }));
    }
    state.year = 1;
    state.tick = MAX_TIMELINE_EVENTS;
    resetTimelineView(1);
    const html = renderLivingTimeline();
    assert.equal((html.match(/data-timeline-event="/g) || []).length, MAX_VISIBLE_TIMELINE_CARDS);
    assert.match(html, /2,400 RETAINED/);
    assert.match(html, /Showing the newest 160 of 2,400 events/);
    assert.equal(state.eventTimeline.events.length, MAX_TIMELINE_EVENTS);
});

test("existing world events are bridged into the same durable timeline", () => {
    realm();
    addLog("A CHILD WAS BORN: Lark", "#e8c77b", "family");
    addLog("GAME SAVED", "#a3d6a7", "system");
    assert.equal(state.eventTimeline.events.length, 1);
    const bridged = state.eventTimeline.events[0];
    assert.equal(bridged.source, "simulation");
    assert.equal(bridged.category, "PEOPLE");
    assert.match(bridged.text, /Lark/);
    assert.equal(bridged.templateId, "event-log:family");
    assert.equal(state.eventLog.length, 2);
});

test("the timeline presentation can rewind without changing the realm", () => {
    realm();
    state.eventTimeline = createEventTimelineState();
    const first = appendTimelineEvent(state.eventTimeline, draft({ tick: 12, year: 1, day: 13, title: "THE FIRST PAGE", text: "Aurelia crossed the lower fields." }));
    const second = appendTimelineEvent(state.eventTimeline, draft({ tick: 430, year: 2, day: 31, title: "THE SECOND PAGE", text: "Cedric watched the old river road.", category: "WAR", severity: 2, impact: { morale: 0, resources: {}, summary: "NO MATERIAL CHANGE · OBSERVED ONLY" } }));
    state.year = 2;
    state.tick = 430;
    resetTimelineView(2);
    const present = renderLivingTimeline();
    assert.match(present, /data-timeline-event="evt-2"/);
    assert.match(present, /id="timeline-year-range"/);
    assert.match(present, /RETURN TO THE PRESENT/);
    assert.ok(!present.includes("data-command="), "the archive must not expose new commands");
    const before = JSON.stringify(state.eventTimeline);
    setTimelineYear(1);
    const history = renderLivingTimeline();
    assert.match(history, /THE FIRST PAGE/);
    assert.match(history, /data-timeline-event="evt-1"/);
    assert.equal(JSON.stringify(state.eventTimeline), before);
    assert.equal(focusTimelineEvent(second.id), true);
    assert.match(renderLivingTimeline(), /THE SECOND PAGE/);
    assert.match(renderLivingTimeline(), /NO MATERIAL CHANGE/);
    assert.equal(state.year, 2);
});
