// Pure keyboard mapping for camera, zoom, card placement and common commands.
// Presentation only: no simulation state, randomness or save data is involved.
// Pan values are camera deltas in device pixels: pressing Left reveals world to
// the left (camera.x decreases), matching how a player reads a map.

export const KEYBOARD_PAN_STEP = 96;
export const KEYBOARD_ZOOM_DELTA = 120;

export function mapKeyboardIntent(key) {
    switch (key) {
        case "ArrowLeft":
        case "a":
        case "A": return { panX: -KEYBOARD_PAN_STEP, panY: 0 };
        case "ArrowRight":
        case "d":
        case "D": return { panX: KEYBOARD_PAN_STEP, panY: 0 };
        case "ArrowUp":
        case "w":
        case "W": return { panX: 0, panY: -KEYBOARD_PAN_STEP };
        case "ArrowDown":
        case "s":
        case "S": return { panX: 0, panY: KEYBOARD_PAN_STEP };
        case "Enter":
        case " ": return { place: true };
        case "p":
        case "P": return { togglePause: true };
        case "1": return { zoomLevel: 1 };
        case "2": return { zoomLevel: 2 };
        case "3": return { zoomLevel: 3 };
        case "4": return { zoomLevel: 4 };
        case "5": return { zoomLevel: 5 };
        case "+":
        case "=": return { zoomDelta: -KEYBOARD_ZOOM_DELTA };
        case "-":
        case "_": return { zoomDelta: KEYBOARD_ZOOM_DELTA };
        case "?": return { help: true };
        default: return null;
    }
}

// File shortcuts stay on their native buttons so the existing save/load paths,
// status messages and recovery handling remain the single source of truth.
export function mapModifiedKeyboardIntent(key, modifiers = {}) {
    if (!modifiers.ctrlKey && !modifiers.metaKey) return null;
    if (modifiers.altKey) return null;
    const lower = String(key || "").toLowerCase();
    if (lower === "s") return { save: true };
    if (lower === "o") return { load: true };
    return null;
}

export function isTextEntryTarget(target) {
    if (!target || typeof target !== "object") return false;
    const tag = String(target.tagName || "").toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable === true;
}

// Enter and Space must not double-fire a focused control's own activation.
const INTERACTIVE_ROLES = new Set(["button", "combobox", "slider", "checkbox", "radio", "tab", "menuitem", "switch", "link"]);
export function isInteractiveTarget(target) {
    if (isTextEntryTarget(target)) return true;
    if (!target || typeof target !== "object") return false;
    const tag = String(target.tagName || "").toUpperCase();
    if (tag === "BUTTON" || tag === "A" || tag === "SUMMARY") return true;
    const role = String(target.getAttribute?.("role") || "").toLowerCase();
    return INTERACTIVE_ROLES.has(role);
}
