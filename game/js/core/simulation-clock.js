// Pure fixed-step clock calculation. It has no browser or game-state dependencies.

export function consumeSimulationTime(
    accumulatorMs,
    elapsedMs,
    gameSpeed,
    tickIntervalMs,
    maxFrameMs = 100
) {
    const values = [accumulatorMs, elapsedMs, gameSpeed, tickIntervalMs, maxFrameMs];
    if (!values.every(Number.isFinite)) {
        throw new TypeError("Simulation clock values must be finite numbers.");
    }
    if (accumulatorMs < 0 || elapsedMs < 0 || gameSpeed <= 0 ||
        tickIntervalMs <= 0 || maxFrameMs <= 0) {
        throw new RangeError("Simulation clock values are outside their valid range.");
    }

    const acceptedFrameMs = Math.min(elapsedMs, maxFrameMs);
    const accumulatedMs = accumulatorMs + acceptedFrameMs * gameSpeed;
    const steps = Math.floor(accumulatedMs / tickIntervalMs);

    return {
        steps,
        remainderMs: accumulatedMs - steps * tickIntervalMs,
        acceptedFrameMs
    };
}
