// Read-only renderer for the rare biome atlas. The ground tint is baked into
// the terrain surface at world start; this layer adds the handful of discoverable
// landmarks that make a crystal field, glowing grove or cave mouth legible.
//
// The work is bounded by the visible regions and their 5–10 feature anchors.
// There is no tile scan and no per-frame allocation of large objects.
import { state } from "../../core/state.js";
import { CELL } from "../../core/config.js";

const TAU = Math.PI * 2;

function hashFeature(feature, salt = 0) {
    const value = Math.sin(feature.x * 12.9898 + feature.y * 78.233 + salt * 37.719) * 43758.5453;
    return value - Math.floor(value);
}

function exploredAt(x, y) {
    return Boolean(state.explored?.[Math.floor(x)]?.[Math.floor(y)]);
}

function glow(ctx, x, y, radius, color, alpha = 0.2) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
    ctx.restore();
}

function drawCrystal(ctx, x, y, s, color, light) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = light;
    ctx.lineWidth = Math.max(0.6, s * 0.045);
    ctx.beginPath();
    ctx.moveTo(x, y - s * 1.45);
    ctx.lineTo(x + s * 0.46, y - s * 0.18);
    ctx.lineTo(x + s * 0.24, y + s * 0.72);
    ctx.lineTo(x - s * 0.28, y + s * 0.55);
    ctx.lineTo(x - s * 0.43, y - s * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 1.42);
    ctx.lineTo(x + s * 0.12, y - s * 0.12);
    ctx.lineTo(x - s * 0.08, y + s * 0.52);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawTree(ctx, x, y, s, color, light, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#4b382b";
    ctx.lineWidth = Math.max(1, s * 0.13);
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.lineTo(x, y - s * 0.9);
    ctx.moveTo(x, y - s * 0.2);
    ctx.lineTo(x - s * 0.55, y - s * 0.6);
    ctx.moveTo(x, y - s * 0.35);
    ctx.lineTo(x + s * 0.55, y - s * 0.82);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x - s * 0.3, y - s * 0.92, s * 0.62, 0, TAU);
    ctx.arc(x + s * 0.3, y - s * 1.08, s * 0.54, 0, TAU);
    ctx.arc(x, y - s * 1.35, s * 0.58, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(x - s * 0.12, y - s * 0.95, s * 0.24, 0, TAU);
    ctx.fill();
    ctx.restore();
}

function drawMushroom(ctx, x, y, s, color, light, giant = false) {
    ctx.save();
    ctx.fillStyle = "#e7d8b3";
    ctx.strokeStyle = "#5c4260";
    ctx.lineWidth = Math.max(0.6, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.2, y + s * 0.75);
    ctx.lineTo(x - s * 0.1, y - s * 0.23);
    ctx.lineTo(x + s * 0.12, y - s * 0.23);
    ctx.lineTo(x + s * 0.24, y + s * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.34, s * (giant ? 1.25 : 0.92), s * (giant ? 0.63 : 0.44), 0, Math.PI, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = light;
    for (const [dx, dy, radius] of [[-0.44, -0.4, 0.12], [0.32, -0.52, 0.1], [0.02, -0.24, 0.08]]) {
        ctx.beginPath();
        ctx.arc(x + dx * s, y + dy * s, radius * s, 0, TAU);
        ctx.fill();
    }
    ctx.restore();
}

function drawDeadwood(ctx, x, y, s, burned = false) {
    ctx.save();
    ctx.strokeStyle = burned ? "#211c1c" : "#5a4a38";
    ctx.lineWidth = Math.max(1, s * 0.12);
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.95);
    ctx.lineTo(x + s * 0.08, y - s * 1.05);
    ctx.moveTo(x + s * 0.05, y - s * 0.35);
    ctx.lineTo(x - s * 0.58, y - s * 0.72);
    ctx.moveTo(x + s * 0.08, y - s * 0.58);
    ctx.lineTo(x + s * 0.6, y - s * 0.9);
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = burned ? "#6f4a39" : "#8b7654";
    ctx.beginPath();
    ctx.moveTo(x - s * 0.45, y + s * 0.2);
    ctx.lineTo(x - s * 0.12, y + s * 0.05);
    ctx.moveTo(x + s * 0.15, y + s * 0.4);
    ctx.lineTo(x + s * 0.42, y + s * 0.21);
    ctx.stroke();
    ctx.restore();
}

function drawFog(ctx, x, y, s, color, tick, seed) {
    ctx.save();
    ctx.fillStyle = color;
    for (let i = 0; i < 3; i++) {
        const phase = tick * 0.00035 + seed * TAU + i * 1.8;
        ctx.globalAlpha = 0.11 + i * 0.055;
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(phase) * s * 0.38, y - i * s * 0.16, s * (1.4 + i * 0.28), s * 0.48, 0, 0, TAU);
        ctx.fill();
    }
    ctx.restore();
}

function drawCave(ctx, x, y, s, color) {
    ctx.save();
    ctx.fillStyle = "#17181d";
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.95, s * 0.72, 0, Math.PI, TAU);
    ctx.lineTo(x + s * 0.95, y + s * 0.52);
    ctx.lineTo(x - s * 0.95, y + s * 0.52);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = Math.max(0.6, s * 0.05);
    ctx.beginPath();
    ctx.arc(x, y, s * 0.96, Math.PI, TAU);
    ctx.stroke();
    ctx.fillStyle = "#6bc6bd";
    ctx.globalAlpha = 0.7;
    for (const [dx, dy] of [[-0.5, 0.1], [0.46, 0.22], [0.05, -0.05]]) {
        ctx.beginPath();
        ctx.arc(x + dx * s, y + dy * s, s * 0.045, 0, TAU);
        ctx.fill();
    }
    ctx.restore();
}

function drawFloatingRock(ctx, x, y, s, color, tick, seed) {
    const bob = Math.sin(tick * 0.001 + seed * TAU) * s * 0.12;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = "#514b5f";
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.7, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(-s * 0.85, 0.1 * s);
    ctx.lineTo(-s * 0.35, -s * 0.45);
    ctx.lineTo(s * 0.46, -s * 0.35);
    ctx.lineTo(s * 0.78, s * 0.16);
    ctx.lineTo(s * 0.12, s * 0.46);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, -s * 0.08, s * 0.12, 0, TAU);
    ctx.fill();
    ctx.restore();
}

function drawGlass(ctx, x, y, s, color, light) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.72;
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(x - s * 0.7 + i * s * 0.55, y + s * 0.22 + i * s * 0.1, s * 0.9, s * 0.28, -0.16, 0, TAU);
        ctx.fill();
    }
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = light;
    ctx.lineWidth = Math.max(0.5, s * 0.035);
    ctx.beginPath();
    ctx.moveTo(x - s * 1.1, y + s * 0.1);
    ctx.lineTo(x + s * 0.9, y - s * 0.25);
    ctx.stroke();
    ctx.restore();
}

function drawMoorLight(ctx, x, y, s, color, tick, seed) {
    const phase = tick * 0.0015 + seed * TAU;
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(x + Math.cos(phase) * s * 0.24, y - s * 0.85 + Math.sin(phase) * s * 0.16, s * 0.16, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(phase) * s * 0.24, y - s * 0.85 + Math.sin(phase) * s * 0.16, s * 0.5, 0, TAU);
    ctx.fill();
    ctx.restore();
}

function drawSpring(ctx, x, y, s, color, light) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.25, s * 0.82, s * 0.31, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = light;
    ctx.lineWidth = Math.max(0.5, s * 0.035);
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.25, s * 0.5, s * 0.17, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
}

function drawBeast(ctx, x, y, s, color, twisted = false) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.2, s * 0.65, s * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - s * 0.62, y - s * 0.05, s * 0.26, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = twisted ? "#f08a7e" : "#d8c49a";
    ctx.lineWidth = Math.max(0.8, s * 0.055);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.38, y + s * 0.42);
    ctx.lineTo(x - s * 0.48, y + s * 0.82);
    ctx.moveTo(x + s * 0.3, y + s * 0.42);
    ctx.lineTo(x + s * 0.42, y + s * 0.82);
    ctx.stroke();
    if (twisted) {
        ctx.fillStyle = "#f08a7e";
        ctx.beginPath();
        ctx.arc(x - s * 0.72, y - s * 0.1, s * 0.045, 0, TAU);
        ctx.fill();
    }
    ctx.restore();
}

function drawFeature(ctx, feature, region, cellPx, tick) {
    if (!exploredAt(feature.x, feature.y)) return;
    const x = feature.x * cellPx - state.camera.x;
    const y = feature.y * cellPx - state.camera.y;
    if (x < -cellPx * 4 || y < -cellPx * 4 || x > state.canvas.width + cellPx * 4 || y > state.canvas.height + cellPx * 4) return;
    const s = Math.max(2.2, cellPx * 0.62 * feature.scale);
    const seed = hashFeature(feature, 17);
    const kind = feature.kind;
    const color = region.accent;
    const light = region.glow;

    if (cellPx < 5) {
        glow(ctx, x, y - s * 0.2, s * 0.65, color, 0.25);
        return;
    }
    if (["glowtree", "prismleaf", "glade"].includes(kind)) {
        glow(ctx, x, y - s * 0.75, s * 1.3, light, 0.12);
        drawTree(ctx, x, y, s, kind === "prismleaf" ? color : "#7fb76b", light);
        if (kind === "glade") {
            ctx.save();
            ctx.strokeStyle = light;
            ctx.globalAlpha = 0.65;
            ctx.lineWidth = Math.max(0.6, s * 0.05);
            ctx.beginPath();
            ctx.arc(x, y + s * 0.35, s * 0.75, 0.15, Math.PI - 0.15);
            ctx.stroke();
            ctx.restore();
        }
        return;
    }
    if (["glowcap", "mushroom", "giant-mushroom", "fungal-colony", "healing-mushroom"].includes(kind)) {
        glow(ctx, x, y - s * 0.3, s * 1.1, light, 0.12);
        const giant = kind === "giant-mushroom";
        drawMushroom(ctx, x - s * (giant ? 0.2 : 0.42), y, s * (giant ? 1.15 : 0.72), color, light, giant);
        if (!giant) drawMushroom(ctx, x + s * 0.35, y + s * 0.12, s * 0.52, color, light, false);
        return;
    }
    if (["deadwood", "charred-tree", "underground-forest"].includes(kind)) {
        drawDeadwood(ctx, x, y, s, kind === "charred-tree");
        if (kind === "underground-forest") {
            drawTree(ctx, x + s * 0.55, y + s * 0.08, s * 0.5, "#5f9c89", light, 0.7);
        }
        return;
    }
    if (["crystal", "crystal-grove", "mineral-field", "glass-rock", "crystal-cave", "vein", "crystal-dune", "mineral-column", "gem", "crystal-peak", "mountain-vein", "mirror-rock"].includes(kind)) {
        glow(ctx, x, y - s * 0.4, s * 1.2, light, 0.14);
        drawCrystal(ctx, x, y, s, color, light);
        if (kind === "crystal-grove" || kind === "mineral-field") {
            drawCrystal(ctx, x - s * 0.55, y + s * 0.28, s * 0.55, color, light);
            drawCrystal(ctx, x + s * 0.5, y + s * 0.35, s * 0.45, color, light);
        }
        if (kind === "gem" || kind === "vein" || kind === "mountain-vein") {
            ctx.save();
            ctx.fillStyle = light;
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            ctx.arc(x + s * 0.25, y - s * 0.1, s * 0.09, 0, TAU);
            ctx.fill();
            ctx.restore();
        }
        return;
    }
    if (["mist", "unnatural-fog", "spore-cloud"].includes(kind)) {
        drawFog(ctx, x, y, s, kind === "spore-cloud" ? "#b785c7" : color, tick, seed);
        return;
    }
    if (["rot-pool", "underground-lake", "spring", "moor-spring"].includes(kind)) {
        drawSpring(ctx, x, y, s, kind === "rot-pool" ? "#3d4c2b" : color, light);
        if (kind === "rot-pool") drawFog(ctx, x, y - s * 0.2, s * 0.7, "#8aa26a", tick, seed);
        return;
    }
    if (["black-grass", "glowreed", "moor-herb", "fungal-carpet", "fungal-garden", "alpine-beast", "twisted-beast", "spreading-zone", "ash", "ashfall", "strange-rock", "ash-vein", "glass", "sharp-ground", "cave-mouth", "glowworm", "underground-river", "floating-rock", "mountain-spring", "strange-weather", "runestone", "moorlight", "hidden-island", "underground-forest"].includes(kind)) {
        if (kind === "cave-mouth") return drawCave(ctx, x, y, s, color);
        if (kind === "floating-rock") return drawFloatingRock(ctx, x, y, s, color, tick, seed);
        if (kind === "mountain-spring") return drawSpring(ctx, x, y, s, color, light);
        if (kind === "moorlight") return drawMoorLight(ctx, x, y, s, color, tick, seed);
        if (kind === "alpine-beast") return drawBeast(ctx, x, y, s, "#c7bfae");
        if (kind === "twisted-beast") return drawBeast(ctx, x, y, s, "#564f47", true);
        if (kind === "glass" || kind === "sharp-ground") return drawGlass(ctx, x, y, s, "#d7eee1", light);
        if (kind === "underground-lake") return drawSpring(ctx, x, y, s, "#325c68", "#8fd6c7");
        if (kind === "underground-river") {
            ctx.save();
            ctx.strokeStyle = "#73c8c7";
            ctx.globalAlpha = 0.65;
            ctx.lineWidth = Math.max(1, s * 0.13);
            ctx.beginPath();
            ctx.moveTo(x - s * 1.1, y - s * 0.2);
            ctx.bezierCurveTo(x - s * 0.2, y - s * 0.9, x + s * 0.2, y + s * 0.4, x + s * 1.1, y - s * 0.1);
            ctx.stroke();
            ctx.restore();
            return;
        }
        if (kind === "ash-vein") {
            ctx.save();
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.8;
            ctx.lineWidth = Math.max(1, s * 0.09);
            ctx.beginPath();
            ctx.moveTo(x - s * 0.95, y + s * 0.4);
            ctx.lineTo(x - s * 0.3, y - s * 0.15);
            ctx.lineTo(x + s * 0.1, y + s * 0.2);
            ctx.lineTo(x + s * 0.85, y - s * 0.55);
            ctx.stroke();
            ctx.restore();
            return;
        }
        if (kind === "strange-weather") {
            ctx.save();
            ctx.strokeStyle = light;
            ctx.globalAlpha = 0.7;
            ctx.lineWidth = Math.max(1, s * 0.07);
            ctx.beginPath();
            ctx.moveTo(x + s * 0.2, y - s * 1.2);
            ctx.lineTo(x - s * 0.25, y - s * 0.3);
            ctx.lineTo(x + s * 0.18, y - s * 0.3);
            ctx.lineTo(x - s * 0.2, y + s * 0.55);
            ctx.stroke();
            ctx.restore();
            return;
        }
        if (kind === "runestone") {
            ctx.save();
            ctx.fillStyle = "#625a5b";
            ctx.strokeStyle = light;
            ctx.lineWidth = Math.max(0.6, s * 0.05);
            ctx.beginPath();
            ctx.moveTo(x - s * 0.38, y + s * 0.8);
            ctx.lineTo(x - s * 0.28, y - s * 0.75);
            ctx.lineTo(x + s * 0.22, y - s * 0.95);
            ctx.lineTo(x + s * 0.4, y + s * 0.8);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.globalAlpha = 0.75;
            ctx.beginPath();
            ctx.moveTo(x - s * 0.02, y - s * 0.5);
            ctx.lineTo(x + s * 0.18, y - s * 0.2);
            ctx.lineTo(x - s * 0.12, y + s * 0.25);
            ctx.stroke();
            ctx.restore();
            return;
        }
        if (kind === "ashfall") {
            ctx.save();
            ctx.fillStyle = "#c9b8a0";
            ctx.globalAlpha = 0.45;
            for (let i = 0; i < 5; i++) {
                ctx.beginPath();
                ctx.arc(x + Math.sin(seed * TAU + i * 2.1) * s, y - s * (i * 0.24) + tick * 0.0002 * s, s * 0.045, 0, TAU);
                ctx.fill();
            }
            ctx.restore();
            return;
        }
        if (kind === "hidden-island") {
            ctx.save();
            ctx.fillStyle = "#59775f";
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            ctx.ellipse(x, y + s * 0.4, s * 0.9, s * 0.24, 0, 0, TAU);
            ctx.fill();
            ctx.restore();
            drawFog(ctx, x, y, s * 0.8, "#b7d8d0", tick, seed);
            return;
        }
        // grass, fungal carpet, ash and mineral seams share a small stem or
        // shard cluster; this keeps the rare region readable without sprites.
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = light;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = Math.max(0.6, s * 0.06);
        for (let i = 0; i < 4; i++) {
            const dx = (i - 1.5) * s * 0.24;
            ctx.beginPath();
            ctx.moveTo(x + dx, y + s * 0.55);
            ctx.lineTo(x + dx + Math.sin(seed * 9 + i) * s * 0.15, y - s * (0.15 + seed * 0.4));
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(x, y - s * 0.3, s * 0.08, 0, TAU);
        ctx.fill();
        ctx.restore();
        return;
    }
    // A future family feature must still leave a visible royal-survey mark.
    glow(ctx, x, y - s * 0.2, s * 0.55, color, 0.2);
}

export function drawSpecialBiomeOverlay(ctx, zoom, cam, canvas) {
    const current = state.specialBiomes;
    if (!ctx || !canvas || !current?.regions?.length) return;
    const cellPx = CELL * zoom;
    if (!(cellPx > 0)) return;
    const tick = Number(state.tick) || 0;
    for (const region of current.regions) {
        const centerX = region.x * cellPx - cam.x;
        const centerY = region.y * cellPx - cam.y;
        const span = Math.max(4, region.radius + region.transition) * cellPx;
        if (centerX < -span || centerY < -span || centerX > canvas.width + span || centerY > canvas.height + span) continue;
        if (region.discovered && !region.cleansed) {
            ctx.save();
            ctx.globalAlpha = region.family === "blighted-land" ? 0.08 : 0.035;
            ctx.fillStyle = region.accent;
            ctx.beginPath();
            ctx.ellipse(centerX, centerY, region.radius * cellPx, region.radius * cellPx * 0.72, 0, 0, TAU);
            ctx.fill();
            ctx.restore();
        }
        for (const feature of region.features) drawFeature(ctx, feature, region, cellPx, tick);
    }
}
