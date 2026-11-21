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

function isSimple(node) {
    if (node.nodeType === 3) return true;
    if (node.nodeType !== 1) return true;
    return node.querySelectorAll("*").length < 24;
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
        queue.push(() => {
            if (token !== run.token) return false;
            parent.appendChild(node);
            return true;
        });
        return;
    }
    const shell = node.cloneNode(false);
    queue.push(() => {
        if (token !== run.token) return false;
        parent.appendChild(shell);
        return true;
    });
    for (const child of [...node.childNodes]) enqueueTree(shell, child, queue, token, run);
}

export function renderProgressive(container, markup, { immediate = 1, resetScroll = false, deferStart = false, nodesPerFrame = NODES_PER_FRAME, onDone = null } = {}) {
    if (!container) return;
    const previous = activeRuns.get(container);
    cancelScheduled(previous);
    const run = { token: (previous?.token || 0) + 1, frame: 0, done: false, nodesPerFrame: Math.max(1, Math.trunc(nodesPerFrame) || NODES_PER_FRAME) };
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
        const firstWork = queue.shift();
        if (firstWork && immediate > 0) {
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
        while (queue.length && count < run.nodesPerFrame && performance.now() - started < FRAME_BUDGET_MS) {
            const work = queue.shift();
            try {
                if (!work()) return;
            } catch (error) {
                console.error(error);
                return;
            }
            count++;
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
