// Deterministic benchmark plan and statistics for the live renderer.
// Only rendered frames are sampled, not idle requestAnimationFrame callbacks.

export const BENCHMARK_WARMUP_MS = 650;
export const BENCHMARK_SAMPLE_MS = 1500;
export const BENCHMARK_MIN_FRAMES = 20;
export const BENCHMARK_RENDERERS = Object.freeze([
    { id: "auto", label: "Auto" },
    { id: "webgl", label: "WebGL" },
    { id: "canvas", label: "Canvas 2D" },
]);
export const BENCHMARK_SCALES = Object.freeze([1, 0.85, 0.7, 0.5]);

export function buildBenchmarkPlan() {
    return BENCHMARK_RENDERERS.flatMap(renderer =>
        BENCHMARK_SCALES.map(scale => ({
            renderer: renderer.id,
            rendererLabel: renderer.label,
            scale,
            scaleLabel: Math.round(scale * 100),
        }))
    );
}

export function summarizeBenchmarkSamples(frameTimes, drawTimes = []) {
    const intervals = frameTimes
        .map(Number)
        .filter(value => Number.isFinite(value) && value > 0);
    const draws = drawTimes
        .map(Number)
        .filter(value => Number.isFinite(value) && value >= 0);
    const totalFrameMs = intervals.reduce((total, value) => total + value, 0);
    const totalDrawMs = draws.reduce((total, value) => total + value, 0);
    const sorted = intervals.slice().sort((a, b) => a - b);
    const p95Index = sorted.length ? Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1) : 0;

    return {
        samples: intervals.length,
        fps: totalFrameMs > 0 ? intervals.length * 1000 / totalFrameMs : 0,
        frameMs: intervals.length ? totalFrameMs / intervals.length : 0,
        p95FrameMs: sorted.length ? sorted[p95Index] : 0,
        drawMs: draws.length ? totalDrawMs / draws.length : 0,
    };
}

// The display refresh rate can cap several configurations at the same FPS.
// Break near-ties with the actual draw cost instead of hiding a faster setup.
export function findBenchmarkWinner(results = []) {
    return results.reduce((best, row) => {
        if (!best) return row;
        if (row.fps > best.fps + 0.5) return row;
        if (Math.abs(row.fps - best.fps) <= 0.5 && row.drawMs < best.drawMs) return row;
        return best;
    }, null);
}
