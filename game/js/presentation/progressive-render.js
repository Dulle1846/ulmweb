// Narrow-screen DOM hydration. Building a whole management archive in one
// click task forces font, style and layout work for hundreds of rows that are
// far outside the 259px scrollport. Desktop still renders synchronously; on a
// phone the parsed tree is attached in small shallow chunks across animation
// frames, so every task stays inside the low-end budget.
const FRAME_BUDGET_MS = 4;
const NODES_PER_FRAME = 3;
const activeRuns = new WeakMap();

function cancelScheduled(run) {
    if (!run) return;
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

// A record card is one player-facing unit. Mounting its shell early can expose
// a card without its action buttons for several frames, so cards up to this
// bound are appended whole. Everything else is split much earlier: a filter
// bar or summary strip is not a record, and appending its ten controls in one
// task still forced a 25 ms layout at 4x CPU even though each control is tiny.
const RECORD_CARD_SELECTOR = "article, button.population-citizen, details.population-household";
const RECORD_CARD_LIMIT = 96;
const SPLIT_CARD_NODES = 24;
const BLOCK_LIMIT = 8;

function enqueueCardHalves(parent, node, queue, token, run) {
    const shell = node.cloneNode(false);
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
}

function isSimple(node) {
    if (node.nodeType === 3) return true;
    if (node.nodeType !== 1) return true;
    const limit = node.matches(RECORD_CARD_SELECTOR) ? RECORD_CARD_LIMIT : BLOCK_LIMIT;
    return node.querySelectorAll("*").length < limit;
}

function enqueueTree(parent, node, queue, token, run) {
    if (node.nodeType !== 1) {
        queue.push(() => {
            if (token !== run.token) return false;
            parent.appendChild(node);
            return true;
        });
        return;
    }
    if (isSimple(node)) {
        if (node.matches(RECORD_CARD_SELECTOR) && node.querySelectorAll("*").length > SPLIT_CARD_NODES) {
            enqueueCardHalves(parent, node, queue, token, run);
            return;
        }
        const work = () => {
            if (token !== run.token) return false;
            parent.appendChild(node);
            return true;
        };
        work.card = node.matches(RECORD_CARD_SELECTOR);
        queue.push(work);
        return;
    }
    const shell = node.cloneNode(false);
    const work = () => {
        if (token !== run.token) return false;
        parent.appendChild(shell);
        return true;
    };
    work.card = node.matches(RECORD_CARD_SELECTOR);
    queue.push(work);
    for (const child of [...node.childNodes]) enqueueTree(shell, child, queue, token, run);
}

export function renderProgressive(container, markup, { immediate = 1, resetScroll = false, deferStart = false, nodesPerFrame = NODES_PER_FRAME, cardsPerFrame = Infinity, onDone = null } = {}) {
    if (!container) return;
    const previous = activeRuns.get(container);
    cancelScheduled(previous);
    const run = { token: (previous?.token || 0) + 1, frame: 0, done: false, nodesPerFrame: Math.max(1, Math.trunc(nodesPerFrame) || NODES_PER_FRAME), cardsPerFrame: Math.max(1, Math.trunc(cardsPerFrame) || Infinity) };
    const finish = () => {
        if (run.done || run.token !== activeRuns.get(container)?.token) return;
        run.done = true;
        try { onDone?.(); } catch (error) { console.error(error); }
    };
    activeRuns.set(container, run);
    const __t0 = performance.now();
    const template = document.createElement("template");
    template.innerHTML = markup;
    window.__progressiveTiming = { parseMs: Math.round((performance.now() - __t0) * 10) / 10, markupChars: markup.length };
    const queue = [];
    const roots = [...template.content.childNodes];
    for (const root of roots) enqueueTree(container, root, queue, run.token, run);
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
        const firstWork = immediate > 0 ? queue.shift() : null;
        if (firstWork) {
            try { firstWork(); } catch (error) { console.error(error); }
        }
        window.__progressiveTiming = {
            ...(window.__progressiveTiming || {}),
            startMs: Math.round((performance.now() - __started) * 10) / 10,
            replaceMs: Math.round((__replaced - __started) * 10) / 10,
            firstNodeMs: Math.round((performance.now() - __replaced) * 10) / 10
        };
        if (queue.length) schedule(run, take);
        else finish();
    };
    const take = () => {
        run.frame = 0;
        if (run.token !== activeRuns.get(container)?.token || !container.isConnected) return;
        const started = performance.now();
        let count = 0;
        let cards = 0;
        while (queue.length && count < run.nodesPerFrame && performance.now() - started < FRAME_BUDGET_MS) {
            const work = queue[0];
            if (work.card && cards >= run.cardsPerFrame) break;
            queue.shift();
            try {
                if (!work()) return;
            } catch (error) {
                console.error(error);
                return;
            }
            count++;
            if (work.card) cards++;
        }
        if (queue.length) schedule(run, take);
        else finish();
    };
    if (deferStart) { run.idle = false; run.frame = requestAnimationFrame(start); }
    else start();
}

export function cancelProgressiveRender(container) {
    if (!container) return;
    const run = activeRuns.get(container);
    cancelScheduled(run);
    if (run) run.token++;
    activeRuns.delete(container);
}
