// Mature-state panel audit for the long player journeys. This is a presentation
// audit, not a second simulation: every expectation below is read from the same
// snapshots the panels use, then compared with what the player can actually see.
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export const PANEL_TITLES = Object.freeze({
    kingdom: "Kingdom overview",
    population: "People, households & livelihoods",
    diplomacy: "Diplomacy",
    worldmap: "Kingdoms, provinces, trade routes & frontiers",
    explore: "Royal expeditions",
    cards: "Card management",
    economy: "Realm economy",
    resources: "Resource detail",
    buildings: "Building register",
    military: "Barracks & stables",
    health: "Sanitation, healers & medicine",
    faith: "Faith & culture",
    justice: "Justice & order",
    research: "Research & knowledge",
    chronicle: "Chronicle & event inbox"
});

const PATH_TABS = Object.freeze({
    warlord: ["military", "diplomacy", "kingdom", "population"],
    diplomat: ["diplomacy", "worldmap", "kingdom", "population"],
    merchant: ["economy", "resources", "buildings", "worldmap"],
    scholar: ["research", "explore", "population", "kingdom"]
});
const COMMON_TABS = Object.freeze(["chronicle", "cards", "justice", "faith", "health"]);
const VIEWPORTS = Object.freeze([
    { label: "1400", width: 1400, height: 960 },
    { label: "390", width: 390, height: 844 }
]);

const normalize = value => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const numeric = value => {
    const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
};
const close = (left, right, tolerance = 0.11) => Number.isFinite(Number(left)) && Number.isFinite(Number(right)) && Math.abs(Number(left) - Number(right)) <= tolerance;
const withCommas = value => String(Math.floor(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

async function readAuditSnapshot(page) {
    return page.evaluate(async () => {
        const [
            { state }, { getMilitarySnapshot }, { getDiplomacySnapshot }, { getWorldMapSnapshot },
            { getExpeditionSnapshot }, { getFaithSnapshot }, { getJusticeSnapshot }, { getHealthSnapshot },
            { getResearchSnapshot }, { getHousingSnapshot }, { getLogisticsSnapshot },
            { getEconomyCycleSnapshot }, { getCrownSupplySnapshot }, { getPopulationSnapshot }
        ] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/military.js"),
            import("./js/systems/diplomacy.js"),
            import("./js/systems/world-map.js"),
            import("./js/systems/expeditions.js"),
            import("./js/systems/faith.js"),
            import("./js/systems/justice.js"),
            import("./js/systems/health.js"),
            import("./js/systems/research.js"),
            import("./js/systems/population.js"),
            import("./js/systems/logistics.js"),
            import("./js/systems/economy-cycle.js"),
            import("./js/systems/crown-supply.js"),
            import("./js/systems/population-register.js")
        ]);
        const military = getMilitarySnapshot();
        const diplomacy = getDiplomacySnapshot();
        const world = getWorldMapSnapshot();
        const expeditions = getExpeditionSnapshot();
        const faith = getFaithSnapshot();
        const justice = getJusticeSnapshot();
        const health = getHealthSnapshot();
        const research = getResearchSnapshot();
        const housing = getHousingSnapshot();
        const populationRegister = getPopulationSnapshot();
        const logistics = getLogisticsSnapshot();
        const cycle = getEconomyCycleSnapshot();
        const crownSupply = getCrownSupplySnapshot();
        const timeline = state.eventTimeline && typeof state.eventTimeline === "object" ? state.eventTimeline : {};
        const timelineEvents = Array.isArray(timeline.events) ? timeline.events : [];
        const currentYear = Math.max(1, Math.floor(Number(state.year) || 1));
        const currentEvents = timelineEvents.filter(event => Number(event.year) === currentYear);
        const resources = {};
        for (const [key, value] of Object.entries(state.resources || {})) {
            resources[key] = Math.round((Number(value) || 0) * 10) / 10;
        }
        const ledger = state.economy?.lastLedger && typeof state.economy.lastLedger === "object"
            ? {
                foodDemand: state.economy.lastLedger.foodDemand,
                foodConsumed: state.economy.lastLedger.foodConsumed,
                foodShortage: state.economy.lastLedger.foodShortage,
                foodBalance: state.economy.lastLedger.foodBalance,
                foodSpoiled: state.economy.lastLedger.foodSpoiled,
                taxesCollected: state.economy.lastLedger.taxesCollected,
                wagesPaid: state.economy.lastLedger.wagesPaid,
                upkeepPaid: state.economy.lastLedger.upkeepPaid,
                furnitureUpkeepPaid: state.economy.lastLedger.furnitureUpkeepPaid,
                unpaidWages: state.economy.lastLedger.unpaidWages,
                unpaidUpkeep: state.economy.lastLedger.unpaidUpkeep,
                unpaidFurniture: state.economy.lastLedger.unpaidFurniture,
                debt: state.economy.lastLedger.debt,
                debtInterest: state.economy.lastLedger.debtInterest,
                netGold: state.economy.lastLedger.netGold
            }
            : null;
        return {
            year: Math.floor(Number(state.year) || 0),
            tick: Math.floor(Number(state.tick) || 0),
            morale: Math.round(Number(state.morale) || 0),
            population: housing.population,
            registeredPopulation: populationRegister.population,
            housing: housing.capacity,
            resources,
            military: {
                soldiers: military.soldiers.length,
                capacity: military.capacity,
                readiness: military.readiness,
                averageMorale: military.averageMorale,
                averageEquipment: military.averageEquipment,
                barracks: military.barracks,
                stables: military.stables,
                horses: military.horses,
                assignedHorses: military.assignedHorses,
                horseCapacity: military.horseCapacity,
                history: military.history.length,
                recentHistory: (military.history || []).slice(0, 6).map(entry => ({ year: entry.year, soldiers: entry.soldiers, goldPaid: entry.goldPaid, foodPaid: entry.foodPaid, desertions: entry.desertions })),
                lastPayroll: military.lastPayroll ? {
                    year: military.lastPayroll.year,
                    soldiers: military.lastPayroll.soldiers,
                    goldPaid: military.lastPayroll.goldPaid,
                    goldNeed: military.lastPayroll.goldNeed,
                    foodPaid: military.lastPayroll.foodPaid,
                    foodNeed: military.lastPayroll.foodNeed,
                    desertions: military.lastPayroll.desertions
                } : null
            },
            diplomacy: {
                realms: diplomacy.realms.map(realm => ({
                    id: realm.id,
                    name: realm.name,
                    treaty: realm.treaty,
                    relation: realm.relation,
                    trust: realm.trust,
                    envoyId: realm.envoyId || null,
                    guaranteeActive: Boolean(realm.guarantee?.active),
                    tradeAgreementActive: Boolean(realm.tradeAgreement?.active)
                })),
                counts: { ...diplomacy.counts },
                envoys: diplomacy.envoys,
                averageRelation: diplomacy.averageRelation,
                guarantees: { ...diplomacy.guarantees },
                tradeAgreements: { ...diplomacy.tradeAgreements }
            },
            world: {
                seats: world.seats.map(seat => ({ id: seat.id, name: seat.name })),
                realms: world.realms.map(realm => ({ id: realm.id, name: realm.name, watch: realm.watch, pressure: realm.pressure, treaty: realm.treaty, routes: realm.routes, activeRoutes: realm.activeRoutes, routeDelivered: realm.routeDelivered })),
                routes: world.routes.map(route => ({ id: route.id, realmId: route.realmId, resource: route.resource, direction: route.direction, delivered: route.delivered, earned: route.earned, status: route.status })),
                totals: { ...world.totals },
                limits: { ...world.limits }
            },
            exploration: {
                sites: expeditions.sites.length,
                known: expeditions.stats.known,
                cleared: expeditions.stats.cleared,
                completed: expeditions.stats.completed,
                discoveries: expeditions.stats.discoveries,
                history: expeditions.history.length,
                active: expeditions.active ? {
                    leaderName: expeditions.active.leaderName,
                    siteName: expeditions.active.siteName,
                    remainingDays: expeditions.active.remainingDays,
                    progress: expeditions.active.progress
                } : null
            },
            faith: {
                clergy: faith.clergy.length,
                capacity: faith.capacity,
                congregation: faith.modifiers.congregation,
                population: faith.modifiers.population,
                temples: faith.modifiers.temples,
                shrines: faith.modifiers.shrines,
                coverage: faith.modifiers.coverage,
                cultureBudget: faith.cultureBudget,
                budgetLabel: faith.budget.label,
                canHoldFestival: faith.canHoldFestival
            },
            justice: {
                judges: justice.judges.length,
                capacity: justice.capacity,
                courts: justice.modifiers.courts,
                prisons: justice.modifiers.prisons,
                crimeRate: Math.round(justice.crime.rate * 100),
                pendingCases: justice.pendingCases.length,
                lawLabel: justice.modifiers.lawLabel,
                charters: justice.charters.length
            },
            health: {
                sick: health.sick,
                healers: health.healers.length,
                capacity: health.healerCapacity,
                sanitation: health.sanitation,
                waterCoverage: health.waterCoverage,
                immunityAverage: health.immunityAverage,
                healerCoverage: health.healerCoverage,
                medicineStock: health.medicineStock,
                active: health.active,
                disease: health.disease,
                quarantineLevel: health.quarantineLevel,
                tradePenalty: Math.round(health.tradePenalty * 100)
            },
            research: {
                completed: research.modifiers.completedCount,
                active: research.activeTechDetails ? research.activeTechDetails.label : null,
                scholars: research.scholars.length,
                capacity: research.capacity,
                funding: research.funding,
                fundingLabel: research.fundingDetails.label,
                pointsPerYear: research.pointsPerYear,
                states: Object.fromEntries(research.techs.map(tech => [tech.id, expectedStatus(tech)]))
            },
            cards: {
                hand: (state.hand || []).length,
                drawPile: (state.availableCards || []).length,
                queued: (state.cardRewardQueue || []).length
            },
            chronicle: {
                retained: timelineEvents.length,
                generated: Math.max(0, Math.floor(Number(timeline.totalGenerated) || timelineEvents.length)),
                currentYear,
                currentEvents: currentEvents.length,
                currentNamed: currentEvents.filter(event => Array.isArray(event.participants) && event.participants.length > 0).length
            },
            logistics: {
                carriers: logistics.carriers.length,
                activeJobs: logistics.jobs.length,
                counts: { ...logistics.counts },
                lastRejection: logistics.lastRejection || null
            },
            economy: {
                balance: cycle.balance,
                storageCapacity: cycle.storageCapacity,
                debt: cycle.debt,
                crisis: Math.round(cycle.crisis.severity * 100),
                ledger
            },
            crownSupply: {
                grainLevel: crownSupply.grainLevel,
                waterworksLevel: crownSupply.waterworksLevel,
                reserveYears: crownSupply.reserveYears,
                waterworksCoverage: Math.round(crownSupply.waterworksCoverage * 100),
                timberCottages: crownSupply.timberCottages,
                stoneHouses: crownSupply.stoneHouses
            }
        };

        function expectedStatus(tech) {
            return tech.status || "locked";
        }
    });
}

async function waitForPanel(page, tab, snapshot) {
    const title = PANEL_TITLES[tab];
    await page.waitForFunction(({ tab, title, expected }) => {
        const content = document.querySelector("#command-panel-content");
        if (!content) return false;
        const actual = content.querySelector(".command-panel-intro h3")?.textContent?.trim() || "";
        if (actual !== title) return false;
        if (tab === "chronicle") {
            const root = content.querySelector(".living-timeline");
            if (!root) return false;
            const visible = Number(root.dataset.timelineVisible) || 0;
            const rendered = Number(root.dataset.timelineRendered) || 0;
            return rendered >= Math.min(160, visible);
        }
        if (tab === "explore") return content.querySelectorAll(".expedition-site").length >= expected.expeditionSites;
        if (tab === "worldmap") {
            return content.querySelectorAll(".world-frontier").length >= expected.frontiers &&
                content.querySelectorAll(".world-map__realm").length >= expected.frontiers &&
                content.querySelectorAll(".world-route").length >= expected.routes &&
                content.querySelectorAll(".world-watch__step.is-current").length >= expected.frontiers;
        }
        if (tab === "military") return content.querySelectorAll(".military-soldier").length >= expected.soldiers && Boolean(content.querySelector(".military-roster"));
        if (tab === "diplomacy") return content.querySelectorAll(".diplomacy-realm").length >= expected.realms;
        if (tab === "research") return content.querySelectorAll("[data-research-tech]").length >= expected.techs;
        if (tab === "justice") return content.querySelectorAll("[data-justice-case]").length >= expected.justiceCases;
        if (tab === "cards") return content.querySelectorAll(".command-card").length >= expected.cards && (content.textContent || "").trim().length > 150;
        return (content.textContent || "").trim().length > 400;
    }, {
        tab, title,
        expected: {
            expeditionSites: snapshot.exploration.sites,
            frontiers: snapshot.world.realms.length,
            routes: snapshot.world.routes.length,
            soldiers: snapshot.military.soldiers,
            realms: snapshot.diplomacy.realms.length,
            techs: Object.keys(snapshot.research.states).length,
            justiceCases: snapshot.justice.pendingCases,
            cards: snapshot.cards.hand
        }
    }, { timeout: 12000 });
    await page.waitForTimeout(200);
}

async function readPanelDom(page) {
    return page.evaluate(() => {
        const content = document.querySelector("#command-panel-content");
        if (!content) return { missing: true };
        const text = content.innerText || "";
        const rect = content.getBoundingClientRect();
        const summaries = {};
        for (const row of content.querySelectorAll(".command-summary > div")) {
            const label = row.querySelector("small")?.textContent?.trim();
            const value = row.querySelector("strong")?.textContent?.trim();
            if (label && value !== undefined && !(label in summaries)) summaries[label] = value;
        }
        for (const row of content.querySelectorAll(".timeline-summary > span")) {
            const label = row.querySelector("small")?.textContent?.trim();
            const value = row.querySelector("strong")?.textContent?.trim();
            if (label && value !== undefined && !(label in summaries)) summaries[label] = value;
        }
        const resources = {};
        for (const row of content.querySelectorAll(".command-resource")) {
            const label = row.querySelector("span")?.textContent?.trim();
            const value = row.querySelector("strong")?.textContent?.trim();
            if (label && value !== undefined && !label.includes("this tick")) resources[label] = value;
        }
        const ledger = {};
        for (const row of content.querySelectorAll(".ledger-row")) {
            const label = row.querySelector("span")?.textContent?.trim();
            const value = row.querySelector("strong")?.textContent?.trim();
            if (label && value !== undefined) ledger[label] = value;
        }
        const realmCards = [...content.querySelectorAll(".diplomacy-realm")].map(card => ({
            name: card.querySelector("h4")?.textContent?.trim() || "",
            text: card.innerText || ""
        }));
        const frontierCards = [...content.querySelectorAll(".world-frontier")].map(card => ({
            name: card.querySelector("h4")?.textContent?.trim() || "",
            text: card.innerText || ""
        }));
        const techStatuses = {};
        for (const tech of content.querySelectorAll("[data-research-tech]")) {
            techStatuses[tech.dataset.researchTech] = tech.dataset.researchStatus;
        }
        const currentBudget = content.querySelector('[data-command="faith-budget"].is-current strong')?.textContent?.trim() || null;
        const count = selector => content.querySelectorAll(selector).length;
        const ids = [...content.querySelectorAll("[id]")].map(element => element.id);
        const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
        const emptyButtons = [...content.querySelectorAll("button")].filter(button =>
            !(button.textContent || "").trim() && !button.getAttribute("aria-label")
        ).length;
        const clipped = [];
        const seen = new Set();
        const targets = content.querySelectorAll([
            ".command-panel-intro", ".command-section-title", ".command-note", ".command-summary > div",
            ".command-resource", ".ledger-row", ".command-inline", ".command-actions > button",
            ".diplomacy-realm", ".world-frontier", ".world-route", ".expedition-site", ".command-policy",
            ".court-office", ".health-healer", ".command-card", ".timeline-event-card", ".timeline-detail",
            "select", "input", "button"
        ].join(","));
        for (const element of targets) {
            if (seen.has(element)) continue;
            seen.add(element);
            const style = getComputedStyle(element);
            const box = element.getBoundingClientRect();
            if (!box.width || !box.height || style.display === "none" || style.visibility === "hidden") continue;
            if (element.closest("[aria-hidden=\"true\"]")) continue;
            if (element.closest(".world-map__canvas, .command-trend, .transition-atlas, .vegetation-survey")) continue;
            const lineClamped = style.webkitLineClamp && style.webkitLineClamp !== "none";
            const overflowsPanel = box.right > rect.right + 2 || box.left < rect.left - 2;
            const clipsOwnText = element.scrollWidth > element.clientWidth + 2 &&
                (style.overflowX === "hidden" || style.overflowX === "clip") && !lineClamped;
            if (!overflowsPanel && !clipsOwnText) continue;
            clipped.push({
                tag: element.tagName,
                cls: String(element.className || "").slice(0, 80),
                text: (element.innerText || "").trim().replace(/\s+/g, " ").slice(0, 90),
                overflowsPanel,
                clipsOwnText
            });
            if (clipped.length >= 10) break;
        }
        return {
            title: content.querySelector(".command-panel-intro h3")?.textContent?.trim() || "",
            text,
            textLength: text.trim().length,
            pageOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
            panelOverflow: Math.max(0, content.scrollWidth - content.clientWidth),
            panelScrollHeight: content.scrollHeight,
            panelClientHeight: content.clientHeight,
            panelScrollTop: content.scrollTop,
            summaries,
            resources,
            ledger,
            realmCards,
            frontierCards,
            techStatuses,
            currentBudget,
            counts: {
                soldiers: count(".military-soldier"),
                historyRows: count(".military-history > div"),
                diplomacyRealms: count(".diplomacy-realm"),
                diplomacyWar: count(".diplomacy-treaty--war"),
                diplomacyAlliance: count(".diplomacy-treaty--alliance"),
                diplomacyTrade: count(".diplomacy-treaty--trade"),
                diplomacyNeutral: count(".diplomacy-treaty--neutral"),
                worldRoutes: count(".world-route"),
                worldSeats: count(".world-map__seat"),
                worldFrontiers: count(".world-frontier"),
                worldMapRealms: count(".world-map__realm"),
                worldCurrentWatches: count(".world-watch__step.is-current"),
                expeditionSites: count(".expedition-site"),
                expeditionHistory: count("[data-expedition-history]"),
                cardRows: count(".command-card"),
                judgeRows: count("[data-justice-judge]"),
                clergyRows: count("[data-faith-clergy]"),
                healerRows: count(".health-healer"),
                researchTechs: count("[data-research-tech]"),
                justiceCases: count("[data-justice-case]"),
                timelineCards: count("[data-timeline-event]"),
                timelineRoot: Number(content.querySelector(".living-timeline")?.dataset.timelineRoot) || 0,
                timelineVisible: Number(content.querySelector(".living-timeline")?.dataset.timelineVisible) || 0,
                timelineRendered: Number(content.querySelector(".living-timeline")?.dataset.timelineRendered) || 0
            },
            duplicateIds,
            emptyButtons,
            clipped
        };
    });
}

function checkSnapshot(snapshot, dom, tab, width, findings) {
    const fail = (kind, detail) => findings.push({ tab, width, kind, detail });
    const summary = label => dom.summaries[label];
    const expectSummary = (label, expected, tolerance = 0.11) => {
        const actual = summary(label);
        if (actual === undefined) return fail("missing-summary", label);
        if (typeof expected === "number") {
            if (!close(numeric(actual), expected, tolerance)) fail("summary-mismatch", `${label}: displayed "${actual}", expected ${expected}`);
        } else if (normalize(actual).toLowerCase() !== normalize(expected).toLowerCase()) {
            fail("summary-mismatch", `${label}: displayed "${actual}", expected "${expected}"`);
        }
    };
    const expectText = needle => {
        if (!normalize(dom.text).toLowerCase().includes(normalize(needle).toLowerCase())) {
            fail("missing-text", String(needle));
        }
    };
    const expectCount = (label, actual, expected) => {
        if (Number(actual) !== Number(expected)) fail("count-mismatch", `${label}: displayed ${actual}, expected ${expected}`);
    };

    if (dom.title !== PANEL_TITLES[tab]) fail("title-mismatch", `displayed "${dom.title}"`);
    if (dom.textLength < 200) fail("empty-panel", `only ${dom.textLength} characters`);
    if (/\b(?:undefined|NaN|Infinity)\b|\[object Object\]/.test(dom.text)) fail("placeholder-text", "panel contains an undefined or non-finite value");
    if (dom.pageOverflow > 1) fail("page-overflow", `${dom.pageOverflow}px beyond the viewport`);
    if (dom.panelOverflow > 1) fail("panel-overflow", `${dom.panelOverflow}px inside the panel`);
    if (dom.clipped.length) fail("clipped-content", JSON.stringify(dom.clipped));
    if (dom.duplicateIds.length) fail("duplicate-ids", dom.duplicateIds.join(", "));
    if (dom.emptyButtons) fail("empty-buttons", `${dom.emptyButtons} button(s) without a label`);
    if (dom.counts.timelineVisible > 0 && dom.counts.timelineCards !== Math.min(160, dom.counts.timelineVisible) && tab === "chronicle") {
        fail("timeline-not-hydrated", `${dom.counts.timelineCards} cards for ${dom.counts.timelineVisible} visible events`);
    }

    if (tab === "military") {
        expectCount("soldiers", dom.counts.soldiers, snapshot.military.soldiers);
        expectCount("muster rows", dom.counts.historyRows, Math.min(6, snapshot.military.history));
        expectSummary("GARRISON", `${snapshot.military.soldiers} / ${snapshot.military.capacity}`);
        expectSummary("READINESS", `${snapshot.military.readiness} / 100`);
        expectSummary("MORALE", `${snapshot.military.averageMorale} / 100`);
        expectSummary("EQUIPMENT", `${snapshot.military.averageEquipment} / 100`);
        expectSummary("STABLE CAPACITY", `${Number(snapshot.military.assignedHorses) + Number(snapshot.military.horses)} / ${snapshot.military.horseCapacity}`);
        if (snapshot.military.lastPayroll) {
            expectText(`YEAR ${snapshot.military.lastPayroll.year} MUSTER`);
            expectText(`${snapshot.military.lastPayroll.soldiers} soldiers`);
        } else {
            expectText("The first annual muster has not yet been settled.");
        }
    }

    if (tab === "diplomacy") {
        expectCount("diplomacy realms", dom.counts.diplomacyRealms, snapshot.diplomacy.realms.length);
        expectCount("war treaties", dom.counts.diplomacyWar, snapshot.diplomacy.counts.war);
        expectCount("trade pacts", dom.counts.diplomacyTrade, snapshot.diplomacy.counts.trade);
        expectCount("alliances", dom.counts.diplomacyAlliance, snapshot.diplomacy.counts.alliance);
        expectCount("neutral courts", dom.counts.diplomacyNeutral, snapshot.diplomacy.counts.none);
        expectSummary("NEIGHBOURS", snapshot.diplomacy.realms.length);
        expectSummary("AVG RELATION", snapshot.diplomacy.averageRelation);
        expectSummary("TRADE PACTS", snapshot.diplomacy.counts.trade);
        expectSummary("ALLIANCES", snapshot.diplomacy.counts.alliance);
        expectSummary("ENVOYS", snapshot.diplomacy.envoys);
        expectSummary("AT WAR", snapshot.diplomacy.counts.war);
        expectSummary("GUARANTEES", snapshot.diplomacy.guarantees.active);
        expectSummary("TRADE ACCORDS", snapshot.diplomacy.tradeAgreements.active);
        for (const realm of snapshot.diplomacy.realms) {
            const card = dom.realmCards.find(item => normalize(item.name) === normalize(realm.name));
            if (!card) {
                fail("missing-realm", realm.name);
                continue;
            }
            const relation = numeric((card.text.match(/RELATION\s+(-?\d+(?:\.\d+)?)/) || [])[1]);
            const trust = numeric((card.text.match(/TRUST\s+(-?\d+(?:\.\d+)?)/) || [])[1]);
            if (!close(relation, realm.relation)) fail("realm-relation-mismatch", `${realm.name}: displayed ${relation}, expected ${realm.relation}`);
            if (!close(trust, realm.trust)) fail("realm-trust-mismatch", `${realm.name}: displayed ${trust}, expected ${realm.trust}`);
        }
    }

    if (tab === "worldmap") {
        expectCount("standing routes", dom.counts.worldRoutes, snapshot.world.routes.length);
        expectCount("seats", dom.counts.worldSeats, snapshot.world.seats.length);
        expectCount("frontiers", dom.counts.worldFrontiers, snapshot.world.realms.length);
        expectCount("map realms", dom.counts.worldMapRealms, snapshot.world.realms.length);
        expectCount("current watches", dom.counts.worldCurrentWatches, snapshot.world.realms.length);
        expectSummary("SEATS", snapshot.world.seats.length);
        expectSummary("STANDING ROUTES", `${snapshot.world.routes.length} / ${snapshot.world.limits.routes}`);
        expectSummary("GOODS MOVED", snapshot.world.totals.delivered);
        expectSummary("TRADE EARNED", `${snapshot.world.totals.earned}G`);
        expectSummary("BORDER INCIDENTS", snapshot.world.totals.incidents);
        expectSummary("WATCH LEVELS", `${snapshot.world.totals.watchLevels} / ${snapshot.world.limits.watch * snapshot.world.realms.length}`);
        for (const route of snapshot.world.routes) {
            const text = normalize(dom.text);
            if (!text.includes(normalize(String(route.delivered))) || !text.includes(normalize(String(route.earned)))) {
                fail("route-value-mismatch", `${route.id}: expected ${route.delivered} delivered and ${route.earned} earned`);
            }
        }
        for (const realm of snapshot.world.realms) {
            const card = dom.frontierCards.find(item => normalize(item.name) === normalize(realm.name));
            if (!card) {
                fail("missing-frontier", realm.name);
                continue;
            }
            if (!normalize(card.text).includes(`${realm.routes} standing route`)) {
                fail("frontier-route-count-mismatch", `${realm.name}: expected ${realm.routes} standing routes`);
            }
            if (!normalize(card.text).includes(`${withCommas(realm.routeDelivered)} goods delivered`)) {
                fail("frontier-route-volume-mismatch", `${realm.name}: expected ${withCommas(realm.routeDelivered)} goods delivered`);
            }
        }
    }

    if (tab === "explore") {
        expectCount("landmarks", dom.counts.expeditionSites, snapshot.exploration.sites);
        expectCount("returned reports", dom.counts.expeditionHistory, Math.min(10, snapshot.exploration.history));
        expectSummary("LANDMARKS", snapshot.exploration.sites);
        expectSummary("SURVEYED", snapshot.exploration.known);
        expectSummary("PARTIES RETURNED", snapshot.exploration.completed);
        expectSummary("FRAGMENTS RECOVERED", snapshot.exploration.discoveries);
        if (snapshot.exploration.active) {
            expectText(snapshot.exploration.active.leaderName);
            expectText(snapshot.exploration.active.siteName);
            expectText(`${snapshot.exploration.active.remainingDays} DAYS`);
        } else {
            expectText("NO PARTY ON THE ROAD");
        }
    }

    if (tab === "economy") {
        expectSummary("POPULATION", snapshot.population);
        expectSummary("HOUSING", snapshot.housing);
        expectSummary("FOOD BALANCE / LEDGER", snapshot.economy.balance);
        expectSummary("STORAGE CAPACITY", snapshot.economy.storageCapacity);
        expectSummary("CROWN DEBT", `${snapshot.economy.debt} G`);
        expectSummary("FOOD CRISIS", snapshot.economy.crisis);
        expectSummary("GRAIN CONTRACT", snapshot.crownSupply.grainLevel ? `LEVEL ${snapshot.crownSupply.grainLevel}` : "NONE");
        expectSummary("WATERWORKS", snapshot.crownSupply.waterworksLevel ? `LEVEL ${snapshot.crownSupply.waterworksLevel}` : "NONE");
        expectSummary("COVERAGE", snapshot.crownSupply.waterworksCoverage);
        for (const [key, value] of Object.entries(snapshot.resources)) {
            if (!(key in dom.resources)) continue;
            if (!close(numeric(dom.resources[key]), value, 0.11)) fail("resource-mismatch", `${key}: displayed ${dom.resources[key]}, expected ${value}`);
        }
        if (snapshot.economy.ledger) {
            for (const [key, value] of Object.entries(snapshot.economy.ledger)) {
                const label = key.replace(/([A-Z])/g, " $1").replace(/^./, character => character.toUpperCase());
                const knownLabels = {
                    foodDemand: "Food demand", foodConsumed: "Food consumed", foodShortage: "Food shortage",
                    foodBalance: "Food balance", foodSpoiled: "Food spoiled", taxesCollected: "Taxes collected",
                    wagesPaid: "Wages paid", upkeepPaid: "Building & road upkeep", furnitureUpkeepPaid: "Furniture upkeep",
                    unpaidWages: "Unpaid wages", unpaidUpkeep: "Unpaid upkeep", unpaidFurniture: "Unpaid furniture",
                    debt: "Debt after settlement", debtInterest: "Debt interest", netGold: "Net treasury change"
                };
                const ledgerLabel = knownLabels[key] || label;
                if (!(ledgerLabel in dom.ledger)) continue;
                if (!close(numeric(dom.ledger[ledgerLabel]), value, 0.11)) {
                    fail("ledger-mismatch", `${ledgerLabel}: displayed ${dom.ledger[ledgerLabel]}, expected ${value}`);
                }
            }
        }
    }

    if (tab === "research") {
        expectCount("technology rows", dom.counts.researchTechs, Object.keys(snapshot.research.states).length);
        for (const [id, state] of Object.entries(snapshot.research.states)) {
            if (dom.techStatuses[id] !== state) fail("research-status-mismatch", `${id}: displayed ${dom.techStatuses[id] || "missing"}, expected ${state}`);
        }
        expectSummary("COMPLETED", `${snapshot.research.completed} / 24`);
        expectSummary("SCHOLARS", `${snapshot.research.scholars} / ${snapshot.research.capacity}`);
        expectSummary("FUNDING", snapshot.research.fundingLabel.toUpperCase());
        expectSummary("ACTIVE PROJECT", snapshot.research.active || "NONE");
    }

    if (tab === "justice") {
        expectCount("judge rows", dom.counts.judgeRows, snapshot.justice.judges);
        expectCount("pending case rows", dom.counts.justiceCases, snapshot.justice.pendingCases);
        expectSummary("JUDGES", `${snapshot.justice.judges} / ${snapshot.justice.capacity}`);
        expectSummary("COURTS & PRISONS", `${snapshot.justice.courts} / ${snapshot.justice.prisons}`);
        expectSummary("CRIME RATE", `${snapshot.justice.crimeRate}%`);
        expectSummary("PENDING CASES", snapshot.justice.pendingCases);
        expectText(`IN FORCE: ${snapshot.justice.lawLabel.toUpperCase()}`);
        expectText(`CHARTERS · ${snapshot.justice.charters} / 4`);
    }

    if (tab === "faith") {
        expectCount("clergy rows", dom.counts.clergyRows, snapshot.faith.clergy);
        expectSummary("CLERGY", `${snapshot.faith.clergy} / ${snapshot.faith.capacity}`);
        expectSummary("CONGREGATION", `${snapshot.faith.congregation} / ${snapshot.faith.population}`);
        expectSummary("TEMPLES & SHRINES", `${snapshot.faith.temples} / ${snapshot.faith.shrines}`);
        expectSummary("COVERAGE", `${Math.round(snapshot.faith.coverage * 100)}%`);
        const currentBudget = pageSafeText(dom.text, snapshot.faith.budgetLabel);
        if (!currentBudget) fail("faith-budget-missing", snapshot.faith.budgetLabel);
        if (dom.currentBudget !== null && !pageSafeText(dom.currentBudget, snapshot.faith.budgetLabel)) {
            fail("faith-budget-mismatch", `displayed ${dom.currentBudget}, expected ${snapshot.faith.budgetLabel}`);
        }
    }

    if (tab === "health") {
        expectCount("healer rows", dom.counts.healerRows, snapshot.health.healers);
        expectSummary("SANITATION", `${snapshot.health.sanitation} / 100`);
        expectSummary("WATER COVERAGE", `${snapshot.health.waterCoverage}%`);
        expectSummary("SICK", snapshot.health.sick);
        expectSummary("AVG IMMUNITY", snapshot.health.immunityAverage);
        expectSummary("HEALER COVERAGE", `${snapshot.health.healerCoverage}%`);
        expectSummary("MEDICINE", `${snapshot.health.medicineStock} DOSES`);
        if (snapshot.health.active) expectText(snapshot.health.disease);
        else expectText("NO ACTIVE OUTBREAK");
        expectText(`LEVEL ${snapshot.health.quarantineLevel}`);
        expectText("TRADE PENALTY");
        expectText(`${snapshot.health.tradePenalty}%`);
    }

    if (tab === "cards") {
        expectCount("hand cards", dom.counts.cardRows, snapshot.cards.hand);
        expectSummary("HAND", `${snapshot.cards.hand} / 5`);
        expectSummary("DRAW PILE", snapshot.cards.drawPile);
        expectSummary("REWARDS QUEUED", snapshot.cards.queued);
    }

    if (tab === "chronicle") {
        expectCount("retained timeline", dom.counts.timelineRoot, snapshot.chronicle.retained);
        expectCount("visible timeline", dom.counts.timelineVisible, snapshot.chronicle.currentEvents);
        expectCount("rendered timeline cards", dom.counts.timelineCards, Math.min(160, snapshot.chronicle.currentEvents));
        expectText(`${withCommas(snapshot.chronicle.retained)} RETAINED`);
        expectText(`${withCommas(snapshot.chronicle.generated)} GENERATED · CAP 2,400`);
        expectSummary("EVENTS THIS YEAR", snapshot.chronicle.currentEvents);
        expectSummary("NAMED EVENTS", snapshot.chronicle.currentNamed);
    }

    if (tab === "kingdom") {
        expectSummary("YEAR", snapshot.year);
        expectSummary("POPULATION", snapshot.population);
        expectSummary("MORALE", `${snapshot.morale}/100`);
    }

    if (tab === "population") {
        if (!normalize(dom.text).includes(String(snapshot.registeredPopulation))) fail("population-missing", `expected ${snapshot.registeredPopulation}`);
    }
}

// A small helper kept outside the page context for the budget text check.
function pageSafeText(text, needle) {
    return normalize(text).toLowerCase().includes(normalize(needle).toLowerCase());
}

export async function auditMaturePanels({ page, journeyPath, outDir, openPanel, closePanel }) {
    const tabs = [...(PATH_TABS[journeyPath] || []), ...COMMON_TABS];
    const snapshot = await readAuditSnapshot(page);
    const findings = [];
    const audited = [];
    const screenshots = [];
    await mkdir(outDir, { recursive: true });
    for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(180);
        for (const tab of tabs) {
            let timeout = null;
            try {
                await openPanel(tab);
                await waitForPanel(page, tab, snapshot);
            } catch (error) {
                timeout = String(error?.message || error).slice(0, 180);
            }
            const dom = await readPanelDom(page);
            const before = findings.length;
            if (timeout) findings.push({ tab, width: viewport.width, kind: "panel-timeout", detail: timeout });
            if (dom.missing) {
                findings.push({ tab, width: viewport.width, kind: "panel-missing", detail: "command panel content is absent" });
                audited.push({ tab, width: viewport.width, missing: true, timeout });
                continue;
            }
            checkSnapshot(snapshot, dom, tab, viewport.width, findings);
            const file = resolve(outDir, `${journeyPath}-mature-${viewport.label}-${tab}.png`);
            await page.screenshot({ path: file });
            screenshots.push(file);
            const scrollable = dom.panelScrollHeight > dom.panelClientHeight + 40;
            let bottomFile = null;
            if (scrollable) {
                await page.evaluate(() => {
                    const content = document.querySelector("#command-panel-content");
                    if (content) content.scrollTop = content.scrollHeight;
                });
                await page.waitForTimeout(120);
                bottomFile = resolve(outDir, `${journeyPath}-mature-${viewport.label}-${tab}-bottom.png`);
                await page.screenshot({ path: bottomFile });
                screenshots.push(bottomFile);
                await page.evaluate(() => {
                    const content = document.querySelector("#command-panel-content");
                    if (content) content.scrollTop = 0;
                });
            }
            audited.push({
                tab,
                width: viewport.width,
                title: dom.title,
                textLength: dom.textLength,
                pageOverflow: dom.pageOverflow,
                panelOverflow: dom.panelOverflow,
                clipped: dom.clipped,
                duplicateIds: dom.duplicateIds,
                emptyButtons: dom.emptyButtons,
                counts: dom.counts,
                summaries: dom.summaries,
                screenshots: [file, ...(bottomFile ? [bottomFile] : [])],
                findings: findings.slice(before).map(item => ({ kind: item.kind, detail: item.detail })),
                timeout
            });
            await closePanel();
        }
    }
    return { tabs, viewports: VIEWPORTS, snapshot, audited, findings, screenshots };
}
