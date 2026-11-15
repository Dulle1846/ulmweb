// Mountain detail layer (spec 1.2.12.1–1.2.12.77).
//
// The baked terrain carries the broad height colour. This layer supplies the
// readable mountain: rock strata and scree, snow and ice, springs and tarns,
// krummholz, alpine flowers, animals and the works built by the realm. Every
// loop is capped and every roll is deterministic, so a low-end frame pays for
// the visible slope only.

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

function colour(value, fallback) {
    return typeof value === "string" && value.startsWith("#") ? value : fallback;
}

function hash(value, seed) {
    return ((Math.imul((value | 0) + 1, 0x9e3779b1) ^ Math.imul((seed | 0) + 1, 0x85ebca6b)) >>> 0) / 0x100000000;
}

function drawRockGround(ctx, px, py, cellPx, s, profile, roll) {
    const land = profile.landform || {};
    const visual = profile.visual || {};
    const rock = clamp01(land.rock);
    const snow = clamp01(visual.snow);
    const scree = clamp01(land.scree);
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = colour(visual.groundHex, "#77756a");
    ctx.beginPath();
    ctx.ellipse(px + cellPx * 0.03, py + cellPx * 0.09, cellPx * 0.27, cellPx * 0.12, roll * 0.3, 0, Math.PI * 2);
    ctx.fill();
    if (rock > 0.18) {
        ctx.globalAlpha = 0.26;
        ctx.fillStyle = colour(visual.rockHex, "#8b8175");
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.2, py + cellPx * 0.16);
        ctx.lineTo(px - cellPx * 0.06, py + cellPx * (0.02 + roll * 0.04));
        ctx.lineTo(px + cellPx * 0.12, py + cellPx * 0.06);
        ctx.lineTo(px + cellPx * 0.23, py + cellPx * 0.16);
        ctx.closePath();
        ctx.fill();
        // Bedding planes and cracks are what separate a rock face from a grey
        // polygon. Keep the lines long and sparse enough to read at 24 px.
        ctx.globalAlpha = 0.24;
        ctx.strokeStyle = land.rockType === "slate" ? "#3f4a4d" : "#5f5b52";
        ctx.lineWidth = Math.max(0.4, 0.55 * s);
        const planes = Math.min(3, 1 + Math.floor(rock * 3));
        for (let index = 0; index < planes; index++) {
            const y = py + cellPx * (0.05 + index * 0.045);
            ctx.beginPath();
            ctx.moveTo(px - cellPx * 0.17, y + 1.4 * s);
            ctx.quadraticCurveTo(px, y - 1.2 * s, px + cellPx * 0.2, y + 0.6 * s);
            ctx.stroke();
        }
        if (land.cliff > 0.44) {
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = "#4d4841";
            ctx.lineWidth = Math.max(0.45, 0.7 * s);
            ctx.beginPath();
            ctx.moveTo(px + cellPx * (0.1 - roll * 0.06), py + cellPx * 0.02);
            ctx.lineTo(px + cellPx * (0.15 + roll * 0.05), py + cellPx * 0.17);
            ctx.stroke();
        }
    }
    if (scree > 0.22 && cellPx >= 18) {
        const stones = Math.min(5, 2 + Math.floor(scree * 4));
        ctx.fillStyle = "#6b675e";
        for (let index = 0; index < stones; index++) {
            const x = px + (hash(index + 5, Math.floor(px + py)) - 0.5) * cellPx * 0.44;
            const y = py + cellPx * (0.08 + (index % 3) * 0.035);
            ctx.globalAlpha = 0.28;
            ctx.beginPath();
            ctx.ellipse(x, y, (1 + (index % 2)) * s, 0.7 * s, index * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (snow > 0.24) {
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = colour(visual.snowHex, "#e4e7e2");
        ctx.beginPath();
        ctx.ellipse(px + cellPx * 0.02, py + cellPx * 0.02, cellPx * 0.24, cellPx * (0.06 + snow * 0.04), roll * 0.2, 0, Math.PI * 2);
        ctx.fill();
        if (snow > 0.55) {
            ctx.globalAlpha = 0.26;
            ctx.fillStyle = "#f1f3ed";
            ctx.beginPath();
            ctx.ellipse(px - cellPx * 0.08, py + cellPx * 0.01, cellPx * 0.11, cellPx * 0.035, -0.2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (clamp01(visual.ice) > 0.28) {
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = colour(visual.iceHex, "#b9d2d5");
        ctx.beginPath();
        ctx.ellipse(px + cellPx * 0.05, py + cellPx * 0.12, cellPx * 0.16, cellPx * 0.055, roll * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawWater(ctx, px, py, cellPx, s, profile, roll, tick) {
    const water = profile.water || {};
    const visual = profile.visual || {};
    if (water.lake > 0.42) {
        const width = cellPx * (0.12 + water.lake * 0.1);
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = colour(visual.waterHex, "#55777a");
        ctx.beginPath();
        ctx.ellipse(px, py + cellPx * 0.11, width, width * 0.38, roll * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.24;
        ctx.strokeStyle = "#b9c9bd";
        ctx.lineWidth = Math.max(0.4, 0.45 * s);
        ctx.beginPath();
        ctx.ellipse(px, py + cellPx * 0.1, width * 0.68, width * 0.16, roll * 0.2, Math.PI * 0.1, Math.PI * 0.9);
        ctx.stroke();
    }
    if (water.stream > 0.3 || water.meltwater > 0.24) {
        ctx.globalAlpha = 0.32;
        ctx.strokeStyle = water.glacier > 0.4 ? "#a9c8c7" : "#6f8c87";
        ctx.lineWidth = Math.max(0.5, 0.8 * s);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.22, py + cellPx * (0.04 + roll * 0.06));
        ctx.bezierCurveTo(px - cellPx * 0.08, py + cellPx * 0.1, px + cellPx * 0.06, py + cellPx * 0.02, px + cellPx * 0.22, py + cellPx * 0.12);
        ctx.stroke();
    }
    if (water.waterfall > 0.4 && cellPx >= 20) {
        ctx.globalAlpha = 0.34;
        ctx.strokeStyle = "#d6e3df";
        ctx.lineWidth = Math.max(0.6, 1.1 * s);
        const fall = Math.sin((Number(tick) || 0) * 0.002 + roll * 5) * 0.8 * s;
        ctx.beginPath();
        ctx.moveTo(px + cellPx * 0.06, py + cellPx * 0.01);
        ctx.lineTo(px + cellPx * 0.04 + fall, py + cellPx * 0.16);
        ctx.stroke();
    }
    if (water.frozenFalls > 0.5) {
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = "#c9e0e2";
        ctx.beginPath();
        ctx.ellipse(px + cellPx * 0.04, py + cellPx * 0.1, 1.2 * s, cellPx * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    if (water.glacier > 0.46) {
        ctx.globalAlpha = 0.24;
        ctx.strokeStyle = "#cce1e2";
        ctx.lineWidth = Math.max(0.5, 0.8 * s);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.2, py + cellPx * 0.03);
        ctx.quadraticCurveTo(px, py + cellPx * 0.08, px + cellPx * 0.2, py + cellPx * 0.02);
        ctx.stroke();
    }
}

function drawAlpineFlora(ctx, px, py, cellPx, s, profile, roll) {
    const vegetation = profile.vegetation || {};
    const fine = cellPx >= 24;
    if (vegetation.krummholz > 0.22) {
        ctx.globalAlpha = 0.32;
        ctx.strokeStyle = "#4e684c";
        ctx.lineWidth = Math.max(0.4, 0.55 * s);
        const count = fine ? Math.min(4, 1 + Math.floor(vegetation.krummholz * 3)) : 1;
        for (let index = 0; index < count; index++) {
            const x = px + (hash(index + 17, Math.floor(px + py)) - 0.5) * cellPx * 0.38;
            const y = py + cellPx * (0.09 + index * 0.018);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - 2 * s, y - 4 * s);
            ctx.moveTo(x, y);
            ctx.lineTo(x + 2.2 * s, y - 3.4 * s);
            ctx.stroke();
        }
    }
    if (fine && vegetation.grasses?.length) {
        ctx.globalAlpha = 0.32;
        ctx.strokeStyle = colour(profile.visual?.grassHex, "#7d8a63");
        ctx.lineWidth = Math.max(0.35, 0.45 * s);
        for (let index = 0; index < 3; index++) {
            const x = px + (index - 1) * cellPx * 0.06 + (roll - 0.5) * cellPx * 0.05;
            const y = py + cellPx * 0.14;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + (roll - 0.5) * 2 * s, y - 4 * s);
            ctx.stroke();
        }
    }
    if (fine && vegetation.flowers?.length && vegetation.bloom > 0.18) {
        for (let index = 0; index < Math.min(3, vegetation.flowers.length); index++) {
            const flower = vegetation.flowers[index];
            const x = px + (hash(index + 31, Math.floor(px + py)) - 0.5) * cellPx * 0.4;
            const y = py + cellPx * (0.08 + index * 0.026);
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = colour(flower.colours?.[0], "#d4c77d");
            ctx.beginPath();
            ctx.arc(x, y, 1.1 * s, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (fine && vegetation.mosses?.length) {
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = "#89906d";
        ctx.beginPath();
        ctx.ellipse(px - cellPx * 0.1, py + cellPx * 0.13, cellPx * 0.1, cellPx * 0.04, 0.2, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawWorks(ctx, px, py, cellPx, s, profile, roll) {
    const use = profile.use || {};
    if (use.road) {
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = "#a99369";
        ctx.lineWidth = Math.max(0.6, 1.2 * s);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.2, py + cellPx * 0.15);
        ctx.bezierCurveTo(px - cellPx * 0.05, py + cellPx * 0.08, px + cellPx * 0.04, py + cellPx * 0.13, px + cellPx * 0.2, py + cellPx * 0.05);
        ctx.stroke();
    }
    if (use.bridge && profile.landform?.gorge > 0.4) {
        ctx.globalAlpha = 0.38;
        ctx.strokeStyle = "#8b6b45";
        ctx.lineWidth = Math.max(0.8, 1.4 * s);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.16, py + cellPx * 0.1);
        ctx.quadraticCurveTo(px, py + cellPx * 0.04, px + cellPx * 0.16, py + cellPx * 0.1);
        ctx.stroke();
        ctx.strokeStyle = "#59452f";
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.14, py + cellPx * 0.12);
        ctx.lineTo(px - cellPx * 0.14, py + cellPx * 0.16);
        ctx.moveTo(px + cellPx * 0.14, py + cellPx * 0.12);
        ctx.lineTo(px + cellPx * 0.14, py + cellPx * 0.16);
        ctx.stroke();
    }
    if (use.terraced) {
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = "#a59b7f";
        ctx.lineWidth = Math.max(0.4, 0.55 * s);
        for (let index = 0; index < 3; index++) {
            const y = py + cellPx * (0.06 + index * 0.03);
            ctx.beginPath();
            ctx.moveTo(px - cellPx * 0.2, y);
            ctx.lineTo(px + cellPx * 0.16, y + 1.2 * s);
            ctx.stroke();
        }
    }
    if (use.fortress || use.valleySettlement) {
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = use.fortress ? "#766d5e" : "#8c7d63";
        const width = cellPx * (use.fortress ? 0.1 : 0.07);
        ctx.fillRect(px + cellPx * 0.03, py + cellPx * 0.05, width, width * 0.9);
        ctx.fillStyle = "#5e564a";
        ctx.fillRect(px + cellPx * 0.03 + width * 0.25, py + cellPx * 0.02, width * 0.5, width * 0.35);
    }
    if (use.fortifiedPass) {
        ctx.globalAlpha = 0.38;
        ctx.strokeStyle = "#8d8370";
        ctx.lineWidth = Math.max(0.7, 1 * s);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.12, py + cellPx * 0.08);
        ctx.lineTo(px - cellPx * 0.12, py + cellPx * 0.17);
        ctx.moveTo(px + cellPx * 0.12, py + cellPx * 0.08);
        ctx.lineTo(px + cellPx * 0.12, py + cellPx * 0.17);
        ctx.stroke();
    }
    if (use.mine) {
        ctx.globalAlpha = 0.44;
        ctx.fillStyle = "#3f3b33";
        ctx.beginPath();
        ctx.ellipse(px + cellPx * 0.04, py + cellPx * 0.1, cellPx * 0.055, cellPx * 0.065, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#6d5a3e";
        ctx.fillRect(px + cellPx * 0.02, py + cellPx * 0.09, cellPx * 0.006, cellPx * 0.06);
    }
    if (use.quarry) {
        ctx.globalAlpha = 0.38;
        ctx.fillStyle = "#ada38f";
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.06, py + cellPx * 0.16);
        ctx.lineTo(px - cellPx * 0.01, py + cellPx * 0.08);
        ctx.lineTo(px + cellPx * 0.1, py + cellPx * 0.1);
        ctx.lineTo(px + cellPx * 0.07, py + cellPx * 0.16);
        ctx.closePath();
        ctx.fill();
    }
    if (use.aqueduct) {
        ctx.globalAlpha = 0.32;
        ctx.strokeStyle = "#9aa39a";
        ctx.lineWidth = Math.max(0.5, 0.7 * s);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.18, py + cellPx * 0.12);
        ctx.lineTo(px + cellPx * 0.18, py + cellPx * 0.08);
        ctx.stroke();
    }
}

function drawFauna(ctx, px, py, cellPx, s, profile, tick) {
    const fauna = profile.fauna || [];
    if (!fauna.length || cellPx < 18) return;
    const time = Number(tick) || 0;
    ctx.globalAlpha = 0.3;
    for (let index = 0; index < Math.min(3, fauna.length); index++) {
        const entry = fauna[index];
        const x = px + (hash(index + 41, Math.floor(px + py)) - 0.5) * cellPx * 0.52;
        const y = py + cellPx * (0.06 + index * 0.028);
        if (entry.group === "bird") {
            const flap = Math.sin(time * 0.003 + index) * 2.2 * s;
            ctx.strokeStyle = "#d8ddd2";
            ctx.lineWidth = Math.max(0.5, 0.65 * s);
            ctx.beginPath();
            ctx.moveTo(x - 3 * s, y);
            ctx.quadraticCurveTo(x - s, y - flap, x, y);
            ctx.quadraticCurveTo(x + s, y - flap, x + 3 * s, y);
            ctx.stroke();
        } else {
            ctx.fillStyle = entry.group === "goat" ? "#6d6758" : "#5d5b4c";
            ctx.beginPath();
            ctx.ellipse(x, y, 1.5 * s, 0.7 * s, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

/** Draw one mountain tile with capped, deterministic detail. */
export function drawMountain(ctx, px, py, cellPx, profile, s1 = 0.5, s2 = 0.5, s3 = 0.5, tick = 0, zoom = 1, sun = 0.6, dayOfYear = 150, climate = "mountain") {
    if (!ctx || !profile?.mountain || !(cellPx > 0)) return;
    const s = cellPx / 48;
    const roll = clamp01((Number(s1) || 0) * 0.55 + (Number(s2) || 0) * 0.3 + (Number(s3) || 0) * 0.15);
    const fineDetail = cellPx >= 24 && Number(zoom) >= 0.62;
    ctx.save();
    drawRockGround(ctx, px, py, cellPx, s, profile, roll);
    drawWorks(ctx, px, py, cellPx, s, profile, roll);
    drawWater(ctx, px, py, cellPx, s, profile, roll, tick);
    if (fineDetail) drawAlpineFlora(ctx, px, py, cellPx, s, profile, roll);
    if (fineDetail) drawFauna(ctx, px, py, cellPx, s, profile, tick);
    // A cold, bright snowfield reads differently from a shaded cliff; this is
    // a tiny local wash, not a second lighting pass.
    if (profile.visual?.lightMood === "snow-bright") {
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = "#f2f3e9";
        ctx.fillRect(px - cellPx * 0.2, py - cellPx * 0.04, cellPx * 0.4, cellPx * 0.2);
    } else if (profile.visual?.lightMood === "stone-shadow") {
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = "#384248";
        ctx.fillRect(px - cellPx * 0.2, py + cellPx * 0.02, cellPx * 0.4, cellPx * 0.14);
    }
    ctx.restore();
}

/** Draw one mountain tree: conifer spire or small broadleaf, capped. */
export function drawMountainTree(ctx, px, py, cellPx, tree, profile, roll = 0.5) {
    if (!ctx || !tree || !(cellPx > 0)) return;
    const s = cellPx / 48;
    const leaf = colour(tree.seasonColour, colour(profile?.visual?.grassHex, "#54704d"));
    const x = px + (Number(tree.offsetX) || 0) * cellPx;
    const y = py + (Number(tree.offsetY) || 0) * cellPx + 3 * s;
    const height = cellPx * (0.22 + (Number(tree.scale) || 0.8) * 0.15);
    const width = height * (tree.kind === "conifer" ? 0.32 : 0.4);
    ctx.save();
    ctx.globalAlpha = 0.74;
    ctx.strokeStyle = "#4a3d2d";
    ctx.lineWidth = Math.max(0.5, 0.8 * s);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - height * 0.62);
    ctx.stroke();
    ctx.fillStyle = leaf;
    if (tree.kind === "conifer") {
        const tiers = 4;
        for (let tier = 0; tier < tiers; tier++) {
            const t = tier / tiers;
            const tierY = y - height * (0.25 + t * 0.62);
            const tierWidth = width * (1 - t * 0.5);
            ctx.beginPath();
            ctx.moveTo(x - tierWidth, tierY);
            ctx.lineTo(x, tierY - height * 0.22);
            ctx.lineTo(x + tierWidth, tierY);
            ctx.closePath();
            ctx.fill();
        }
    } else {
        ctx.beginPath();
        ctx.ellipse(x, y - height * 0.66, width * 0.8, height * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    if (tree.snowy) {
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = "#e5e9e2";
        ctx.beginPath();
        ctx.ellipse(x, y - height * 0.8, width * 0.62, height * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
