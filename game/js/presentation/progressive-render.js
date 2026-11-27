// Narrow-screen DOM hydration. Building a whole management archive in one
// click task forces font, style and layout work for hundreds of rows that are
// far outside the scrollport. Desktop heavy decks use the same scheduler now;
// a panel can hand over either one markup string or an array of markup parts.
// Parts may be functions, so a large archive is generated and parsed in small
// bounded tasks instead of one long input task.
const FRAME_BUDGET_MS = 4;
const PART_FRAME_BUDGET_MS = 8;
const PARTS_PER_FRAME = 6;
const NODES_PER_FRAME = 3;
const activeRuns = new WeakMap();

function closePrepChannel(run) {
    if (!run?.channel) return;
    run.channel.port1.onmessage = null;
    run.channel.port1.close();
    run.channel.port2.close();
    run.channel = null;
}

function cancelScheduled(run) {
    if (!run) return;
    if (run.channel) closePrepChannel(run);
    if (run.idle && run.frame) cancelIdleCallback(run.frame);
    else if (run.frame) cancelAnimationFrame(run.frame);
    run.frame = 0;
    run.idle = false;
}

function schedule(run, callback) {
    // Hydration stays on the existing frame scheduler. One small chunk per
    // frame keeps the next frame on the 60 Hz cadence; idle callbacks were
    // measured landing after a full layout and stretching frames to 50 ms.
    run.idle = false;
    run.frame = requestAnimationFrame(callback);
}

function schedulePrepare(run, callback) {
    // Generating markup mutates no DOM, so it does not need a rendering
    // opportunity. Running it as its own task keeps a 50-80 ms producer from
    // sharing a long task with the native style/layout pass that follows a
    // mount frame. MessageChannel is used instead of timers because it is not
    // clamped or shared with the game's existing setTimeout budgets.
    if (typeof window === "undefined" || typeof window.MessageChannel !== "function") {
        schedule(run, callback);
        return;
    }
    cancelScheduled(run);
    const channel = new window.MessageChannel();
    run.channel = channel;
    channel.port1.onmessage = () => {
        if (run.channel !== channel) return;
        closePrepChannel(run);
        callback();
    };
    channel.port2.postMessage(0);
}

// A record card is one player-facing unit. Mounting its shell early can expose
// a card without its action buttons for several frames, so cards up to this
// bound are appended whole. Everything else is split much earlier: a filter
// bar or summary strip is not a record, and appending its ten controls in one
// task still forced a 25 ms layout at 4x CPU even though each control is tiny.
const RECORD_CARD_SELECTOR = "article, button.population-citizen, details.population-household";
// A closed forest-atlas card is one coherent record: its summary and hidden
// body are only useful together. Splitting its ~100 nodes across frames made
// the phone atlas take over 45 seconds to expose the first of sixty cards.
// The card is still closed while it mounts, so the browser does not lay out
// the hidden body; one card per work item keeps the queue bounded and short.
const ATOMIC_RECORD_SELECTOR = "details.forest-atlas__card";
const RECORD_CARD_LIMIT = 96;
const SPLIT_CARD_NODES = 24;
const BLOCK_LIMIT = 8;

function registerPartSelectors(value, selectors) {
    if (!value || typeof value !== "object") return;
    if (value.into) selectors.add(value.into);
    if (!Array.isArray(value.more)) return;
    for (const part of value.more) {
        if (part && typeof part === "object" && part.into) selectors.add(part.into);
    }
}

function registerNodeTargets(node, run) {
    if (!node || node.nodeType !== 1) return;
    for (const selector of run.targetSelectors) {
        if (node.matches(selector)) run.targets.set(selector, node);
    }
}

function registerTreeTargets(node, run) {
    if (!node || node.nodeType !== 1) return;
    registerNodeTargets(node, run);
    for (const child of node.childNodes) registerTreeTargets(child, run);
}

function enqueueCardHalves(parent, node, queue, token, run) {
    const shell = node.cloneNode(false);
    registerNodeTargets(shell, run);
    const shellWork = () => {
        if (token !== run.token) return false;
        parent.appendChild(shell);
        return true;
    };
    shellWork.card = true;
    queue.push(shellWork);
    const children = [...node.childNodes];
    // A 23-node half-card still measured 53 ms on the 46-node realm cards;
    // 13-node halves stay below the long-task line. Very large cards therefore
    // mount in four batches, while noble houses and households keep two.
    const batchCount = node.querySelectorAll("*").length > 32 ? 4 : 2;
    const size = Math.ceil(children.length / batchCount);
    const batches = [];
    for (let index = 0; index < children.length; index += size) batches.push(children.slice(index, index + size));
    for (const batch of batches) {
        queue.push(() => {
            if (token !== run.token) return false;
            const fragment = document.createDocumentFragment();
            for (const child of batch) fragment.appendChild(child);
            shell.appendChild(fragment);
            return true;
        });
    }
    return shell;
}

function isSimple(node) {
    if (node.nodeType === 3) return true;
    if (node.nodeType !== 1) return true;
    const limit = node.matches(RECORD_CARD_SELECTOR) ? RECORD_CARD_LIMIT : BLOCK_LIMIT;
    return node.querySelectorAll("*").length < limit;
}

function enqueueTree(parent, node, queue, token, run) {
    registerNodeTargets(node, run);
    if (node.nodeType === 1 && node.matches(ATOMIC_RECORD_SELECTOR)) {
        registerTreeTargets(node, run);
        queue.push(() => {
            if (token !== run.token) return false;
            parent.appendChild(node);
            return true;
        });
        return node;
    }
    if (node.nodeType !== 1) {
        queue.push(() => {
            if (token !== run.token) return false;
            parent.appendChild(node);
            return true;
        });
        return node;
    }
    if (isSimple(node)) {
        registerTreeTargets(node, run);
        if (node.matches(RECORD_CARD_SELECTOR) && node.querySelectorAll("*").length > SPLIT_CARD_NODES) {
            return enqueueCardHalves(parent, node, queue, token, run);
        }
        const work = () => {
            if (token !== run.token) return false;
            parent.appendChild(node);
            return true;
        };
        work.card = node.matches(RECORD_CARD_SELECTOR);
        queue.push(work);
        return node;
    }
    const shell = node.cloneNode(false);
    registerNodeTargets(shell, run);
    const work = () => {
        if (token !== run.token) return false;
        parent.appendChild(shell);
        return true;
    };
    work.card = node.matches(RECORD_CARD_SELECTOR);
    queue.push(work);
    for (const child of [...node.childNodes]) enqueueTree(shell, child, queue, token, run);
    return shell;
}

export function renderProgressive(container, markup, { immediate = 1, resetScroll = false, deferStart = false, nodesPerFrame = NODES_PER_FRAME, cardsPerFrame = Infinity, onDone = null } = {}) {
    if (!container) return;
    const previous = activeRuns.get(container);
    cancelScheduled(previous);
    if (previous) {
        previous.queue.length = 0;
        previous.targets.clear();
        previous.targetSelectors?.clear();
        previous.producers = null;
    }
    const parts = Array.isArray(markup) ? markup : [markup];
    const targetSelectors = new Set();
    for (const part of parts) registerPartSelectors(part, targetSelectors);
    const run = {
        token: (previous?.token || 0) + 1, frame: 0, done: false,
        nodesPerFrame: Math.max(1, Math.trunc(nodesPerFrame) || NODES_PER_FRAME),
        cardsPerFrame: Math.max(1, Math.trunc(cardsPerFrame) || Infinity),
        stages: 0, mountedNodes: 0, maxChunkMs: 0, startedAt: performance.now(),
        parts: parts.length, partIndex: 0, prepareMs: 0, maxPartMs: 0, parseMs: 0,
        maxParseMs: 0, targets: new Map(), targetSelectors, producers: parts
    };
    const stats = () => ({
        stages: run.stages,
        mountedNodes: run.mountedNodes,
        maxChunkMs: Math.round(run.maxChunkMs * 10) / 10,
        totalMs: Math.round((performance.now() - run.startedAt) * 10) / 10,
        parts: run.parts,
        prepareMs: Math.round(run.prepareMs * 10) / 10,
        maxPartMs: Math.round(run.maxPartMs * 10) / 10,
        parseMs: Math.round(run.parseMs * 10) / 10,
        maxParseMs: Math.round(run.maxParseMs * 10) / 10,
        maxTaskMs: Math.round(Math.max(run.maxChunkMs, run.maxPartMs, run.maxParseMs) * 10) / 10
    });
    const publish = extra => {
        window.__progressiveTiming = { ...(window.__progressiveTiming || {}), ...extra };
    };
    const finish = () => {
        if (run.done || run.token !== activeRuns.get(container)?.token) return;
        run.done = true;
        const finalStats = stats();
        publish(finalStats);
        try { onDone?.(finalStats); } catch (error) { console.error(error); }
        // A finished run still holds the detached shells it cloned while
        // splitting records. Releasing them here keeps the next tab from
        // inheriting thousands of dead DOM nodes through the active-run map.
        run.queue.length = 0;
        run.targets.clear();
        run.targetSelectors.clear();
        // Generated thunks can close over large private buffers (biome and
        // forest cards build their strings this way). Drop the producer list
        // once the final markup is mounted so tab switches do not retain it.
        run.producers = null;
    };
    const enqueuePart = part => {
        const __t0 = performance.now();
        const value = typeof part === "function" ? part() : part;
        registerPartSelectors(value, run.targetSelectors);
        const htmlValue = typeof value === "string" ? value
            : typeof value?.html === "function" ? value.html() : value?.html;
        const html = typeof htmlValue === "string" ? htmlValue : "";
        const into = typeof value === "object" && value ? value.into : null;
        const more = Array.isArray(value?.more) ? value.more : null;
        const elapsed = performance.now() - __t0;
        run.prepareMs += elapsed;
        run.maxPartMs = Math.max(run.maxPartMs, elapsed);
        // A producer can continue itself without forcing every future step to
        // be created in the click task. The forest survey uses this to advance
        // one bounded slice per frame and then hand over to the markup parts.
        if (more?.length && run.token === activeRuns.get(container)?.token) {
            parts.splice(run.partIndex, 0, ...more);
            run.parts = parts.length;
            publish({ parts: run.parts });
        }
        if (!html) return;
        const __p0 = performance.now();
        const template = document.createElement("template");
        template.innerHTML = html;
        const parsed = performance.now() - __p0;
        run.parseMs += parsed;
        run.maxParseMs = Math.max(run.maxParseMs, parsed);
        publish({
            parseMs: Math.round(run.parseMs * 10) / 10,
            maxParseMs: Math.round(run.maxParseMs * 10) / 10,
            markupChars: (window.__progressiveTiming?.markupChars || 0) + html.length
        });
        const queue = activeRuns.get(container)?.queue;
        if (!queue) return;
        let parent = container;
        if (into) {
            // A shell can still be queued rather than mounted, so the tracked
            // node is the one that will actually be appended to the panel.
            parent = run.targets.get(into) || container.querySelector(into) || container;
        }
        const roots = [...template.content.childNodes];
        for (const root of roots) enqueueTree(parent, root, queue, run.token, run);
    };
    activeRuns.set(container, run);
    run.queue = [];
    publish({ markupChars: 0, parseMs: 0, startMs: 0, replaceMs: 0, firstNodeMs: 0, parts: parts.length });
    const partsMode = parts.length > 1 || typeof parts[0] === "function";
    if (!partsMode) {
        const __t0 = performance.now();
        const template = document.createElement("template");
        template.innerHTML = parts[0] ?? "";
        run.parseMs = performance.now() - __t0;
        run.maxParseMs = run.parseMs;
        publish({
            parseMs: Math.round(run.parseMs * 10) / 10,
            maxParseMs: Math.round(run.maxParseMs * 10) / 10,
            markupChars: (parts[0] || "").length
        });
        const roots = [...template.content.childNodes];
        for (const root of roots) enqueueTree(container, root, run.queue, run.token, run);
        run.partIndex = parts.length;
    }
    const start = () => {
        run.frame = 0;
        if (run.token !== activeRuns.get(container)?.token || !container.isConnected) return;
        const __started = performance.now();
        container.replaceChildren();
        const __replaced = performance.now();
        // Reset the previous archive's scroll only after its nodes are gone.
        // Doing it before replacement forces layout of the panel being left.
        if (resetScroll) container.scrollTop = 0;
        // Keep the panel title immediate when not deferring; hydrate the rest
        // next frame. Deferred starts keep replacement and first-paint layout
        // out of the input task entirely.
        // `immediate: 0` keeps the replacement frame free of the first
        // chunk: clearing the old panel and laying out the new one were one
        // 45-50 ms task at 4x CPU even when every later chunk stayed small.
        // The first node is then appended by the scheduled frame instead of
        // being discarded.
        let firstWork = null;
        if (!partsMode && immediate > 0) firstWork = run.queue.shift();
        if (firstWork) {
            const firstStarted = performance.now();
            try { firstWork(); } catch (error) { console.error(error); }
            run.stages++;
            run.mountedNodes++;
            run.maxChunkMs = Math.max(run.maxChunkMs, performance.now() - firstStarted);
        }
        publish({
            startMs: Math.round((performance.now() - __started) * 10) / 10,
            replaceMs: Math.round((__replaced - __started) * 10) / 10,
            firstNodeMs: Math.round((performance.now() - __replaced) * 10) / 10
        });
        schedule(run, pump);
    };
    // Generation and mounting alternate one bounded phase per frame. Parsing
    // every future part before the first mount left target containers detached:
    // later records were appended to the panel root instead of their own shell.
    // Alternating also keeps the live DOM and the next producer in step, so a
    // target is always present before the parts that fill it are generated.
    const prepareBatch = () => {
        run.frame = 0;
        if (run.token !== activeRuns.get(container)?.token || !container.isConnected) return;
        // Several cheap parts share one frame. A mature forest atlas used to
        // spend over a second building one string; bounded producers keep each
        // part short, and batching them removes one style/layout/paint pass per
        // part at 4x CPU without letting the frame's JS work grow unbounded.
        const started = performance.now();
        let count = 0;
        while (count < PARTS_PER_FRAME && performance.now() - started < PART_FRAME_BUDGET_MS) {
            while (run.partIndex < parts.length && !parts[run.partIndex]) run.partIndex++;
            if (run.partIndex >= parts.length) break;
            enqueuePart(parts[run.partIndex++]);
            count++;
        }
    };
    const takeBatch = () => {
        run.frame = 0;
        if (run.token !== activeRuns.get(container)?.token || !container.isConnected) return;
        const started = performance.now();
        let count = 0;
        let cards = 0;
        while (run.queue.length && count < run.nodesPerFrame && performance.now() - started < FRAME_BUDGET_MS) {
            const work = run.queue[0];
            if (work.card && cards >= run.cardsPerFrame) break;
            run.queue.shift();
            try {
                if (!work()) return;
            } catch (error) {
                console.error(error);
                return;
            }
            count++;
            if (work.card) cards++;
        }
        if (count > 0) {
            run.stages++;
            run.mountedNodes += count;
            run.maxChunkMs = Math.max(run.maxChunkMs, performance.now() - started);
        }
    };
    const pump = () => {
        run.frame = 0;
        if (run.token !== activeRuns.get(container)?.token || !container.isConnected) return;
        if (run.partIndex < parts.length) {
            prepareBatch();
            schedulePrepare(run, pump);
            return;
        }
        if (run.queue.length) {
            takeBatch();
            schedule(run, pump);
            return;
        }
        finish();
    };
    if (deferStart) { run.idle = false; run.frame = requestAnimationFrame(start); }
    else start();
}

export function cancelProgressiveRender(container) {
    if (!container) return;
    const run = activeRuns.get(container);
    cancelScheduled(run);
    if (run) {
        run.token++;
        run.queue.length = 0;
        run.targets.clear();
        run.targetSelectors?.clear();
        run.producers = null;
    }
    activeRuns.delete(container);
}
