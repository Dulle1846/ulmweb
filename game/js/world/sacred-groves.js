// A tiny, dependency-free reader for consecrated grove tiles.
//
// The harvest guard, the fauna harvest and the culture system all need the
// same answer. Keeping the read here avoids a system-to-system import cycle
// while still making the state contract explicit and save-compatible.
import { state } from "../core/state.js";

export function sacredGroveTileAt(x, y) {
    const tx = Math.floor(Number(x));
    const ty = Math.floor(Number(y));
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    const groves = state.economy?.productionChains?.forestCulture?.groves;
    if (Array.isArray(groves) && groves.length) {
        const grove = groves.find(entry => Math.floor(Number(entry?.x)) === tx && Math.floor(Number(entry?.y)) === ty);
        if (grove) return grove;
    }
    // A joint border preserve is the same promise between two realms: no axe,
    // no fire and no thinning on its tile. It lives on the forest-warfare
    // ledger so the shared guard reads it without importing the system.
    const fronts = state.economy?.productionChains?.forestWarfare?.fronts;
    if (Array.isArray(fronts)) {
        for (const front of fronts) {
            const preserve = front?.preserve;
            if (!preserve) continue;
            if (Math.floor(Number(preserve.x)) === tx && Math.floor(Number(preserve.y)) === ty) {
                return { ...preserve, kind: "joint-preserve" };
            }
        }
    }
    return null;
}

export function sacredGroveTileCount() {
    const groves = state.economy?.productionChains?.forestCulture?.groves;
    return Array.isArray(groves) ? groves.length : 0;
}
