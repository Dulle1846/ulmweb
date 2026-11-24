import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
    NOBLE_AUDIT_SEEDS,
    NOBLE_AUDIT_YEARS,
    WITHHOLDING_THRESHOLD,
    evaluateNobleHealth
} from "../campaign/nobility-audit.mjs";

const execFileAsync = promisify(execFile);
const gameRoot = fileURLToPath(new URL("../..", import.meta.url));
const auditChild = fileURLToPath(new URL("../campaign/nobility-audit.mjs", import.meta.url));

const healthyRows = () => Array.from({ length: NOBLE_AUDIT_YEARS }, (_, index) => ({
    year: index + 2,
    present: true,
    members: 3,
    adults: 2,
    loyalty: 60,
    dues: 12,
    withheld: false
}));

test("the noble health gate rejects permanent dormancy and withheld dues", () => {
    const healthy = evaluateNobleHealth({ finalMembers: 3, audits: healthyRows() });
    assert.equal(healthy.ok, true);

    const extinct = evaluateNobleHealth({ finalMembers: 0, audits: healthyRows() });
    assert.equal(extinct.ok, false);
    assert.ok(extinct.failures.some(failure => /no living members/.test(failure)));

    const dormant = healthyRows().map((row, index) => index === 7 ? { ...row, members: 0, adults: 0 } : row);
    const dormantResult = evaluateNobleHealth({ finalMembers: 3, audits: dormant });
    assert.equal(dormantResult.ok, false);
    assert.ok(dormantResult.failures.some(failure => /dormant/.test(failure)));

    const withheld = healthyRows().map((row, index) => index === 11 ? { ...row, loyalty: 29, withheld: false } : row);
    const withheldResult = evaluateNobleHealth({ finalMembers: 3, audits: withheld });
    assert.equal(withheldResult.ok, false);
    assert.ok(withheldResult.failures.some(failure => /withheld/.test(failure)));

    const missing = healthyRows().map((row, index) => index === 3 ? { ...row, present: false } : row);
    assert.equal(evaluateNobleHealth({ finalMembers: 3, audits: missing }).ok, false);
});

// Each seed still runs in its own process, so no campaign module state can
// leak between seeds. Two workers keep the sweep responsive on shared runners.
// The harness timeout only guards against a hung child; the real gates are the
// eight full 25-year audits and their unchanged health assertions below.
test("noble houses stay viable across the fixed 25-year seed sweep", { timeout: 600_000 }, async () => {
    const audited = new Array(NOBLE_AUDIT_SEEDS.length);
    let nextSeed = 0;
    const auditWorker = async () => {
        while (nextSeed < NOBLE_AUDIT_SEEDS.length) {
            const index = nextSeed++;
            const seed = NOBLE_AUDIT_SEEDS[index];
            let stdout;
            try {
                const result = await execFileAsync(process.execPath, [auditChild], {
                    cwd: gameRoot,
                    timeout: 120_000,
                    maxBuffer: 4 * 1024 * 1024,
                    env: {
                        ...process.env,
                        NOBLE_AUDIT_CHILD: "1",
                        NOBLE_AUDIT_SEED: String(seed),
                        NOBLE_AUDIT_YEARS: String(NOBLE_AUDIT_YEARS)
                    }
                });
                stdout = result.stdout;
            } catch (error) {
                const detail = String(error?.stderr || error?.message || error);
                assert.fail(`noble audit failed for seed ${seed}: ${detail}`);
            }
            try {
                audited[index] = JSON.parse(stdout);
            } catch {
                assert.fail(`noble audit for seed ${seed} did not emit JSON: ${stdout?.slice(0, 400)}`);
            }
        }
    };
    await Promise.all([auditWorker(), auditWorker()]);
    for (let index = 0; index < NOBLE_AUDIT_SEEDS.length; index++) {
        const seed = NOBLE_AUDIT_SEEDS[index];
        const audit = audited[index];
        assert.equal(audit.gameOver, false, `seed ${seed} ended the realm during the noble audit`);
        assert.equal(audit.auditYears, NOBLE_AUDIT_YEARS, `seed ${seed} must record every annual noble audit`);
        assert.equal(audit.initialHouseCount, 4, `seed ${seed} must found four noble houses`);
        assert.equal(audit.finalHouseCount, 4, `seed ${seed} must keep four living noble houses`);
        assert.equal(audit.houses.length, 4, `seed ${seed} must retain four house records`);
        assert.equal(audit.finalDormant, 0, `seed ${seed} must end with no dormant house`);
        assert.equal(audit.withheldAuditYears, 0, `seed ${seed} must not withhold noble dues`);
        assert.ok(audit.totalDues > 0, `seed ${seed} must collect real noble dues over the campaign`);
        for (const house of audit.houses) {
            assert.equal(house.audits.length, NOBLE_AUDIT_YEARS, `${seed}/${house.familyName} must have a full audit history`);
            assert.equal(house.ok, true, `${seed}/${house.familyName} broke its health gate: ${house.failures.join("; ")}`);
            assert.ok(house.finalMembers > 0, `${seed}/${house.familyName} must keep at least one living member`);
            assert.ok(house.minLoyalty >= WITHHOLDING_THRESHOLD,
                `${seed}/${house.familyName} fell below the withholding threshold: ${house.minLoyalty}`);
            for (const row of house.audits) {
                assert.equal(row.present, true, `${seed}/${house.familyName} is missing from audit year ${row.year}`);
                assert.ok(row.members > 0, `${seed}/${house.familyName} was dormant in audit year ${row.year}`);
                assert.ok(row.loyalty >= WITHHOLDING_THRESHOLD,
                    `${seed}/${house.familyName} withheld dues in year ${row.year} at loyalty ${row.loyalty}`);
                assert.equal(row.withheld, false, `${seed}/${house.familyName} withheld dues in audit year ${row.year}`);
            }
        }
    }
    assert.equal(audited.length, NOBLE_AUDIT_SEEDS.length);
});
