// Tundra detail layer (spec 1.2.9.1–1.2.9.48).
//
// The baked terrain supplies the broad cold-ground colour. This layer adds what
// makes tundra readable: moss and lichen mats, frost polygons and cracks,
// hummocks, shallow pools and ice, dwarf shrubs, low grasses, tiny willow and
// birch forms, spring flowers, snow patches, tracks and a bounded glimpse of
// wildlife. Every value comes from the deterministic tundra profile, and every
// loop has a hard cap so low-end devices pay only for visible detail.

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

function colour(value, fallback) {
    return typeof value === "string" && value.startsWith("#") ? value : fallback;
}

function hash(value, seed) {
    return ((Math.imul((value | 0) + 1, 0x9e3779b1) ^ Math.imul((seed | 0) + 1, 0x85ebca6b)) >>> 0) / 0x100000000;
}

function drawFrostPattern(ctx, px, py, cellPx, s, profile, roll) {
    const land = profile.landform || {};
    if (!land.frostPolygon && !land.frostCrack) return;
    const count = Math.max(0, Math.min(5, Number(land.polygonCount) || 0));
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "#6e746e";
    ctx.lineWidth = Math.max(0.55, 0.75 * s);
    ctx.beginPath();
    for (let index = 0; index < count; index++) {
        const radius = cellPx * (0.12 + index * 0.035);
        const angle = roll * 2 + index * 1.17;
        const x = px + Math.cos(angle) * radius;
        const y = py + Math.sin(angle) * radius * 0.5;
        ctx.moveTo(x - cellPx * 0.07, y);
        ctx.lineTo(x, y - cellPx * 0.035);
        ctx.lineTo(x + cellPx * 0.07, y);
        ctx.lineTo(x, y + cellPx * 0.035);
        ctx.closePath();
    }
    ctx.stroke();
    if (land.frostCrack) {
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = "#575e59";
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.3, py - cellPx * 0.02);
        ctx.lineTo(px - cellPx * 0.08, py + cellPx * 0.03);
        ctx.lineTo(px + cellPx * 0.03, py - cellPx * 0.035);
        ctx.lineTo(px + cellPx * 0.27, py + cellPx * 0.02);
        ctx.stroke();
    }
}

function drawMossAndLichen(ctx, px, py, cellPx, s, profile, roll) {
    const visual = profile.visual || {};
    const moss = colour(visual.mossHex, "#82926a");
    const lichen = colour(visual.lichenHex, "#c5c39d");
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = moss;
    ctx.beginPath();
    ctx.ellipse(px - cellPx * 0.11, py + cellPx * 0.06, cellPx * (0.22 + roll * 0.1), cellPx * 0.11, roll * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = lichen;
    ctx.beginPath();
    ctx.ellipse(px + cellPx * 0.16, py - cellPx * 0.03, cellPx * 0.14, cellPx * 0.075, -roll * 0.3, 0, Math.PI * 2);
    ctx.fill();
    // Two low hummocks read as the frost-heaved micro-relief.
    if (profile.landform?.hummock) {
        ctx.globalAlpha = 0.23;
        ctx.fillStyle = "#6c7464";
        ctx.beginPath();
        ctx.ellipse(px + cellPx * 0.06, py + cellPx * 0.09, cellPx * 0.1, cellPx * 0.055, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawPool(ctx, px, py, cellPx, profile, roll) {
    if (!profile.water?.shallowPool && !profile.water?.seasonalPool) return;
    const winter = profile.season === "winter" || profile.water?.frozen;
    const water = colour(profile.visual?.waterHex, winter ? "#c6d7dc" : "#557f8c");
    const width = cellPx * (0.18 + roll * 0.08);
    ctx.globalAlpha = winter ? 0.48 : 0.54;
    ctx.fillStyle = water;
    ctx.beginPath();
    ctx.ellipse(px - cellPx * 0.04, py + cellPx * 0.11, width, width * 0.38, roll * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = winter ? "#eef5f8" : "#9bc2c8";
    ctx.lineWidth = Math.max(0.4, 0.55);
    ctx.beginPath();
    ctx.ellipse(px - cellPx * 0.04, py + cellPx * 0.1, width * 0.68, width * 0.2, roll * 0.3, 0, Math.PI * 2);
    ctx.stroke();
}

function drawSedges(ctx, px, py, cellPx, s, profile, roll, tick) {
    const grasses = profile.vegetation?.grasses || [];
    if (!grasses.length) return;
    const grass = grasses[Math.floor(roll * grasses.length) % grasses.length];
    const base = colour(grass?.colours?.[0], profile.visual?.grassHex || "#99a06c");
    const tip = colour(grass?.colours?.[1], base);
    const sway = Math.sin((Number(tick) || 0) * 0.0017 + px * 0.13 + py * 0.07) * 1.1 * s;
    const height = (grass?.id === "cotton-sedge" ? 7 : 4.8) * s;
    ctx.globalAlpha = 0.54;
    ctx.strokeStyle = base;
    ctx.lineWidth = Math.max(0.5, 0.65 * s);
    ctx.beginPath();
    ctx.moveTo(px - cellPx * 0.11, py + cellPx * 0.12);
    ctx.quadraticCurveTo(px - cellPx * 0.1 + sway * 0.3, py - height * 0.5, px - cellPx * 0.13 + sway, py - height);
    ctx.moveTo(px - cellPx * 0.02, py + cellPx * 0.12);
    ctx.quadraticCurveTo(px + sway * 0.25, py - height * 0.4, px + sway * 0.7, py - height * 0.75);
    ctx.stroke();
    if (grass?.id === "cotton-sedge") {
        ctx.globalAlpha = 0.68;
        ctx.fillStyle = tip;
        ctx.beginPath();
        ctx.arc(px - cellPx * 0.13 + sway, py - height, 1.2 * s, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawDwarfShrub(ctx, px, py, cellPx, s, shrub, roll, snow) {
    const base = colour(shrub?.colours?.[0], "#778560");
    const light = colour(shrub?.colours?.[1], "#a6a97e");
    const y = py + cellPx * 0.08;
    const width = cellPx * (0.1 + roll * 0.05);
    ctx.globalAlpha = 0.58;
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse(px - width * 0.55, y - 2 * s, width, width * 0.45, -0.25, 0, Math.PI * 2);
    ctx.ellipse(px + width * 0.42, y - 3 * s, width * 0.8, width * 0.4, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.44;
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.ellipse(px - width * 0.2, y - 4 * s, width * 0.52, width * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    if (shrub?.id === "crowberry" && profileSeasonHasBerries(shrub, snow)) {
        ctx.globalAlpha = 0.66;
        ctx.fillStyle = "#3f4a42";
        ctx.beginPath();
        ctx.arc(px + width * 0.3, y - 3 * s, 0.85 * s, 0, Math.PI * 2);
        ctx.arc(px - width * 0.2, y - 5 * s, 0.75 * s, 0, Math.PI * 2);
        ctx.fill();
    }
    if (snow > 0.35) {
        ctx.globalAlpha = Math.min(0.72, snow * 0.66);
        ctx.fillStyle = "#edf3f6";
        ctx.beginPath();
        ctx.ellipse(px, y - 5.6 * s, width * 0.9, 1.2 * s, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

function profileSeasonHasBerries(shrub, snow) {
    return shrub?.id === "crowberry" && snow < 0.45;
}

function drawFlowers(ctx, px, py, cellPx, s, flowers, bloom, snow) {
    if (!flowers.length || bloom < 0.08 || snow > 0.4) return;
    const count = Math.min(2, flowers.length);
    for (let index = 0; index < count; index++) {
        const flower = flowers[index];
        const petal = colour(flower?.colours?.[0], "#d7c98a");
        const x = px + (index ? cellPx * 0.09 : -cellPx * 0.13);
        const y = py + cellPx * (index ? 0.02 : 0.06);
        ctx.globalAlpha = 0.62 + bloom * 0.14;
        ctx.strokeStyle = "#8a916c";
        ctx.lineWidth = Math.max(0.35, 0.45 * s);
        ctx.beginPath();
        ctx.moveTo(x, y + 2 * s);
        ctx.lineTo(x, y - 1.2 * s);
        ctx.stroke();
        ctx.fillStyle = petal;
        ctx.beginPath();
        ctx.arc(x, y - 1.6 * s, 0.9 * s, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawSnow(ctx, px, py, cellPx, profile, roll) {
    const snow = clamp01(profile.visual?.snowCover);
    if (snow < 0.22) return;
    ctx.globalAlpha = Math.min(0.62, snow * 0.58);
    ctx.fillStyle = "#eef4f7";
    ctx.beginPath();
    ctx.ellipse(px + cellPx * (roll - 0.5) * 0.12, py + cellPx * 0.06, cellPx * 0.22, cellPx * 0.09, roll * 0.2, 0, Math.PI * 2);
    ctx.fill();
}

function drawTracks(ctx, px, py, cellPx, s, profile, roll) {
    const fauna = profile.fauna || [];
    if (!fauna.length) return;
    const track = fauna.find(entry => entry.group === "herbivore" || entry.group === "predator");
    if (!track) return;
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = "#596158";
    ctx.beginPath();
    for (let index = 0; index < 3; index++) {
        const x = px - cellPx * 0.2 + index * cellPx * 0.11 + roll * cellPx * 0.03;
        const y = py + cellPx * 0.16 + (index % 2) * cellPx * 0.025;
        ctx.ellipse(x, y, 1.15 * s, 0.7 * s, 0.2, 0, Math.PI * 2);
    }
    ctx.fill();
}

function drawFauna(ctx, px, py, cellPx, s, profile, roll, tick) {
    const fauna = (profile.fauna || []).slice(0, 3);
    if (!fauna.length || cellPx < 22) return;
    for (let index = 0; index < fauna.length; index++) {
        const entry = fauna[index];
        const x = px + (hash(index + 90, Math.floor(px + py)) - 0.5) * cellPx * 0.56;
        const y = py - cellPx * 0.12 + (index % 2) * cellPx * 0.06;
        ctx.globalAlpha = entry.group === "herbivore" ? 0.34 : 0.28;
        ctx.fillStyle = entry.group === "predator" ? "#5b5d58" : "#6c6555";
        if (entry.group === "bird") {
            ctx.beginPath();
            ctx.ellipse(x, y, 1.5 * s, 0.8 * s, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - 2 * s, y - 1.5 * s);
            ctx.moveTo(x, y);
            ctx.lineTo(x + 2 * s, y - 1.5 * s);
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = Math.max(0.4, 0.55 * s);
            ctx.stroke();
        } else if (entry.herd) {
            const count = Math.min(4, Math.max(2, Math.round((Number(entry.count) || 2) / 2)));
            for (let animal = 0; animal < count; animal++) {
                const ax = x + (animal - count / 2) * 2.3 * s;
                const ay = y + (animal % 2) * 1.2 * s;
                ctx.beginPath();
                ctx.ellipse(ax, ay, 1.05 * s, 0.62 * s, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            ctx.beginPath();
            ctx.ellipse(x, y, 1.35 * s, 0.72 * s, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        if (entry.group === "insect") {
            ctx.globalAlpha = 0.22;
            ctx.fillStyle = "#5c6358";
            ctx.beginPath();
            ctx.arc(x + 2 * s + Math.sin((Number(tick) || 0) * 0.002 + index) * s, y - 3 * s, 0.6 * s, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

/**
 * Draw one tundra tile. The function is safe with a null profile and every
 * loop is capped; the maximum is far below the generic 650-call budget used by
 * the desert layer.
 */
export function drawTundra(ctx, px, py, cellPx, profile, s1 = 0.5, s2 = 0.5, s3 = 0.5, tick = 0, zoom = 1, sun = 0.6, dayOfYear = 150, climate = "tundra") {
    if (!ctx || !profile?.tundra || !(cellPx > 0)) return;
    const s = cellPx / 48;
    const roll = clamp01((Number(s1) || 0) * 0.55 + (Number(s2) || 0) * 0.3 + (Number(s3) || 0) * 0.15);
    const snow = clamp01(profile.visual?.snowCover);
    ctx.save();
    drawMossAndLichen(ctx, px, py, cellPx, s, profile, roll);
    drawFrostPattern(ctx, px, py, cellPx, s, profile, roll);
    drawPool(ctx, px, py, cellPx, profile, roll);
    drawSnow(ctx, px, py, cellPx, profile, roll);
    drawSedges(ctx, px, py, cellPx, s, profile, roll, tick);
    const shrubs = profile.vegetation?.shrubs || [];
    for (let index = 0; index < Math.min(2, shrubs.length); index++) {
        drawDwarfShrub(ctx, px + (index ? cellPx * 0.1 : -cellPx * 0.16), py + cellPx * (index ? 0.03 : 0.07), cellPx, s, shrubs[index], (roll + index * 0.27) % 1, snow);
    }
    drawFlowers(ctx, px, py, cellPx, s, profile.vegetation?.flowers || [], Number(profile.vegetation?.bloom) || 0, snow);
    drawTracks(ctx, px, py, cellPx, s, profile, roll);
    drawFauna(ctx, px, py, cellPx, s, profile, roll, tick);
    ctx.restore();
}

/**
 * Tiny willow or birch form. Height stays below 3 m by construction; nothing
 * here can draw the tall canopy that belongs to taiga and temperate forests.
 */
export function drawTundraTree(ctx, px, py, cellPx, tree, profile, roll = 0.5) {
    if (!ctx || !tree || !(cellPx > 0)) return;
    const s = cellPx / 48;
    const leaf = colour(tree.seasonColour, colour(profile?.visual?.leafHex, "#7d8d64"));
    const bark = tree.kind === "birch" ? "#b7b09c" : "#766c54";
    const height = cellPx * (0.07 + (Number(tree.scale) || 0.7) * 0.055);
    const x = px + (Number(tree.offsetX) || 0) * cellPx;
    const y = py + (Number(tree.offsetY) || 0) * cellPx + 4 * s;
    const snow = clamp01(profile?.visual?.snowCover);
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = bark;
    ctx.lineWidth = Math.max(0.6, 0.9 * s);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 1.4 * s, y - height * 0.74);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 1.8 * s, y - height * 0.64);
    if (tree.kind === "birch") {
        ctx.moveTo(x + 0.6 * s, y);
        ctx.lineTo(x + 2.4 * s, y - height * 0.86);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.56;
    ctx.fillStyle = leaf;
    ctx.beginPath();
    ctx.ellipse(x - 1.5 * s, y - height * 0.78, 3.2 * s, 2.2 * s, -0.25, 0, Math.PI * 2);
    ctx.ellipse(x + 1.8 * s, y - height * 0.7, 2.9 * s, 2 * s, 0.3, 0, Math.PI * 2);
    ctx.fill();
    if (snow > 0.2) {
        ctx.globalAlpha = Math.min(0.8, snow * 0.72);
        ctx.fillStyle = "#eef4f7";
        ctx.beginPath();
        ctx.ellipse(x - 1.3 * s, y - height * 0.93, 2.3 * s, 0.8 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 1.8 * s, y - height * 0.83, 2.1 * s, 0.7 * s, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
