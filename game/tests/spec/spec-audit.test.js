import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runSpecAudit } from "../../scripts/spec-audit.mjs";

test("the audit covers every registered section and never marks a point implemented without evidence", () => {
    const result = runSpecAudit({ write: false });
    assert.ok(result.sections.length >= 30);
    assert.ok(result.totals.total >= 1000);
    assert.equal(result.totals.total, result.sections.reduce((sum, section) => sum + section.total, 0));
    for (const section of result.sections) {
        assert.ok(section.points.length > 0, section.id + " has no points");
        for (const point of section.points) {
            if (point.status === "implemented") {
                assert.ok(point.consumers.length > 0 || Boolean(point.docEvidence), point.id + " has no consumer");
                assert.ok(point.tests.length > 0 || Boolean(point.docEvidence), point.id + " has no test evidence");
            } else {
                assert.ok(point.missing.length > 0, point.id + " is open without a reason");
            }
        }
    }
});

test("the generated audit and in-game coverage module match the live repository state", () => {
    const result = runSpecAudit({ write: false });
    const generated = JSON.parse(fs.readFileSync(new URL("../../docs/spec-coverage.json", import.meta.url), "utf8"));
    assert.deepEqual(generated.totals, result.totals);
    assert.deepEqual(generated.nextSection, result.nextSection);
    assert.deepEqual(generated.openPoints.map(point => [point.id, point.missing]), result.openPoints.map(point => [point.id, point.missing]));
    assert.equal(generated.sourceHash, result.sourceHash);
    const moduleText = fs.readFileSync(new URL("../../js/generated/spec-coverage.js", import.meta.url), "utf8");
    assert.match(moduleText, /export const SPEC_COVERAGE/);
    assert.match(moduleText, new RegExp('"total": ' + result.totals.total));
});

test("the biome manifest and the newly closed roadmap points are visible in the report", () => {
    const result = runSpecAudit({ write: false });
    const vegetation = result.sections.find(section => section.id === "1.2.18");
    assert.equal(vegetation.total, 70);
    assert.equal(vegetation.implemented, 70);
    const court = result.sections.find(section => section.id === "3.8");
    assert.ok(court.points.filter(point => point.id.startsWith("3.8.") && Number(point.id.split(".").pop()) <= 10).every(point => point.status === "implemented"));
    const succession = result.sections.find(section => section.id === "3.9").points.find(point => point.id === "3.9.1");
    assert.equal(succession.status, "implemented");
    assert.ok(succession.consumers.some(consumer => consumer.includes("setSuccessionLaw")));
});
