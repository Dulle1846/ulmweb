// Pure zoom-level and interpolation rules, independent of browser state.

export const ZOOM_PRESETS = Object.freeze([0.09, 0.3, 0.95, 2.4]);

export function clampZoom(value, min, max) {
    if (![value, min, max].every(Number.isFinite) || min <= 0 || max < min) {
        throw new RangeError("Zoom bounds and value must be finite and valid.");
    }
    return Math.min(max, Math.max(min, value));
}

export function resolveZoomLevel(zoom, thresholds) {
    if (!Number.isFinite(zoom) || zoom <= 0) {
        throw new RangeError("Zoom must be a positive finite number.");
    }

    const { district, rooftops, interiors } = thresholds;
    if (![district, rooftops, interiors].every(Number.isFinite) ||
        !(district < rooftops && rooftops < interiors)) {
        throw new RangeError("Zoom thresholds must be finite and strictly increasing.");
    }

    if (zoom < district) return 1;
    if (zoom < rooftops) return 2;
    if (zoom < interiors) return 3;
    return 4;
}

export function interpolateZoom(current, target, deltaSeconds, smoothing = 0.12) {
    if (![current, target, deltaSeconds, smoothing].every(Number.isFinite) ||
        current <= 0 || target <= 0 || deltaSeconds < 0 || smoothing <= 0 || smoothing >= 1) {
        throw new RangeError("Invalid zoom interpolation values.");
    }

    const blend = 1 - Math.exp(-smoothing * 60 * Math.min(deltaSeconds, 0.1));
    const next = current + (target - current) * blend;
    return Math.abs(target - next) < 0.0001 ? target : next;
}

export function cameraOffsetForAnchor(worldCoordinate, screenCoordinate, cellSize, zoom) {
    if (![worldCoordinate, screenCoordinate, cellSize, zoom].every(Number.isFinite) ||
        cellSize <= 0 || zoom <= 0) {
        throw new RangeError("Invalid camera anchor values.");
    }
    return worldCoordinate * cellSize * zoom - screenCoordinate;
}
