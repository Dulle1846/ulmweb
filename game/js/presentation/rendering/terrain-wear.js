// Persistent ground wear for the terrain layer.
//
// Roads and buildings leave compacted, trodden ground. Drawing those spots
// instantly and permanently made a freshly built road look a century old, so
// wear now accumulates while a source exists and recovers slowly once it is
// gone. The field lives in plain typed arrays and is encoded for the shader, so
// the accumulation rules can be unit tested without a browser.
//
// Wear is presentation-only: it is not part of the save schema and is rebuilt
// from the world when a realm loads.

export const WEAR_DEFAULTS = Object.freeze({
    scale: 2,
    // Seconds to reach a full spot / to fade a removed spot back to nothing.
    rise: 0.30,
    decay: 0.015,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function wearGridSize(worldWidth, worldHeight, scale = WEAR_DEFAULTS.scale) {
    const step = Number.isFinite(Number(scale)) && Number(scale) > 0 ? Number(scale) : WEAR_DEFAULTS.scale;
    return {
        columns: Math.max(1, Math.ceil(Math.max(1, worldWidth) * step)),
        rows: Math.max(1, Math.ceil(Math.max(1, worldHeight) * step)),
        scale: step,
    };
}

export function createWearField(columns, rows) {
    return new Float32Array(Math.max(1, columns) * Math.max(1, rows));
}

export function stampWearSpot(targets, columns, rows, centerX, centerY, radius, strength) {
    if (!targets || columns <= 0 || rows <= 0) return targets;
    const reach = Math.max(0, Number(radius) || 0);
    const weight = clamp(Number(strength) || 0, 0, 1);
    if (reach <= 0 || weight <= 0) return targets;
    const minX = Math.max(0, Math.floor(centerX - reach));
    const maxX = Math.min(columns - 1, Math.ceil(centerX + reach));
    const minY = Math.max(0, Math.floor(centerY - reach));
    const maxY = Math.min(rows - 1, Math.ceil(centerY + reach));
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const dx = (x + 0.5 - centerX) / reach;
            const dy = (y + 0.5 - centerY) / reach;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance >= 1) continue;
            const falloff = (1 - distance) * (1 - distance);
            const index = y * columns + x;
            targets[index] = Math.max(targets[index], weight * falloff);
        }
    }
    return targets;
}

export function buildWearTargets(targets, columns, rows, sources, scale = WEAR_DEFAULTS.scale) {
    if (!targets) return targets;
    targets.fill(0);
    const step = Number.isFinite(Number(scale)) && Number(scale) > 0 ? Number(scale) : WEAR_DEFAULTS.scale;
    for (const road of sources?.roads || []) {
        stampWearSpot(targets, columns, rows, (road.x + 0.5) * step, (road.y + 0.5) * step, 1.5 * step, 0.62);
    }
    for (const building of sources?.buildings || []) {
        const radius = Math.max(1.2, Number(building.radius) || 1.6);
        stampWearSpot(targets, columns, rows, (building.x + 0.5) * step, (building.y + 0.5) * step, radius * step, building.strength ?? 0.46);
        if (building.field) {
            stampWearSpot(targets, columns, rows, (building.x + 0.5) * step, (building.y + 0.5) * step, 1.8 * step, 0.24);
        }
    }
    return targets;
}

export function advanceWearField(field, targets, deltaSeconds, options = {}) {
    if (!field || !targets || field.length !== targets.length) return 0;
    const dt = clamp(Number(deltaSeconds) || 0, 0, 1);
    if (dt <= 0) return 0;
    const rise = (Number(options.rise) || WEAR_DEFAULTS.rise) * dt;
    const decay = (Number(options.decay) || WEAR_DEFAULTS.decay) * dt;
    let largest = 0;
    for (let index = 0; index < field.length; index++) {
        const difference = targets[index] - field[index];
        if (Math.abs(difference) < 1e-4) continue;
        const step = difference > 0 ? rise : decay;
        const applied = Math.min(Math.abs(difference), step);
        field[index] += difference > 0 ? applied : -applied;
        if (applied > largest) largest = applied;
    }
    return largest;
}

export function encodeWearField(field, bytes) {
    const length = field ? field.length : 0;
    if (!length) return bytes;
    if (!bytes || bytes.length !== length * 4) throw new Error("The wear byte buffer must hold four bytes per cell.");
    for (let index = 0; index < length; index++) {
        const value = Math.round(clamp(field[index], 0, 1) * 255);
        const offset = index * 4;
        bytes[offset] = value;
        bytes[offset + 1] = value;
        bytes[offset + 2] = value;
        bytes[offset + 3] = 255;
    }
    return bytes;
}
