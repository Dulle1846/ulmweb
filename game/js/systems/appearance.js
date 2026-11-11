// Deterministic appearance records. These are derived from a stable person id,
// never from the shared simulation RNG, so adding them cannot change an old
// campaign or consume a random draw that belongs to another system.
export const APPEARANCE_VERSION = 1;

const SKIN = Object.freeze([
    { label: "olive", color: "#d4a477", shade: "#af7853" },
    { label: "golden", color: "#e0b58d", shade: "#bd855f" },
    { label: "fawn", color: "#c79370", shade: "#9e674b" },
    { label: "russet", color: "#a96e4d", shade: "#824b35" },
    { label: "umber", color: "#79503b", shade: "#59382a" },
    { label: "porcelain", color: "#efd0b1", shade: "#c99d7c" }
]);
const HAIR = Object.freeze([
    { label: "cropped", color: "#3b2d24" },
    { label: "short", color: "#5b3d2a" },
    { label: "braided", color: "#8b5833" },
    { label: "long", color: "#342922" },
    { label: "curls", color: "#6e3f2d" },
    { label: "silver", color: "#b7b3a8" }
]);
const EYES = Object.freeze([
    { label: "hazel", color: "#6b573d" },
    { label: "brown", color: "#4f3428" },
    { label: "green", color: "#5e7b53" },
    { label: "blue", color: "#5b7c90" },
    { label: "grey", color: "#777b7b" }
]);
const OUTFITS = Object.freeze([
    { label: "moss tunic", color: "#5c7351", shade: "#394a35", accent: "#c5a35d" },
    { label: "ochre tunic", color: "#9c713b", shade: "#6e4b27", accent: "#d9bf82" },
    { label: "russet tunic", color: "#8e4f3d", shade: "#63362a", accent: "#d4a56a" },
    { label: "slate tunic", color: "#4f6470", shade: "#33454f", accent: "#a9b7b0" },
    { label: "undyed linen", color: "#b9a37b", shade: "#8d7752", accent: "#6d5030" },
    { label: "forest wool", color: "#3f604d", shade: "#294337", accent: "#bd9a59" },
    { label: "dusty plum", color: "#765268", shade: "#513747", accent: "#d3ad79" }
]);
const ACCESSORIES = Object.freeze([
    { label: "none", color: "#8d7754" },
    { label: "satchel", color: "#6d4b31" },
    { label: "scarf", color: "#a65d4c" },
    { label: "pendant", color: "#c3a25e" },
    { label: "feather", color: "#668b80" }
]);
const HAIR_STYLES = Object.freeze(["cropped", "short", "braided", "long", "curls", "silver"]);
const BEARDS = Object.freeze(["none", "stubble", "full", "moustache"]);

function hashString(value) {
    let hash = 2166136261;
    for (const character of String(value || "person")) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
function rng(seed) {
    let value = seed >>> 0;
    return () => {
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
        return value / 4294967296;
    };
}
function integer(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(numeric)));
}
function pickIndex(next, length) {
    return Math.min(length - 1, Math.max(0, Math.floor(next() * length)));
}

export function createAppearance(id, { species = "human", sex = "female", role = "resident" } = {}) {
    const next = rng(hashString(String(id) + "|" + species + "|" + sex + "|" + role + "|appearance"));
    const hairIndex = pickIndex(next, HAIR.length);
    const beard = sex === "male" ? (next() < 0.17 ? 2 : next() < 0.34 ? 1 : next() < 0.12 ? 3 : 0) : 0;
    return {
        version: APPEARANCE_VERSION,
        skin: pickIndex(next, SKIN.length),
        hair: hairIndex,
        hairColor: hairIndex === 5 ? 5 : pickIndex(next, HAIR.length),
        eyes: pickIndex(next, EYES.length),
        height: pickIndex(next, 3),
        build: pickIndex(next, 3),
        beard,
        outfit: pickIndex(next, OUTFITS.length),
        accessory: pickIndex(next, ACCESSORIES.length)
    };
}

export function normalizeAppearance(saved, id, options = {}) {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return createAppearance(id, options);
    return {
        version: APPEARANCE_VERSION,
        skin: integer(saved.skin, 0, SKIN.length - 1, 0),
        hair: integer(saved.hair, 0, HAIR_STYLES.length - 1, 1),
        hairColor: integer(saved.hairColor, 0, HAIR.length - 1, 1),
        eyes: integer(saved.eyes, 0, EYES.length - 1, 0),
        height: integer(saved.height, 0, 2, 1),
        build: integer(saved.build, 0, 2, 1),
        beard: integer(saved.beard, 0, BEARDS.length - 1, 0),
        outfit: integer(saved.outfit, 0, OUTFITS.length - 1, 0),
        accessory: integer(saved.accessory, 0, ACCESSORIES.length - 1, 0)
    };
}

export function appearanceForEntity(entity) {
    const person = entity?.person || {};
    return normalizeAppearance(person.appearance, entity?.personId || entity?.id || person.id, {
        species: person.species || "human",
        sex: person.sex || "female",
        role: person.role || "resident"
    });
}

export function appearanceColors(appearance) {
    const normalized = normalizeAppearance(appearance, "appearance-preview");
    return {
        skin: SKIN[normalized.skin].color,
        skinShade: SKIN[normalized.skin].shade,
        hair: HAIR[normalized.hairColor].color,
        eyes: EYES[normalized.eyes].color,
        outfit: OUTFITS[normalized.outfit].color,
        outfitShade: OUTFITS[normalized.outfit].shade,
        accent: OUTFITS[normalized.outfit].accent,
        accessory: ACCESSORIES[normalized.accessory].color
    };
}

export function describeAppearance(appearance) {
    const normalized = normalizeAppearance(appearance, "appearance-description");
    const height = ["short", "medium", "tall"][normalized.height];
    const build = ["slender", "sturdy", "broad"][normalized.build];
    const beard = normalized.beard ? BEARDS[normalized.beard] + " beard" : null;
    return [
        SKIN[normalized.skin].label + " skin",
        HAIR[normalized.hairColor].label + " " + HAIR_STYLES[normalized.hair] + " hair",
        EYES[normalized.eyes].label + " eyes",
        height + ", " + build + " build",
        OUTFITS[normalized.outfit].label,
        ACCESSORIES[normalized.accessory].label === "none" ? null : ACCESSORIES[normalized.accessory].label,
        beard
    ].filter(Boolean).join(" · ");
}

export function appearanceSwatches(appearance) {
    const normalized = normalizeAppearance(appearance, "appearance-swatches");
    return [
        { label: "skin", color: SKIN[normalized.skin].color },
        { label: "hair", color: HAIR[normalized.hairColor].color },
        { label: "eyes", color: EYES[normalized.eyes].color },
        { label: "outfit", color: OUTFITS[normalized.outfit].color },
        { label: "accent", color: OUTFITS[normalized.outfit].accent }
    ];
}

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
}

function hairShape(style, color, shade) {
    if (style === 0) return '<path d="M82 105 Q128 72 174 105 L166 122 Q128 98 90 122Z" fill="' + color + '"/>';
    if (style === 2) return '<path d="M80 111 Q128 68 176 111 L168 130 Q128 102 88 130Z" fill="' + color + '"/><path d="M78 118 Q60 172 74 207 Q88 184 88 130Z" fill="' + shade + '"/>';
    if (style === 3) return '<path d="M76 112 Q128 64 180 112 L172 178 Q128 146 84 178Z" fill="' + color + '"/>';
    if (style === 4) return '<path d="M79 110 Q104 73 128 76 Q152 73 177 110 Q154 94 128 96 Q102 94 79 110Z" fill="' + color + '"/><circle cx="91" cy="122" r="13" fill="' + shade + '"/><circle cx="165" cy="122" r="13" fill="' + shade + '"/>';
    if (style === 5) return '<path d="M78 105 Q128 64 178 105 L168 120 Q128 92 88 120Z" fill="' + color + '"/>';
    return '<path d="M84 106 Q128 76 172 106 L166 116 Q128 94 90 116Z" fill="' + color + '"/>';
}

// A small, self-contained dossier portrait. The same numeric appearance drives
// the map sprite, so a resident remains recognisable from roster to street.
export function appearanceBustSvg(person, { className = "dossier-portrait", label = "Portrait" } = {}) {
    const appearance = normalizeAppearance(person?.appearance, person?.id || "portrait", {
        species: person?.species || "human", sex: person?.sex || "female", role: person?.role || "resident"
    });
    const colors = appearanceColors(appearance);
    const beard = appearance.beard
        ? '<path d="M103 191 Q128 226 153 191 Q148 214 128 218 Q108 214 103 191Z" fill="' + colors.hair + '" opacity=".78"/>'
        : "";
    const accessory = appearance.accessory === 1
        ? '<path d="M166 245 L198 259 L187 302 L158 293Z" fill="' + colors.accessory + '" stroke="#4a3424" stroke-width="3"/>'
        : appearance.accessory === 2
            ? '<path d="M88 267 Q128 287 168 267 L178 288 Q128 312 78 288Z" fill="' + colors.accessory + '"/>'
            : appearance.accessory === 3
                ? '<circle cx="128" cy="277" r="9" fill="' + colors.accessory + '" stroke="#574122" stroke-width="2"/>'
                : appearance.accessory === 4
                    ? '<path d="M184 126 Q213 100 224 121 Q207 140 188 142Z" fill="' + colors.accessory + '"/>'
                    : "";
    const shoulders = '<path d="M40 320 Q45 245 88 230 L112 246 L128 270 L144 246 L168 230 Q211 245 216 320Z" fill="' + colors.outfit + '"/>';
    return '<svg class="' + esc(className) + '" viewBox="0 0 256 320" role="img" aria-label="' + esc(label) + '">' +
        '<title>' + esc(label) + '</title>' +
        '<rect x="4" y="4" width="248" height="312" rx="18" fill="#e7d8b6" stroke="#9d7d4b" stroke-width="4"/>' +
        '<circle cx="128" cy="146" r="96" fill="#f1e6cc" opacity=".72"/>' +
        '<path d="M30 302 Q45 237 86 225 L106 239 L128 259 L150 239 L170 225 Q211 237 226 302Z" fill="' + colors.outfitShade + '"/>' +
        shoulders +
        '<path d="M110 230 L128 258 L146 230 L140 214 L116 214Z" fill="' + colors.outfitShade + '"/>' +
        '<path d="M111 207 L111 236 Q128 251 145 236 L145 207Z" fill="' + colors.skinShade + '"/>' +
        '<ellipse cx="128" cy="151" rx="49" ry="60" fill="' + colors.skin + '"/>' +
        '<ellipse cx="77" cy="154" rx="9" ry="15" fill="' + colors.skinShade + '"/>' +
        (person?.species === "elf" ? '<ellipse cx="179" cy="154" rx="8" ry="20" fill="' + colors.skin + '" transform="rotate(-14 179 154)"/>' : '<ellipse cx="179" cy="154" rx="9" ry="15" fill="' + colors.skinShade + '"/>') +
        hairShape(appearance.hair, colors.hair, colors.hair === "#b7b3a8" ? "#8f8a7e" : colors.hair) +
        '<path d="M100 146 Q110 139 120 146 M136 146 Q146 139 156 146" stroke="#3e2c23" stroke-width="4" fill="none" stroke-linecap="round"/>' +
        '<circle cx="108" cy="160" r="4" fill="' + colors.eyes + '"/><circle cx="148" cy="160" r="4" fill="' + colors.eyes + '"/>' +
        '<path d="M128 159 L124 178 L132 179" stroke="' + colors.skinShade + '" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<path d="M112 193 Q128 204 144 193" stroke="#7b4038" stroke-width="4" fill="none" stroke-linecap="round"/>' +
        beard +
        '<path d="M54 294 Q128 323 202 294" stroke="' + colors.accent + '" stroke-width="6" fill="none"/>' +
        '<path d="M77 278 Q128 297 179 278" stroke="' + colors.accent + '" stroke-width="3" fill="none"/>' +
        accessory +
        '</svg>';
}
