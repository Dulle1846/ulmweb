// A tiny, dependency-free reader for consecrated grove tiles.
//
// The harvest guard, the fauna harvest and the culture system all need the
// same answer. Keeping the read here avoids a system-to-system import cycle
// while still making the state contract explicit and save-compatible.
import { state } from "../core/state.js";

export function sacredGroveTileAt(x, y) {
    const groves = state.economy?.productionChains?.forestCulture?.groves;
    if (!Array.isArray(groves) || !groves.length) return null;
    const tx = Math.floor(Number(x));
    const ty = Math.floor(Number(y));
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    return groves.find(grove => Math.floor(Number(grove?.x)) === tx && Math.floor(Number(grove?.y)) === ty) || null;
}

export function sacredGroveTileCount() {
    const groves = state.economy?.productionChains?.forestCulture?.groves;
    return Array.isArray(groves) ? groves.length : 0;
}
