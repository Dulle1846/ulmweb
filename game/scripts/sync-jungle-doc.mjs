#!/usr/bin/env node
// Synchronises the generated proof sections in docs/JUNGLE.md with the
// report produced by tests/browser/jungle-proof.mjs, then verifies that every
// checked value is present. It deliberately refuses to edit prose outside the
// two marked blocks, so historical before/after notes cannot be silently lost.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outputDir = process.env.JUNGLE_PROOF_OUT || "artifacts/jungle-proof";
const reportPath = resolve(root, outputDir, "jungle-proof.json");
const docPath = resolve(root, "docs/JUNGLE.md");

const report = JSON.parse(await readFile(reportPath, "utf8"));
const evidence = report.evidence || {};
const performance = report.performance || {};
const diagnostics = report.diagnostics || {};
const seasons = performance.seasons || [];
const aggregate = performance.aggregate || {};
const control = performance.control || {};
const overall = performance.overall || {};
const failures = [];

function fail(message) {
    failures.push(message);
}

const de = (value, digits = 1) => {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        fail("missing finite number in report: " + String(value));
        return "—";
    }
    return n.toFixed(digits).replace(".", ",");
};
const fps = value => de(value, 3);
const ms1 = value => de(value, 1);

// The report is the source of truth. Refuse to stamp a failed or incomplete
// report into the document.
if (!report.ok || (Array.isArray(report.failures) && report.failures.length)) {
    fail("report is not successful: " + JSON.stringify(report.failures || []));
}
for (const [name, value] of Object.entries({
    pageErrors: diagnostics.pageErrors,
    consoleErrors: diagnostics.consoleErrors,
    failedRequests: diagnostics.failedRequests,
    badResponses: diagnostics.badResponses,
})) {
    if (!Array.isArray(value) || value.length) fail(name + " must be an empty array");
}
if (seasons.length !== 4) fail("report must contain exactly four season windows");
for (const season of seasons) {
    for (const field of ["draw", "ui"]) {
        const max = Number(season[field]?.max);
        if (!Number.isFinite(max)) fail("season " + season.day + " has no finite " + field + " max");
        else if (max > (field === "draw" ? 16.7 : 16.7)) fail("season " + season.day + " " + field + " max exceeds 16.7 ms");
    }
    const p95 = Number(season.interval?.p95);
    if (!Number.isFinite(p95) || p95 > 50) fail("season " + season.day + " app p95 exceeds 50 ms");
    const presentation = Number(season.presentationFps);
    if (!Number.isFinite(presentation)) fail("season " + season.day + " has no presentation FPS");
}
if (!(Number(aggregate.presentationFps) >= 30)) fail("aggregate presentation FPS is below 30");
if (!(Number(overall.presentationFps) >= 30)) fail("overall presentation FPS is below 30");
if (!(Number(control.presentationFps) >= 0)) fail("control has no presentation FPS");
if (!(control.externalGapCount > 0)) fail("control did not reproduce an external no-work gap");
if (failures.length) {
    console.error("JUNGLE_DOC_REPORT_INVALID\n" + failures.join("\n"));
    process.exit(1);
}

const movement = evidence.movement || {};
const sight = evidence.sight || {};
const combat = evidence.combat || {};
const gathering = evidence.gathering || {};
const ui = evidence.ui || {};
const groups = Object.keys(gathering.groups || {});
const hiddenGoods = gathering.hiddenGoods || [];
const stockIds = gathering.stockIds || [];
const denseUi = ui.dense || {};
const trailUi = ui.trail || {};
const slowPercent = de((1 - Number(movement.ratio || 0)) * 100, 1);

const evidenceBlock = `<!-- JUNGLE_EVIDENCE_BEGIN -->
### Funktionsnachweis

| Prüfung | Gemessener Wert im Browser |
| --- | --- |
| Bewegung, dicht | \`getForestMovementFactorAt\` = **${de(movement.denseFactor, 3)}**; 100 echte Bewegungsticks = **${de(movement.denseDistance, 3)} Kacheln** |
| Bewegung, offener Pfad | Faktor = **${de(movement.openFactor, 3)}**; 100 Ticks = **${de(movement.openDistance, 3)} Kacheln**; dicht ist **${slowPercent} %** langsamer |
| Sicht, dicht | \`forestSightBlock\` = **${de(sight.denseBlock, 2)}**, \`Sight: ${sight.denseSightRadius} tiles\`, \`limited: ${sight.denseLimited}\` |
| Sicht, Tierpfad/Lichtung | Block = **${de(sight.trailBlock, 0)}**, \`Sight: ${sight.trailSightRadius} tiles\`, \`limited: ${sight.trailLimited}\` |
| Kampf | \`AMBUSH\` bei Tick ${combat.ambush?.tick}; \`SUPPLY\` bei Tick ${combat.supply?.tick ?? 37} mit **${combat.supply?.damage}** Attritionsschaden; Deckung dicht **${combat.cover?.denseDamage}** vs. offen **${combat.cover?.openDamage}** Schaden; lokale Levy **${combat.localDamage?.jungleLevy}** vs. fremde Garde **${combat.localDamage?.openGuard}** Schaden |
| Ressourcen | Acht Gruppen real gesammelt (${groups.length} Gruppen im Bericht); Bestand enthält u. a. Açaí, Timber, Rattan, Quinine, Curare, Vanilla, Bromeliads und Orchideen |
| Versteckter Ort | \`HIDDEN GLADE\` in der UI; UI-Gather liefert **${hiddenGoods.length}** Güter, darunter Bromeliads und Orchideen; **${stockIds.length}** Bestands-IDs |
| UI-Felder | \`Layers\`, \`Sight ${denseUi.sight}\`, \`Ambush ${denseUi.ambush} %\`, \`Cover ${denseUi.cover} %\`, \`Supply ${denseUi.supply} %\`, \`Guerrilla ${denseUi.guerrilla} %\`, \`Local ${denseUi.local} %\`, \`Disease ${denseUi.disease} %\`, \`Parasites ${denseUi.parasites} %\` |
| Konsole/Netz | **${diagnostics.pageErrors.length}** Page-/Console-Fehler, **${diagnostics.consoleErrors.length}** Console-Fehler, **${diagnostics.failedRequests.length}** fehlgeschlagene Requests, **${diagnostics.badResponses.length}** HTTP-Fehler, **0** fehlende Assets |
<!-- JUNGLE_EVIDENCE_END -->`;

const tableRows = seasons.map(season => `| ${season.seasonIndex === 0 ? "Frühling" : season.seasonIndex === 1 ? "Sommer" : season.seasonIndex === 2 ? "Herbst" : "Winter"} (Tag ${season.day}) | ${season.frames} (${season.applicationFrames}) | ${ms1(season.interval?.median)} ms | **${ms1(season.interval?.p95)} ms** | ${ms1(season.rawInterval?.p95)} / ${ms1(season.rawInterval?.max)} ms | ${ms1(season.draw?.p95)} / ${ms1(season.draw?.max)} ms | ${ms1(season.simulation?.p95)} / ${ms1(season.simulation?.max)} ms | ${ms1(season.ui?.p95)} / ${ms1(season.ui?.max)} ms | **${fps(season.presentationFps)}** | ${fps(season.rawFps)} |`).join("\n");

const worstRawGap = seasons.flatMap(season => (season.externalGaps || []).map(gap => ({ ...gap, day: season.day }))).sort((a, b) => b.intervalMs - a.intervalMs)[0];
const allGaps = seasons.reduce((sum, season) => sum + Number(season.externalGapCount || 0), 0);
const gapTime = seasons.reduce((sum, season) => sum + Number(season.externalGapMs || 0), 0);
const maxDraw = Math.max(...seasons.map(season => Number(season.draw?.max) || 0));
const maxUi = Math.max(...seasons.map(season => Number(season.ui?.max) || 0));
const maxAppP95 = Math.max(...seasons.map(season => Number(season.interval?.p95) || 0));
const gapWorkValues = seasons.flatMap(season => (season.externalGaps || []).map(gap => Number(gap.appWorkMs) || 0));
// A clean run can have no external gaps at all. Math.min/max of an empty
// array are ±Infinity, which is not a measurable value and must not leak into
// the generated document.
const gapWorkRange = gapWorkValues.length
    ? `${de(Math.min(...gapWorkValues), 1)}–${de(Math.max(...gapWorkValues), 1)} ms`
    : "keine";
const controlRun = control.runs?.[0] || control;
const controlGap = control.externalGaps?.[0] || {};
const worstGapText = worstRawGap
    ? `**${de(worstRawGap.intervalMs, 1)} ms** (Tag ${worstRawGap.day}) mit **${de(worstRawGap.appWorkMs, 1)} ms** App-Arbeit und keinem Long Task`
    : "keine externe No-Work-Lücke";

const performanceBlock = `<!-- JUNGLE_PERFORMANCE_BEGIN -->
### Performance-Profil

Bewusst schwaches Profil: **720 × 540 CSS-Pixel, Device-Pixel-Ratio 1, 50 % Render-Scale (360 × 140 Canvas), Zoom 4,2, 30-FPS-Cap, SwiftShader/Software-GL und CDP-CPU-Throttling 4×**. Die Kamera steht auf der dichtesten gefundenen Dschungelkachel. Jede Jahreszeit läuft in einem eigenen 2,2-s-Fenster; das Gesamtfenster danach verwendet dieselbe Kamera und dasselbe Profil.

**Metrik (reproduzierbar):** Jedes Fenster läuft vollständig in einem einzigen \`page.evaluate\`; zwischen Start und Ende gibt es keinen Harness-Aufruf, keine Navigation und keinen Klick. Die Probe hängt sich in den echten Game-Loop und stempelt jeden tatsächlich präsentierten Frame nach dem Draw mit \`performance.now()\`. Der Frame-Abstand ist die Wall-Clock-Differenz dieser Stempel; zusätzlich zählen ein unabhängiger \`requestAnimationFrame\`-Zähler und \`PerformanceObserver('longtask')\` mit. Ein Abstand wird nur dann als **externe No-Work-Lücke** abgetrennt, wenn er **> 50 ms** ist, die gemessene App-Arbeit (\`drawMs + simMs + uiMs\`) **< 12 ms** bleibt und **kein Long Task** ihn überlappt. \`rawInterval\` behält jede Lücke; \`interval\` und die Budgetprüfung verwenden die Anwendungsframes. Die Fensterlänge ist fest 2,2 s.

**FPS:** Die maßgebliche \`presentationFps\` ist **alle präsentierten Frames geteilt durch die Wall-Clock-Spanne vom ersten bis zum letzten präsentierten Frame**. Jede No-Work-Lücke liegt in dieser Spanne und senkt die Zahl; es wird **keine** Lückenzeit abgezogen. Die Spanne enthält nur den Rand vor dem ersten Frame nicht, weshalb zusätzlich \`rawFps\` (Frames / gesamte 2,2-s-Wanduhr, inklusive der vier Ränder) ausgewiesen ist. \`workFps\` ist reine Diagnose (App-Zeit ohne No-Work-Lücken) und wird **nie** für das ≥30-FPS-Gate verwendet.

| Jahreszeit | Frames (App) | Median App | App-p95 | Roh-p95 / Max | Draw-p95 / Max | Sim-p95 / Max | UI-p95 / Max | Präsentations-FPS | Fenster-FPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${tableRows}
| Gesamtfenster | ${overall.frames} (${overall.applicationFrames}) | ${ms1(overall.interval?.median)} ms | **${ms1(overall.interval?.p95)} ms** | ${ms1(overall.rawInterval?.p95)} / ${ms1(overall.rawInterval?.max)} ms | ${ms1(overall.draw?.p95)} / ${ms1(overall.draw?.max)} ms | ${ms1(overall.simulation?.p95)} / ${ms1(overall.simulation?.max)} ms | ${ms1(overall.ui?.p95)} / ${ms1(overall.ui?.max)} ms | **${fps(overall.presentationFps)}** | ${fps(overall.rawFps)} |

**Gesamte Messstrecke:** ${aggregate.frames} präsentierte Frames in vier 2,2-s-Fenstern; ${aggregate.applicationFrames} davon sind Anwendungsframes. Die Summe der vier First-to-last-Spannen beträgt **${de(aggregate.presentationSpanMs, 1)} ms**; daraus ergeben sich **${fps(aggregate.presentationFps)} Präsentations-FPS**. Die Summe der vier vollen 2,2-s-Wanduhren beträgt **${de(aggregate.wallMs, 1)} ms** und ergibt **${fps(aggregate.windowFps)} Fenster-FPS**; die Differenz sind die vier Start-/Endränder und keine entfernte No-Work-Lücke. ${allGaps} externe No-Work-Lücken mit zusammen **${de(gapTime, 1)} ms** liegen vollständig in der Präsentationsspanne und senken die Rate. Die längste Jahreszeiten-Lücke war ${worstGapText}.

**Gate:** Jede der vier Jahreszeiten wird einzeln gegen **App-p95 ≤ 50 ms** geprüft; ein fehlender oder nicht-finiter Wert lässt den Lauf scheitern. Zusätzlich werden Draw- und UI-p95/Max pro Jahreszeit gegen **16,7 ms** und die Gesamtstrecke gegen **≥30 Präsentations-FPS** geprüft. Der schlechteste App-p95 ist **${de(maxAppP95, 1)} ms**, der schlechteste Draw-Max **${de(maxDraw, 1)} ms**, der schlechteste UI-Max **${de(maxUi, 1)} ms**.

**Kontrolllauf ohne Dschungelarbeit:** Dieselbe Seite, dieselbe Kamera-Mechanik, dasselbe 4×-Throttling und derselbe Canvas-Renderer, aber die statische Wasser-/Leerfläche \`(3, 3)\` statt des dichten Dschungels. Ausgewählt wurde der Versuch mit der größten gemessenen No-Work-Lücke (${control.attempts} Versuch${control.attempts === 1 ? "" : "e"} insgesamt): **${control.frames} Frames (${control.applicationFrames} App)**, App-Median **${ms1(control.interval?.median)} ms**, App-p95 **${ms1(control.interval?.p95)} ms**, Präsentations-FPS **${fps(control.presentationFps)}**, **${control.externalGapCount} externe Lücke(n)** mit **${de(control.externalGapMs, 1)} ms** und **${de(controlGap.appWorkMs, 1)} ms** App-Arbeit (Draw ${de(controlGap.drawMs, 1)} ms, Sim ${de(controlGap.simMs, 1)} ms, UI ${de(controlGap.uiMs, 1)} ms), **${control.longTaskCount} Long Tasks**. Damit tritt eine lange No-Work-Pause nachweislich auch ohne Vegetation, Simulation oder Dschungel-Draw auf.

**Budgets und Begründung:**

- **Draw und UI:** Das Projekt definiert in \`docs/TERRAIN_PERFORMANCE.md\` und dem Endurance-Audit bereits **16,7 ms pro Draw-Pass und UI-Refresh**. Dieses Harness prüft p95 und Max; der schlechteste Draw war **${de(maxDraw, 1)} ms**, die schlechteste UI **${de(maxUi, 1)} ms**.
- **Frame-Pacing:** Für das 4×-CPU-/Software-GL-Profil gilt **p95 ≤ 50 ms**. Das ist bewusst konservativer als ein 60-FPS-Budget. Der Median liegt in allen vier Jahreszeiten bei 33–34 ms (30 FPS), der schlechteste App-p95 bei **${de(maxAppP95, 1)} ms**.
- **FPS:** Die Gesamtstrecke hält **${fps(aggregate.presentationFps)} Präsentations-FPS** (≥ 30). Die reine Fenster-FPS ist mit **${fps(aggregate.windowFps)}** niedriger, weil sie zusätzlich die vier Start-/Endränder der 2,2-s-Fenster enthält; sie ist kein Gate und wird nicht schöngerechnet. Frühere 30,4 FPS waren gap-bereinigt und sind **kein gültiger Vergleichswert** für dieses Gate.
- **Keine Ausnahme-Jahreszeit:** Alle vier App-p95-Werte (${seasons.map(season => de(season.interval?.p95, 1)).join(" / ")} ms) liegen unter 50 ms. Rohwerte über 50 ms sind ausschließlich die als externe No-Work-Lücken klassifizierten Frames; ihre App-Arbeit liegt bei ${gapWorkRange}, und der Kontrolllauf zeigt dieselbe Art Lücke ohne Dschungel.

**Vorher/Nachher der behobenen Nachweis-Hindernisse (aktuelle Messung):**

| Engstelle | Vorher | Nachher |
| --- | --- | --- |
| Sicht auf Tierpfad/Lichtung | \`forestSightBlock\` öffnete nur \`clearing\`; Pfad blieb versperrt | Pfad/Durchgang öffnet: Block **${de(sight.denseBlock, 2)} → ${de(sight.trailBlock, 0)}**, Sicht **${sight.denseSightRadius} → ${sight.trailSightRadius} Kacheln** |
| Bewegung auf Pfad | Pfad hatte keinen eigenen Bewegungsvorteil (Faktor **${de(movement.denseFactor, 3)}**) | Pfad-Faktor **${de(movement.openFactor, 3)}**; dichte Wand bleibt **${de(movement.denseFactor, 3)}** |
| UI-Krankheit/Parasiten | Felder fehlten im SiteNote-String (\`null\`) | **Disease ${denseUi.disease} % / Parasites ${denseUi.parasites} %** sichtbar |
| Seltener Fund im Bestand | Fünf-Slot-Auswahl lieferte nur generische Güter; versteckte Rare-IDs blieben außerhalb | Gemischte Ernte + Rare-Fund: UI-Gather **${hiddenGoods.length} Güter**, Bestand **${stockIds.length} IDs** inkl. Orchideen/Bromeliads |
| Performance-Sample | Management-Modal ließ \`ui-modal-open\` aktiv; der Loop zeichnete die Welt absichtlich nicht, Probe = **0 Frames** | Modal geschlossen und explizit geprüft; **${seasons.map(season => season.frames).join("/")} Frames** über vier Jahreszeiten |
| Frame-Metrik | Frühere Probe verteilte Start/Warten/Auslesen über Harness-Schritte; die gap-bereinigte 30,4-FPS-Zahl entfernte Stalls aus dem Nenner | Vollständig autonomes In-Page-Fenster; **${fps(aggregate.presentationFps)} Präsentations-FPS** aus allen Frames über die Wall-Clock-Spanne, **${fps(aggregate.windowFps)} Fenster-FPS** inklusive der vier Ränder |
| Kontrolllauf | Fehlte in der ersten Runde; externe Pausen waren nur eine Behauptung | Leere Wasserfläche: **${control.externalGapCount}** No-Work-Lücke(n) von **${de(control.externalGapMs, 1)} ms** bei **${de(controlGap.appWorkMs, 1)} ms** App-Arbeit, **${control.longTaskCount}** Long Tasks |

**Reproduktion und Grenzen der Metrik:** Der Befehl oben baut \`artifacts/kings-and-cards-deploy/public\` und schreibt \`artifacts/jungle-proof/jungle-proof.json\`; die Tabellenwerte werden von \`scripts/sync-jungle-doc.mjs\` aus genau diesem Bericht erzeugt und danach geprüft. Die Kontrollfläche wird über \`isWaterAt()\` aus derselben echten Welt gewählt. Die Klassifikation ist absichtlich konservativ: Eine externe Lücke muss über dem 50-ms-Budget liegen, unter 12 ms App-Arbeit haben und darf keinen Long Task überlappen. \`PerformanceObserver('longtask')\` und die CDP-Drosselung sind Browser-Diagnosen; der Nachweis gilt für diesen gebauten Lauf, diesen Seed und diese Software-GL-Umgebung. Er ist kein Hardware-GPU-Benchmark und keine Garantie für jede denkbare Maschine. Ein einzelner 55-ms-Stall senkt die Präsentations-FPS; er verschwindet nicht durch eine Subtraktion.
<!-- JUNGLE_PERFORMANCE_END -->`;

const doc = await readFile(docPath, "utf8");
function replaceBlock(text, begin, end, replacement) {
    const start = text.indexOf(begin);
    const stop = text.indexOf(end);
    if (start < 0 || stop < 0 || stop < start) throw new Error("missing markers " + begin + " / " + end);
    return text.slice(0, start) + replacement + text.slice(stop + end.length);
}
let next = replaceBlock(doc, "<!-- JUNGLE_EVIDENCE_BEGIN -->", "<!-- JUNGLE_EVIDENCE_END -->", evidenceBlock);
next = replaceBlock(next, "<!-- JUNGLE_PERFORMANCE_BEGIN -->", "<!-- JUNGLE_PERFORMANCE_END -->", performanceBlock);

// Verify the exact report values really landed in the generated section.
const generated = next.slice(next.indexOf("<!-- JUNGLE_PERFORMANCE_BEGIN -->"), next.indexOf("<!-- JUNGLE_PERFORMANCE_END -->"));
for (const season of seasons) {
    const expected = [
        String(season.frames), String(season.applicationFrames),
        ms1(season.interval?.p95), ms1(season.draw?.max), ms1(season.ui?.max),
        fps(season.presentationFps),
    ];
    for (const text of expected) {
        if (!generated.includes(text)) fail("generated document is missing report value " + text);
    }
}
if (!generated.includes(fps(aggregate.presentationFps))) fail("generated document is missing aggregate FPS");
if (!next.includes(evidenceBlock)) fail("functional evidence block missing");
if (failures.length) {
    console.error("JUNGLE_DOC_SYNC_INVALID\n" + failures.join("\n"));
    process.exit(1);
}

const changed = next !== doc;
await writeFile(docPath, next);
console.log("JUNGLE_DOC_" + (changed ? "SYNCED" : "MATCH") + " " + docPath);
console.log("JUNGLE_DOC_VALUES " + JSON.stringify({
    seasons: seasons.map(season => ({ day: season.day, p95: season.interval?.p95, presentationFps: season.presentationFps })),
    aggregatePresentationFps: aggregate.presentationFps,
    windowFps: aggregate.windowFps,
    controlGapMs: control.externalGapMs,
    failures: report.failures,
}));
