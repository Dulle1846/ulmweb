// Isolated noble-house audit. One seed per child process so the campaign's
// module state cannot carry into the next seed. The output is the annual noble
// record only; evaluateNobleHealth() decides whether a house actually failed.
import { runCampaign } from "./campaign-driver.mjs";
import { getNobilitySnapshot } from "../../js/systems/nobility.js";
import { state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";

export const NOBLE_AUDIT_SEEDS = Object.freeze([
    20261106, 20261108, 20261110, 20261111,
    20261114, 20261143, 20261152, 20261201
]);
export const NOBLE_AUDIT_YEARS = 25;
export const WITHHOLDING_THRESHOLD = 30;

function makeCanvasStub() {
    return {
        width: 0,
        height: 0,
        getContext() {
            return {
                createImageData(width, height) {
                    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
                },
                putImageData() {}
            };
        }
    };
}

function withCanvasStub(run) {
    const previousDocument = globalThis.document;
    globalThis.document = {
        createElement(tag) {
            if (tag !== "canvas") throw new Error("Unexpected DOM element in noble audit: " + tag);
            return makeCanvasStub();
        }
    };
    try {
        return run();
    } finally {
        globalThis.document = previousDocument;
    }
}

function snapshot() {
    const nobility = getNobilitySnapshot();
    return {
        year: state.year,
        population: state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length,
        houseCount: nobility.houseCount,
        dormantCount: nobility.dormantCount,
        averageLoyalty: Math.round(nobility.averageLoyalty * 100) / 100,
        defenseBonus: Math.round(nobility.defenseBonus * 10000) / 10000,
        duesThisYear: nobility.duesThisYear,
        withheldHouses: nobility.withheldHouses,
        lastAudit: nobility.lastAudit ? { ...nobility.lastAudit } : null,
        houses: nobility.houses.map(house => ({
            id: house.id,
            familyName: house.familyName,
            head: house.head?.name || null,
            members: house.memberCount,
            adults: house.adultCount,
            loyalty: house.loyalty,
            power: house.power,
            levy: house.levy,
            dues: house.dues,
            status: house.status,
            charter: house.charter,
            mustered: house.mustered,
            lastLevyYear: house.lastLevyYear
        }))
    };
}

function longestStreak(rows, predicate) {
    let longest = 0;
    let current = 0;
    for (const row of rows) {
        if (predicate(row)) {
            current++;
            longest = Math.max(longest, current);
        } else {
            current = 0;
        }
    }
    return longest;
}

// The gate uses the game's actual withholding threshold and rejects any
// dormant or withholding audit. It deliberately does not assert the measured
// 56–63 loyalty band.
export function evaluateNobleHealth(house) {
    const audits = Array.isArray(house?.audits) ? house.audits : [];
    const failures = [];
    if (Number(house?.finalMembers) === 0) failures.push("no living members at the final audit");
    const dormantStreak = longestStreak(audits, audit => Number(audit.members) === 0);
    if (audits.some(audit => Number(audit.members) === 0)) failures.push("dormant during an audit");
    const isWithheld = audit => Boolean(audit.withheld) ||
        (audit.present !== false && Number(audit.members) > 0 && Number(audit.loyalty) < WITHHOLDING_THRESHOLD);
    const withheldAudits = audits.filter(isWithheld);
    if (withheldAudits.length > 0) failures.push("withheld dues during an audit");
    const withheldStreak = longestStreak(audits, isWithheld);
    if (audits.some(audit => !audit.present)) failures.push("missing from a noble audit");
    return {
        ok: failures.length === 0,
        failures,
        dormantStreak,
        withheldAudits: withheldAudits.length,
        withheldStreak,
        minLoyalty: audits.length ? Math.min(...audits.map(audit => Number(audit.loyalty))) : null,
        maxLoyalty: audits.length ? Math.max(...audits.map(audit => Number(audit.loyalty))) : null,
        auditYears: audits.length
    };
}

export function runNobleAudit(seed, years = NOBLE_AUDIT_YEARS) {
    return withCanvasStub(() => {
        const marks = new Map();
        let lastYear = null;
        const campaign = runCampaign({
            seed,
            years,
            worldOptions: { climate: "temperate" },
            initialize: true,
            sampleTicks: 1,
            onInitialized() {
                lastYear = state.year;
            },
            onTick() {
                if (state.year === lastYear) return;
                lastYear = state.year;
                // Year one has no annual audit. Snapshotting before the first
                // annual task would seed person profiles early and change the
                // people RNG stream; the audit starts at year two.
                if (state.year <= 1) return;
                marks.set(state.year, snapshot());
            }
        });
        const final = snapshot();
        marks.set(final.year, final);
        const allMarks = [...marks.values()].sort((a, b) => a.year - b.year);
        const houseNames = [...new Set(allMarks.flatMap(mark => mark.houses.map(house => house.familyName)))];
        const houses = houseNames.map(familyName => {
            const finalHouse = final.houses.find(house => house.familyName === familyName) || null;
            const audits = allMarks.map(mark => {
                const house = mark.houses.find(entry => entry.familyName === familyName);
                return {
                    year: mark.year,
                    present: Boolean(house),
                    members: house?.members ?? 0,
                    adults: house?.adults ?? 0,
                    loyalty: house?.loyalty ?? 0,
                    dues: house?.dues ?? 0,
                    status: house?.status ?? "absent",
                    withheld: Boolean(house && house.members > 0 && house.loyalty < WITHHOLDING_THRESHOLD)
                };
            });
            return {
                familyName,
                finalMembers: finalHouse?.members ?? 0,
                finalStatus: finalHouse?.status ?? "absent",
                finalLoyalty: finalHouse?.loyalty ?? null,
                audits,
                ...evaluateNobleHealth({ finalMembers: finalHouse?.members ?? 0, audits })
            };
        });
        return {
            seed,
            years,
            campaignOk: campaign.ok,
            gameOver: campaign.gameOver,
            totalTicks: campaign.totalTicks,
            auditYears: allMarks.filter(mark => mark.lastAudit).length,
            initialHouseCount: allMarks[0]?.houseCount ?? 0,
            finalHouseCount: final.houseCount,
            finalDormant: final.dormantCount,
            finalAverageLoyalty: final.averageLoyalty,
            finalDefense: final.defenseBonus,
            totalDues: allMarks.reduce((sum, mark) => sum + mark.duesThisYear, 0),
            withheldAuditYears: allMarks.filter(mark => (mark.lastAudit?.withheld || 0) > 0).length,
            houses
        };
    });
}

if (process.env.NOBLE_AUDIT_CHILD === "1") {
    try {
        const seed = Number(process.env.NOBLE_AUDIT_SEED);
        if (!Number.isSafeInteger(seed) || seed <= 0) throw new Error("NOBLE_AUDIT_SEED must be a positive integer");
        const years = Math.max(1, Number(process.env.NOBLE_AUDIT_YEARS || NOBLE_AUDIT_YEARS));
        process.stdout.write(JSON.stringify(runNobleAudit(seed, years)) + "\n");
    } catch (error) {
        console.error(error?.stack || error);
        process.exitCode = 1;
    }
}
