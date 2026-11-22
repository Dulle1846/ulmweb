// Browser proof for the player-facing half of 1.2.20.
//
// The effect proof already proves that each catalogue row moves state. This
// test proves the other half: the real HAZARDS renderer must show that row in a
// real DOM, with its live value, after the same trigger. It then hides exactly
// one surface through the production seam and requires that row to disappear
// while every other row present in the baseline stays rendered.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const port = Number(process.env.E2E_PORT) || 4192;
const mime = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png"
};
const server = createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
        const relative = pathname === "/" ? "index.html" : pathname.slice(1);
        const file = resolve(root, relative);
        if (file !== root && !file.startsWith(root + sep)) {
            response.writeHead(403).end("Forbidden");
            return;
        }
        const data = await readFile(file);
        response.writeHead(200, {
            "content-type": mime[extname(file)] || "application/octet-stream",
            "cache-control": "no-store"
        });
        response.end(data);
    } catch {
        response.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    }
});
await new Promise(resolveListen => server.listen(port, "127.0.0.1", resolveListen));
const browser = await chromium.launch({
    headless: true,
    channel: process.env.E2E_CHANNEL || "chromium",
    executablePath: process.env.E2E_CHROMIUM_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-software-rasterizer"]
});

try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, reducedMotion: "reduce" });
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto("http://127.0.0.1:" + port + "/tests/browser/hazard-visibility-harness.html", {
        waitUntil: "domcontentloaded", timeout: 60000
    });

    const result = await page.evaluate(async () => {
        const { PROOFS, runProof } = await import("/tests/world/hazard-proof-cases.js");
        const { renderHazardPanel } = await import("/js/presentation/hazard-panel.js");
        const {
            clearHazardSurfaceProofHidden, setHazardSurfaceProofHidden
        } = await import("/js/systems/hazard-proof.js");
        const host = document.getElementById("visibility-host");
        const rows = () => [...host.querySelectorAll("[data-hazard-surface]")]
            .map(row => row.getAttribute("data-hazard-surface"));
        const rowFor = spec => host.querySelector('[data-hazard-surface="' + CSS.escape(spec) + '"]');
        const results = [];
        for (const proof of PROOFS) {
            clearHazardSurfaceProofHidden();
            let triggerError = "";
            try {
                runProof(proof);
            } catch (error) {
                triggerError = error.message;
            }
            host.innerHTML = renderHazardPanel();
            const row = rowFor(proof.spec);
            const normalText = row ? row.textContent.trim() : "";
            const normalValue = row ? row.getAttribute("data-hazard-value") : null;
            const others = [...new Set(rows().filter(spec => spec !== proof.spec))];
            const normal = Boolean(row && normalText && normalValue !== null && normalValue !== "");

            setHazardSurfaceProofHidden([proof.spec]);
            host.innerHTML = renderHazardPanel();
            const hidden = !rowFor(proof.spec);
            const othersStill = others.every(spec => Boolean(rowFor(spec)));
            clearHazardSurfaceProofHidden();
            results.push({
                spec: proof.spec,
                group: proof.group,
                normal,
                hidden,
                othersStill,
                text: normalText.slice(0, 160),
                value: normalValue,
                error: triggerError
            });
        }
        return results;
    });

    const normalFailures = result.filter(item => !item.normal);
    const hiddenFailures = result.filter(item => !item.hidden);
    const isolationFailures = result.filter(item => !item.othersStill);
    const triggerFailures = result.filter(item => item.error);
    console.log(JSON.stringify({
        checked: result.length,
        normal: result.length - normalFailures.length,
        hidden: result.length - hiddenFailures.length,
        survivors: hiddenFailures.length,
        isolation: result.length - isolationFailures.length,
        normalFailures: normalFailures.slice(0, 12),
        hiddenFailures: hiddenFailures.slice(0, 12),
        isolationFailures: isolationFailures.slice(0, 12),
        triggerFailures: triggerFailures.slice(0, 12)
    }, null, 2));
    assert.deepEqual(pageErrors, [], "the visibility harness must not throw page errors");
    assert.equal(result.length, 102, "all 102 catalogue rows must be checked");
    assert.deepEqual(normalFailures, [], "every catalogue row must render in the HAZARDS tab");
    assert.deepEqual(hiddenFailures, [], "hiding one surface must remove exactly that row");
    assert.deepEqual(isolationFailures, [], "hiding one surface must not remove other rows");
    assert.deepEqual(triggerFailures, [], "each row must be triggered through the real simulation path");
    console.log("HAZARD VISIBILITY 102/102 · NEUTRALIZED 102/102 · SURVIVORS 0/102");
} finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
