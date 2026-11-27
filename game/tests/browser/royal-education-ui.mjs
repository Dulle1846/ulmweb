// Real-browser proof for royal education. A started, paused realm is married via
// the visible Decisions controls, welcomes a royal child, appoints an eligible
// adult Tutor, enrols the child in the authored three-year Letters curriculum,
// advances the annual tutelage clock, holds the coming-of-age audience through
// the real button, then save/loads through the visible controls and verifies the
// nested royal.education DTO byte-for-byte. No page or console errors tolerated.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { browserLaunchOptions } from "./browser-preflight.mjs";

const root = resolve(process.cwd());
const port = Number(process.env.E2E_PORT) || 4293;
const baseUrl = process.env.E2E_BASE_URL ? process.env.E2E_BASE_URL.replace(/\/$/, "") : null;
const mime = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json",
    ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"
};
const server = baseUrl ? null : createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
        const file = resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
        if (file !== root && !file.startsWith(root + sep)) return res.writeHead(403).end("Forbidden");
        const data = await readFile(file);
        res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
        res.end(data);
    } catch {
        res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    }
});
if (server) await new Promise(done => server.listen(port, "127.0.0.1", done));

const browser = await chromium.launch(browserLaunchOptions());
const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

const url = baseUrl ? baseUrl + "/" : "http://127.0.0.1:" + port + "/";

async function waitFor(description, pageFunction, arg = null, timeout = 15000) {
    try {
        await page.waitForFunction(pageFunction, arg, { timeout });
    } catch (error) {
        throw new Error("Timed out waiting for " + description + ": " + error.message);
    }
}

async function openPanel(id) {
    if (await page.locator("#command-modal").evaluate(element => element.classList.contains("hidden"))) {
        await page.locator("#command-open-btn").click();
        await page.locator("#command-modal").waitFor({ state: "visible", timeout: 15000 });
    }
    await page.locator('[data-command-tab="' + id + '"]').click();
    await waitFor("the " + id + " command panel to render", tab => {
        const button = document.querySelector('[data-command-tab="' + tab + '"]');
        const content = document.querySelector("#command-panel-content");
        return Boolean(button?.classList.contains("is-active") && content?.textContent.trim().length > 40);
    }, id);
}

async function educationDossier() {
    return page.evaluate(async () => JSON.parse(JSON.stringify(
        (await import("./js/core/state.js")).state.royal.education)));
}

async function advanceEducation(year) {
    const annual = await page.evaluate(async value => {
        const { state } = await import("./js/core/state.js");
        const { updateRoyalEducation } = await import("./js/systems/royal-education.js");
        state.year = value;
        return updateRoyalEducation();
    }, year);
    await openPanel("decisions");
    return annual;
}

let proof = {};
try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261128");
    await page.locator("#player-name-input").fill("Royal Education Proof");
    await page.locator("#start-new-game-btn").click({ noWaitAfter: true, timeout: 120000 });
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 120000 });
    await page.locator("#pause-btn").click();
    await waitFor("the realm to pause", async () => (await import("./js/core/state.js")).state.isPaused);

    // Minimal fixture: two known adults outside the sovereign's close kin, so
    // the real selects always offer a consort and a tutor. Every player action
    // below stays a visible click.
    const fixture = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { TYPE } = await import("./js/core/types.js");
        const { ensurePersonProfile } = await import("./js/systems/people.js");
        const villagers = state.entities.filter(entity => entity.type === TYPE.VILLAGER && !entity.isKing);
        if (villagers.length < 2) throw new Error("the opening realm needs two adult villagers for this proof");
        const [consort, tutor] = villagers;
        const consortPerson = ensurePersonProfile(consort);
        const tutorPerson = ensurePersonProfile(tutor);
        for (const [person, age] of [[consortPerson, 30], [tutorPerson, 34]]) {
            person.species = "human";
            person.ageYears = age;
            person.lifeStage = "adult";
        }
        return {
            consortId: consort.personId, consortName: consortPerson.name,
            tutorId: tutor.personId, tutorName: tutorPerson.name
        };
    });

    await openPanel("decisions");
    const initialText = await page.locator("#command-panel-content").textContent();
    assert.match(initialText, /ROYAL MARRIAGE/, "the Decisions panel must expose the marriage section");
    assert.match(initialText, /ROYAL EDUCATION · TUTOR & TUTELAGE/, "the Decisions panel must expose royal education");
    assert.equal(await page.locator("#royal-consort-select").count(), 1, "the consort select must be visible");
    assert.equal(await page.locator('[data-command="royal-birth"]').isEnabled(), false,
        "royal birth must be disabled until a living consort exists");

    await page.locator("#royal-consort-select").selectOption(fixture.consortId);
    await page.locator('[data-command="consort"]').click();
    await waitFor("the visible marriage to appoint a consort", async id =>
        (await import("./js/core/state.js")).state.royal?.consortId === id, fixture.consortId);
    const afterMarriage = await page.locator("#command-panel-content").textContent();
    assert.ok(afterMarriage.includes(fixture.consortName), "the married consort must be visible in the panel");
    assert.equal(await page.locator("#royal-consort-select").count(), 0, "the consort select must close after marriage");
    assert.equal(await page.locator('[data-command="royal-birth"]').isEnabled(), true, "birth must unlock with a living consort");

    await page.locator('[data-command="royal-birth"]').click();
    await waitFor("the royal child row after the visible birth",
        () => document.querySelectorAll("[data-education-child]").length >= 1);
    const childId = await page.locator("[data-education-child]").first().getAttribute("data-education-child");
    assert.ok(childId, "the newborn must expose a real education child id");

    const tutorOption = page.locator('#royal-tutor-select option[value="' + fixture.tutorId + '"]');
    assert.equal(await tutorOption.count(), 1, "the eligible adult tutor must be selectable");
    await page.locator("#royal-tutor-select").selectOption(fixture.tutorId);
    await page.locator('[data-command="royal-education-tutor"]').click();
    await waitFor("the visible tutor appointment toast",
        () => /ROYAL TUTOR APPOINTED/.test(document.querySelector("#action-toast")?.textContent || ""));
    const afterTutor = await educationDossier();
    assert.equal(afterTutor.tutorId, fixture.tutorId);
    assert.equal(afterTutor.tutorName, fixture.tutorName);

    const curriculumSelect = page.locator("#royal-curriculum-" + childId);
    assert.equal(await curriculumSelect.count(), 1, "the royal child must have a visible curriculum select");
    await curriculumSelect.selectOption("letters");
    await page.locator('[data-command="royal-education-enroll"][data-value="' + childId + '"]').click();
    await waitFor("the visible Letters enrolment toast",
        () => /ENROLLED IN LETTERS/.test(document.querySelector("#action-toast")?.textContent || ""));
    const enrolled = await educationDossier();
    assert.equal(enrolled.students.length, 1, "one student must be enrolled");
    const student = enrolled.students[0];
    assert.equal(student.personId, childId);
    assert.equal(student.curriculumId, "letters");
    assert.equal(student.yearsRequired, 3);
    assert.equal(student.stage, "tutelage");

    // The authored curriculum needs three new years. updateRoyalEducation is the
    // exact annual system the simulation calls; calling it after each setYear
    // keeps the proof bounded without running hundreds of unrelated daily ticks.
    const second = await advanceEducation(2);
    assert.equal(second.advanced, 1, "year two must teach one Letters lesson");
    const third = await advanceEducation(3);
    assert.equal(third.advanced, 1, "year three must teach the second Letters lesson");
    await page.evaluate(async id => {
        const { state } = await import("./js/core/state.js");
        const { PERSON_SPECIES, ensurePersonProfile } = await import("./js/systems/people.js");
        const child = state.entities.find(entity => entity.personId === id);
        if (!child) throw new Error("the enrolled royal child is missing");
        const person = ensurePersonProfile(child);
        person.ageYears = Math.max(18, PERSON_SPECIES[person.species]?.maturation ?? 16);
        person.lifeStage = "adult";
    }, childId);
    const fourth = await advanceEducation(4);
    assert.deepEqual(fourth.ready, [student.id], "the finished, adult student must be ready for an audience");

    await openPanel("decisions");
    const readyText = await page.locator("#command-panel-content").textContent();
    assert.match(readyText, /READY · 3\/3 Y · 100%/, "the visible student row must show completed study");
    assert.match(readyText, /HOLD AUDIENCE/, "the audience button must be visible");
    assert.equal(await page.locator('[data-command="royal-education-audience"][data-value="' + student.id + '"]').count(), 1);

    await page.locator('[data-command="royal-education-audience"][data-value="' + student.id + '"]').click();
    await waitFor("the visible coming-of-age audience toast",
        () => /COMING-OF-AGE AUDIENCE · ROYAL CHANCELLOR/.test(document.querySelector("#action-toast")?.textContent || ""));
    const completed = await educationDossier();
    assert.equal(completed.students[0].stage, "completed");
    assert.equal(completed.students[0].office, "Royal Chancellor");
    assert.equal(completed.students[0].audienceYear, 4);
    assert.equal(completed.audienceCounter, 1);
    assert.ok(completed.history.some(row => row.kind === "audience"), "the audience must be recorded in education history");
    const finalText = await page.locator("#command-panel-content").textContent();
    assert.match(finalText, /ROYAL EDUCATION · TUTOR & TUTELAGE/);
    assert.match(finalText, /COMPLETED · 3\/3 Y · 100%/, "the visible student must be marked completed");
    assert.ok(finalText.includes("Royal Chancellor"), "the granted office must be visible");
    assert.match(finalText, /AUDIENCE/, "the education record must show the audience");

    const savedDto = await educationDossier();
    await page.locator("#command-close").click();
    await page.locator("#save-btn").click();
    await waitFor("the visible LAST SAVED status",
        () => (document.querySelector("#save-status")?.textContent || "").startsWith("LAST SAVED"), null, 20000);

    await page.reload({ waitUntil: "networkidle", timeout: 60000 });
    await page.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
    await waitFor("the enabled Continue button", () => {
        const button = document.querySelector("#continue-game-btn");
        return Boolean(button && !button.disabled && (button.textContent || "").includes("CONTINUE"));
    });
    await page.locator("#continue-game-btn").click();
    await waitFor("the load status after Continue", () => {
        const message = document.querySelector("#status-message")?.textContent || "";
        return message.includes("Loaded realm") || message.includes("Load failed");
    }, null, 20000);
    const loadStatus = (await page.locator("#status-message").innerText()).trim();
    assert.ok(loadStatus.includes("Loaded realm"), "the royal education realm must load; actual: " + loadStatus);
    const restoredDto = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.isPaused = true;
        return JSON.parse(JSON.stringify(state.royal.education));
    });
    assert.deepEqual(restoredDto, savedDto, "the education DTO must survive the real save/load exactly");

    await openPanel("decisions");
    const restoredText = await page.locator("#command-panel-content").textContent();
    assert.match(restoredText, /COMPLETED · 3\/3 Y · 100%/, "the loaded student must still be visible as completed");
    assert.ok(restoredText.includes("Royal Chancellor"), "the loaded office must still be visible");
    assert.deepEqual(await educationDossier(), savedDto, "reopening Decisions must not change the loaded dossier");

    assert.deepEqual(pageErrors, [], "the royal education proof must not raise page errors");
    assert.deepEqual(consoleErrors, [], "the royal education proof must not raise console errors");
    proof = {
        ok: true, seed: 20261128, consort: fixture.consortName, tutor: fixture.tutorName,
        childId, studentId: student.id, office: completed.students[0].office,
        audienceYear: completed.students[0].audienceYear, annual: [second, third, fourth],
        savedHistory: savedDto.history.length, loadStatus, pageErrors, consoleErrors
    };
    console.log(JSON.stringify(proof, null, 2));
} finally {
    await browser.close();
    if (server) await new Promise(done => server.close(done));
}
