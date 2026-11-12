// Narrow-screen DOM hydration. Building a whole management archive in one
// click task forces font, style and layout work for hundreds of rows that are
// far outside the 259px scrollport. Desktop still renders synchronously; on a
// phone the parsed tree is attached in small shallow chunks across animation
// frames, so every task stays inside the low-end budget.
const FRAME_BUDGET_MS = 3;
const NODES_PER_FRAME = 2;
const activeRuns = new WeakMap();

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

export function renderProgressive(container, markup, { immediate = 1, onDone = null } = {}) {
    if (!container) return;
    const previous = activeRuns.get(container);
    if (previous?.frame) cancelAnimationFrame(previous.frame);
    const run = { token: (previous?.token || 0) + 1, frame: 0, done: false };
    const finish = () => {
        if (run.done || run.token !== activeRuns.get(container)?.token) return;
        run.done = true;
        try { onDone?.(); } catch (error) { console.error(error); }
    };
    activeRuns.set(container, run);
    container.replaceChildren();
    const __t0 = performance.now();
    const template = document.createElement("template");
    template.innerHTML = markup;
    window.__progressiveTiming = { parseMs: Math.round((performance.now() - __t0) * 10) / 10, markupChars: markup.length };
    const queue = [];
    const roots = [...template.content.childNodes];
    for (const root of roots) enqueueTree(container, root, queue, run.token, run);
    const take = () => {
        run.frame = 0;
        if (run.token !== activeRuns.get(container)?.token || !container.isConnected) return;
        const started = performance.now();
        let count = 0;
        while (queue.length && count < NODES_PER_FRAME && performance.now() - started < FRAME_BUDGET_MS) {
            const work = queue.shift();
            try {
                if (!work()) return;
            } catch (error) {
                console.error(error);
                return;
            }
            count++;
        }
        if (queue.length) run.frame = requestAnimationFrame(take);
        else finish();
    };
    // Keep the panel title immediate; hydrate the archive below it next frame.
    const firstWork = queue.shift();
    if (firstWork && immediate > 0) {
        try { firstWork(); } catch (error) { console.error(error); }
    }
    if (queue.length) run.frame = requestAnimationFrame(take);
    else finish();
}

export function cancelProgressiveRender(container) {
    if (!container) return;
    const run = activeRuns.get(container);
    if (run?.frame) cancelAnimationFrame(run.frame);
    if (run) run.token++;
    activeRuns.delete(container);
}
