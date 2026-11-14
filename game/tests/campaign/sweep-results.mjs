// Aggregation rules for the documented campaign seed sweep.
//
// The runner must never weaken a campaign requirement to make a sweep pass.
// Every seed has to satisfy the same `requirements` object, every seed has to
// keep the one-order-per-phase fuel-backfill invariant, and at least one seed
// must produce a real illness-to-fuel-backfill order in ordinary simulation.
export function evaluateCampaignSweep(results, seeds) {
    const failures = [];
    for (const result of results) {
        if (!result.ok) {
            const failed = Object.entries(result.requirements || {})
                .filter(([, value]) => !value)
                .map(([key]) => key);
            failures.push(`seed ${result.seed}: campaign requirements failed (${failed.join(", ")})`);
        }
        const fuel = result.diagnostics?.fuelBackfill;
        if (!fuel || Number(fuel.maxOrdersPerPhase) > 1) {
            failures.push(`seed ${result.seed}: invalid fuel-backfill evidence ${JSON.stringify(fuel || null)}`);
        }
    }
    const fuelBackfillOrders = results.reduce(
        (sum, result) => sum + (Number(result.diagnostics?.fuelBackfill?.orders) || 0), 0);
    const fuelBackfillPhases = results.reduce(
        (sum, result) => sum + (Number(result.diagnostics?.fuelBackfill?.phases) || 0), 0);
    if (fuelBackfillOrders < 1) {
        failures.push(`seed sweep produced no real illness-to-fuel-backfill orders across ${seeds.join(", ")}`);
    }
    const maxOrdersPerPhase = Math.max(
        0,
        ...results.map(result => Number(result.diagnostics?.fuelBackfill?.maxOrdersPerPhase) || 0),
    );
    return {
        ok: failures.length === 0,
        failures,
        fuelBackfillOrders,
        fuelBackfillPhases,
        maxOrdersPerPhase,
        allCampaignRequirementsTrue: results.every(result => result.ok),
    };
}
