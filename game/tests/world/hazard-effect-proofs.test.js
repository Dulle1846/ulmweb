// 1.2.20 — executable, falsifiable effect proofs.
//
// The trigger cases live in hazard-proof-cases.js so the browser visibility
// suite can replay exactly the same state changes through the real HAZARDS
// renderer. This file only owns the Node assertions and the neutralization
// accounting.
import test from "node:test";
import assert from "node:assert/strict";
import { HAZARD_EVIDENCE } from "../../js/world/hazard-evidence.js";
import {
    clearHazardProofNeutralized, setHazardProofNeutralized
} from "../../js/systems/hazard-proof.js";
import { setHazardProofRoll } from "../../js/systems/environmental-hazards.js";
import { PROOFS, runProof } from "./hazard-proof-cases.js";

test("1.2.20 all 102 catalogue points produce measured state deltas", () => {
    assert.equal(PROOFS.length, 102, "the proof table must cover every catalogue row");
    const seen = new Set();
    const failures = [];
    for (const proof of PROOFS) {
        assert.ok(!seen.has(proof.spec), "duplicate proof " + proof.spec);
        seen.add(proof.spec);
        const evidence = HAZARD_EVIDENCE[proof.spec];
        assert.ok(evidence && evidence.surfaces.length > 0, "proof needs a visible surface for " + proof.spec);
        assert.equal(evidence.passive, false, "an executable proof cannot be marked passive: " + proof.spec);
        assert.equal(evidence.executableProof, "1.2.20 all 102 catalogue points produce measured state deltas");
        assert.equal(evidence.visibilityProof?.file, "tests/browser/hazard-visibility-proof.mjs");
        assert.match(evidence.visibilityProof?.render || "", /renderHazardPanel/);
        try {
            const result = runProof(proof);
            if (!(result.delta > 0)) failures.push(proof.spec + " (" + proof.group + "): " + result.detail);
        } catch (error) {
            failures.push(proof.spec + " (" + proof.group + "): " + error.message);
        } finally {
            setHazardProofRoll(null);
            clearHazardProofNeutralized();
        }
    }
    console.log("HAZARD PROOF PASS " + (PROOFS.length - failures.length) + "/" + PROOFS.length);
    console.log("HAZARD ACTIVE/PASSIVE " + PROOFS.length + "/0");
    assert.deepEqual(failures, []);
});

test("1.2.20 all 102 proofs fail when their own effect is neutralized", () => {
    const checked = PROOFS.length;
    const failures = [];
    for (const proof of PROOFS) {
        setHazardProofNeutralized([proof.spec, proof.mechanic]);
        let moved = false;
        let detail = "";
        try {
            const result = proof.run();
            moved = result.delta > 0;
            detail = result.detail;
        } catch (error) {
            detail = error.message;
        } finally {
            setHazardProofRoll(null);
            clearHazardProofNeutralized();
        }
        if (moved) failures.push(proof.spec + " (" + proof.group + "): still moved " + detail);
    }
    console.log("HAZARD NEUTRALIZATION FAILURES " + failures.length + "/" + checked);
    assert.deepEqual(failures, []);
});
