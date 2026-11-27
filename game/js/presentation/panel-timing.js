// Bounded, inspectable panel-render timing.
//
// The game already stages heavy panels across animation frames. This module
// makes that work observable to players, tests and support without adding a
// second scheduler or unbounded telemetry. Only panel activations call it, so
// there is no per-frame or per-tick cost. The public shape keeps the historic
// `window.__panelTiming.panel/renderMs` fields while adding a capped history.
const HISTORY_LIMIT = 64;
let sequence = 0;

function target() {
    return globalThis.window || globalThis;
}

function history() {
    const scope = target();
    if (!Array.isArray(scope.__panelTimingHistory)) scope.__panelTimingHistory = [];
    return scope.__panelTimingHistory;
}

function publish(record, entries) {
    const scope = target();
    // Keep the legacy flat shape for the existing low-end performance probe.
    scope.__panelTiming = {
        panel: record.panel,
        renderMs: record.renderMs,
        staged: record.staged,
        stages: record.stages,
        mountedNodes: record.mountedNodes,
        parts: record.parts,
        maxChunkMs: record.maxChunkMs,
        maxPartMs: record.maxPartMs,
        maxParseMs: record.maxParseMs,
        maxTaskMs: record.maxTaskMs,
        prepareMs: record.prepareMs,
        totalMs: record.totalMs,
        complete: record.complete,
        seq: record.seq,
        history: entries
    };
    return record.seq;
}

export function recordPanelTiming(entry) {
    const record = {
        panel: String(entry?.panel || "unknown"),
        renderMs: Math.round((Number(entry?.renderMs) || 0) * 10) / 10,
        staged: Boolean(entry?.staged),
        stages: Math.max(0, Math.trunc(Number(entry?.stages) || 0)),
        mountedNodes: Math.max(0, Math.trunc(Number(entry?.mountedNodes) || 0)),
        parts: Math.max(0, Math.trunc(Number(entry?.parts) || 0)),
        maxChunkMs: Math.round((Number(entry?.maxChunkMs) || 0) * 10) / 10,
        maxPartMs: Math.round((Number(entry?.maxPartMs) || 0) * 10) / 10,
        maxParseMs: Math.round((Number(entry?.maxParseMs) || 0) * 10) / 10,
        maxTaskMs: Math.round((Number(entry?.maxTaskMs) || 0) * 10) / 10,
        prepareMs: Math.round((Number(entry?.prepareMs) || 0) * 10) / 10,
        totalMs: Math.round((Number(entry?.totalMs) || 0) * 10) / 10,
        complete: entry?.complete === true,
        at: Date.now(),
        seq: ++sequence
    };
    const entries = history();
    entries.push(record);
    if (entries.length > HISTORY_LIMIT) entries.splice(0, entries.length - HISTORY_LIMIT);
    publish(record, entries);
    return record.seq;
}

export function updatePanelTiming(seq, patch) {
    const entries = history();
    const index = entries.findIndex(entry => entry.seq === seq);
    if (index < 0) return false;
    const current = entries[index];
    const record = {
        ...current,
        renderMs: patch?.renderMs === undefined ? current.renderMs : Math.round((Number(patch.renderMs) || 0) * 10) / 10,
        stages: patch?.stages === undefined ? current.stages : Math.max(0, Math.trunc(Number(patch.stages) || 0)),
        mountedNodes: patch?.mountedNodes === undefined ? current.mountedNodes : Math.max(0, Math.trunc(Number(patch.mountedNodes) || 0)),
        parts: patch?.parts === undefined ? current.parts : Math.max(0, Math.trunc(Number(patch.parts) || 0)),
        maxChunkMs: patch?.maxChunkMs === undefined ? current.maxChunkMs : Math.round((Number(patch.maxChunkMs) || 0) * 10) / 10,
        maxPartMs: patch?.maxPartMs === undefined ? current.maxPartMs : Math.round((Number(patch.maxPartMs) || 0) * 10) / 10,
        maxParseMs: patch?.maxParseMs === undefined ? current.maxParseMs : Math.round((Number(patch.maxParseMs) || 0) * 10) / 10,
        maxTaskMs: patch?.maxTaskMs === undefined ? current.maxTaskMs : Math.round((Number(patch.maxTaskMs) || 0) * 10) / 10,
        prepareMs: patch?.prepareMs === undefined ? current.prepareMs : Math.round((Number(patch.prepareMs) || 0) * 10) / 10,
        totalMs: patch?.totalMs === undefined ? current.totalMs : Math.round((Number(patch.totalMs) || 0) * 10) / 10,
        complete: patch?.complete === undefined ? current.complete : Boolean(patch.complete)
    };
    entries[index] = record;
    // A cancelled earlier mount may finish after the player has opened another
    // tab. Update its history entry, but keep the public current record on the
    // newest activation instead of overwriting it with stale timing.
    publish(entries[entries.length - 1], entries);
    return true;
}

export function getPanelTimingSnapshot() {
    const entries = history();
    return {
        current: target().__panelTiming ? { ...target().__panelTiming, history: undefined } : null,
        history: entries.map(entry => ({ ...entry }))
    };
}

export const PANEL_TIMING_HISTORY_LIMIT = HISTORY_LIMIT;
