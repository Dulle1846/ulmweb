// Real-browser keyboard-only proof for item 28.
//
// No pointer is used after the realm has started. The run pauses with P while
// a button owns focus, arrows through both tablists, activates Repair All with
// Enter, checks that focus survives the panel rebuild, closes with Escape and
// completes a market trade from the keyboard. Focus rings are read from the
// rendered computed style, not from a stylesheet string.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { browserLaunchOptions } from "./browser-preflight.mjs";

const root = resolve(process.cwd());
const port = Number(process.env.E2E_PORT) || 4212;
const baseUrl = "http://127.0.0.1:" + port;
const mime = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json"
};
const server = createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
        const file = resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
        if (file !== root && !file.startsWith(root + sep)) return res.writeHead(403).end("Forbidden");
        const data = await readFile(file);
        res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
        res.end(data);
    } catch {
        res.writeHead(404).end("Not found");
    }
});
await new Promise(done => server.listen(port, "127.0.0.1", done));

const browser = await chromium.launch(browserLaunchOptions());
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});
const report = { ok: false, pageErrors, consoleErrors };

const active = () => page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    return {
        id: el.id || "",
        tag: el.tagName,
        command: el.dataset?.command || "",
        tab: el.dataset?.commandTab || "",
        trade: el.dataset?.trade || "",
        selected: el.getAttribute("aria-selected"),
        outline: getComputedStyle(el).outlineStyle,
        outlineWidth: getComputedStyle(el).outlineWidth,
        connected: el.isConnected
    };
});

async function tabUntil(predicate, limit = 80) {
    for (let step = 0; step < limit; step++) {
        await page.keyboard.press("Tab");
        const now = await active();
        if (now && predicate(now)) return { found: true, steps: step + 1, node: now };
    }
    return { found: false, steps: limit, node: await active() };
}

try {
    await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261128");
    await page.locator("#player-name-input").fill("Keyboard Proof");
    await page.locator("#start-new-game-btn").click({ noWaitAfter: true, timeout: 120000 });
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 120000 });
    // Two genuinely damaged finished structures give Repair All a real job.
    const damaged = await page.evaluate(async () => {
        const [{ state }, { TYPE }, { spawnEntity }] = await Promise.all([
            import("./js/core/state.js"), import("./js/core/types.js"), import("./js/world/entities.js")
        ]);
        state.resources.wood = 500;
        state.resources.stone = 500;
        const first = spawnEntity(48, 40, TYPE.WALL);
        const second = spawnEntity(50, 40, TYPE.HOUSE);
        first.hp = Math.round(first.maxHp * 0.5);
        second.hp = Math.round(second.maxHp * 0.5);
        return { first: first.id, second: second.id };
    });
    assert.ok(damaged.first && damaged.second, "the proof structures must exist");

    // The world must be pausable while any control owns focus. Focus the
    // management opener first; a plain P used to be swallowed by that button.
    await page.locator("#command-open-btn").focus();
    await page.keyboard.press("p");
    await page.waitForFunction(() => document.querySelector("#pause-text")?.textContent === "RESUME", null, { timeout: 5000 });
    assert.equal(await page.locator("#pause-btn").getAttribute("aria-pressed"), "true", "pause must expose its state");
    assert.match(await page.locator("#action-toast").innerText(), /SIMULATION PAUSED/i);
    const pauseFocus = await active();
    assert.equal(pauseFocus.id, "command-open-btn", "pausing must not steal the player's place");
    await page.keyboard.press("P");
    await page.waitForFunction(() => document.querySelector("#pause-text")?.textContent === "PAUSE", null, { timeout: 5000 });
    assert.equal(await page.locator("#pause-btn").getAttribute("aria-pressed"), "false");

    // Open management from the keyboard and arrow through the real tablist.
    await page.keyboard.press("Enter");
    await page.locator("#command-modal").waitFor({ state: "visible", timeout: 15000 });
    await page.waitForFunction(() => document.activeElement?.id === "command-close", null, { timeout: 5000 });
    const deckCount = await page.locator("#command-modal .command-deck [role='tab']").count();
    assert.ok(deckCount >= 25, "the full command deck must be keyboard-addressable");
    const firstDeckTab = await tabUntil(node => Boolean(node.tab), 16);
    assert.equal(firstDeckTab.found, true, "Tab must reach the command deck from the close button");
    let buildings = null;
    for (let step = 0; step <= deckCount; step++) {
        const now = await active();
        if (now.tab === "buildings") { buildings = { ...now, steps: step }; break; }
        await page.keyboard.press("ArrowRight");
    }
    assert.ok(buildings, "ArrowRight must reach the Buildings tab");
    // The tablist updates aria-selected in the render frame after focus moves;
    // wait for that state rather than racing the render with a single read.
    await page.waitForFunction(
        () => document.activeElement?.dataset.commandTab === "buildings"
            && document.activeElement?.getAttribute("aria-selected") === "true",
        null,
        { timeout: 5000 }
    );
    buildings = await active();
    assert.equal(buildings.selected, "true", "the active command tab must expose aria-selected");
    assert.notEqual(buildings.outline, "none", "keyboard focus on a command tab must be visible");
    await page.locator('[data-command="repair-all"]').waitFor({ state: "visible", timeout: 15000 });


    // The panel renders from live state only on the next action; reopening the
    // same tab is still a keyboard-only activation.
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
        () => /DAMAGED STRUCTURES\s*2/.test(document.querySelector("#command-panel-content")?.textContent || ""),
        null, { timeout: 15000 }
    );

    // Tab from the close button to the real bulk-repair command, then Enter.
    await page.locator("#command-close").focus();
    const reached = await tabUntil(node => node.command === "repair-all", 90);
    assert.equal(reached.found, true, "Tab must reach REPAIR ALL DAMAGED STRUCTURES");
    assert.notEqual(reached.node.outline, "none", "keyboard focus on the repair command must be visible");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
        () => /DAMAGED STRUCTURES\s*0/.test(document.querySelector("#command-panel-content")?.textContent || ""),
        null, { timeout: 15000 }
    );
    const afterRepair = await active();
    assert.equal(afterRepair.connected, true, "the focused control must survive the panel rebuild");
    assert.notEqual(afterRepair.tag, "BODY", "focus must never fall back to <body> after a keyboard action");

    // Escape closes the dialog and focus restoration returns to the opener.
    await page.keyboard.press("Escape");
    await page.locator("#command-modal").waitFor({ state: "hidden", timeout: 5000 });
    await page.waitForFunction(() => document.activeElement?.id === "command-open-btn", null, { timeout: 5000 });

    // Side tabs are a real tablist too: arrow to TRADE and trade with Enter.
    await page.locator("#tab-0").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#tab-1").getAttribute("aria-selected"), "true");
    await page.keyboard.press("End");
    assert.equal(await page.locator("#tab-2").getAttribute("aria-selected"), "true");
    await page.waitForFunction(
        () => /REGIONAL EXCHANGE/i.test(document.querySelector("#tab-content")?.textContent || ""),
        null, { timeout: 10000 }
    );
    const tabFocus = await active();
    assert.equal(tabFocus.id, "tab-2");
    assert.notEqual(tabFocus.outline, "none", "the side tab's keyboard focus must be visible");
    const trade = await tabUntil(node => node.trade === "buy" || node.trade === "sell", 80);
    assert.equal(trade.found, true, "Tab must reach a real market order");
    const tradeSignature = await page.evaluate(() => {
        const el = document.activeElement;
        return { trade: el.dataset.trade, good: el.dataset.good || "", resource: el.dataset.resource || "", partner: el.dataset.partner || "", quantity: el.dataset.quantity || "" };
    });
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector("#action-toast")?.classList.contains("is-visible"), null, { timeout: 5000 });
    const afterTrade = await active();
    assert.notEqual(afterTrade.tag, "BODY", "a market order must leave focus on a real control");
    if (afterTrade.trade) {
        const restored = await page.evaluate(signature => {
            const el = document.activeElement;
            return el.dataset.trade === signature.trade && (el.dataset.good || "") === signature.good &&
                (el.dataset.resource || "") === signature.resource && (el.dataset.partner || "") === signature.partner &&
                (el.dataset.quantity || "") === signature.quantity;
        }, tradeSignature);
        assert.equal(restored, true, "the same market order must keep focus after renderUI");
    }

    assert.deepEqual(pageErrors, [], "the keyboard journey must not raise page errors");
    assert.deepEqual(consoleErrors, [], "the keyboard journey must not raise console errors");
    report.ok = true;
    report.deckTabs = deckCount;
    report.repairTabSteps = buildings.steps;
    report.repairTabStepsFromClose = reached.steps;
    report.tradeSteps = trade.steps;
} catch (error) {
    report.error = error && error.message ? error.message : String(error);
} finally {
    await browser.close().catch(() => {});
    await new Promise(done => server.close(done));
}

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
