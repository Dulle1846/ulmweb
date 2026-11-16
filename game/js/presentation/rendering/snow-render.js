// Snowland detail layer (spec 1.2.15.1–1.2.15.69).
//
// The baked terrain supplies the pale ground. This layer supplies the readable
// snow material: powder, packed crust, ice, drifts, exposed ground, tracks,
// frost, frozen water, snow-laden conifers, bare deciduous trees, buried
// shrubs, winter grasses, lichen, small animals and spring melt.
// Every loop is capped; this function runs only for explored detail tiles.

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

function colour(value, fallback) {
    return typeof value === "string" && value.startsWith("#") ? value : fallback;
}

function hash(value, seed) {
    return ((Math.imul((value | 0) + 1, 0x9e3779b1) ^ Math.imul((seed | 0) + 1, 0x85ebca6b)) >>> 0) / 0x100000000;
}

function drawSnowPatch(ctx, px, py, cellPx, profile, roll) {
    const surface = profile.surface || {};
    const snow = colour(profile.visual?.snowHex, "#eef4f7");
    const fresh = colour(profile.visual?.freshHex, "#f7fbfd");
    ctx.globalAlpha = 0.42 + clamp01(surface.coverage) * 0.24;
    ctx.fillStyle = surface.state === "powder" ? fresh : snow;
    ctx.beginPath();
    ctx.ellipse(px - cellPx * 0.08, py + cellPx * 0.08,
        cellPx * (0.22 + roll * 0.1), cellPx * 0.1, roll * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(px + cellPx * 0.14, py - cellPx * 0.05,
        cellPx * 0.14, cellPx * 0.055, -roll * 0.3, 0, Math.PI * 2);
    ctx.fill();

    if ((surface.exposed || 0) > 0.28) {
        ctx.globalAlpha = Math.min(0.55, surface.exposed * 0.6);
        ctx.fillStyle = colour(profile.visual?.groundHex, "#5b5d52");
        ctx.beginPath();
        ctx.ellipse(px + cellPx * (0.16 - roll * 0.12), py - cellPx * 0.01,
            cellPx * (0.07 + roll * 0.06), cellPx * 0.045, roll, 0, Math.PI * 2);
        ctx.fill();
    }
    if ((surface.icy || 0) > 0.3) {
        ctx.globalAlpha = Math.min(0.5, surface.icy * 0.55);
        ctx.strokeStyle = colour(profile.visual?.iceHex, "#a9c7d2");
        ctx.lineWidth = Math.max(0.45, 0.7);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.22, py + cellPx * 0.03);
        ctx.lineTo(px - cellPx * 0.03, py - cellPx * 0.035);
        ctx.lineTo(px + cellPx * 0.2, py + cellPx * 0.02);
        ctx.stroke();
    }
    if ((surface.drift || 0) > 0.32) {
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.ellipse(px + cellPx * 0.06, py - cellPx * 0.12,
            cellPx * (0.25 + roll * 0.12), cellPx * 0.06, 0.08, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawTracks(ctx, px, py, cellPx, s, profile, roll) {
    if ((profile.surface?.tracks || 0) < 0.2) return;
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = "#5b6470";
    ctx.beginPath();
    for (let index = 0; index < 3; index++) {
        const x = px - cellPx * 0.2 + index * cellPx * 0.1 + roll * cellPx * 0.04;
        const y = py + cellPx * 0.15 + (index % 2) * cellPx * 0.028;
        ctx.ellipse(x, y, 1.1 * s, 0.62 * s, 0.18, 0, Math.PI * 2);
    }
    ctx.fill();
}

function drawFrost(ctx, px, py, cellPx, s, profile, roll) {
    if ((profile.water?.frostPatterns || 0) < 0.28) return;
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = "#e8f4f7";
    ctx.lineWidth = Math.max(0.45, 0.6 * s);
    ctx.beginPath();
    const count = 3;
    for (let index = 0; index < count; index++) {
        const angle = roll * 2 + index * 1.4;
        const x = px + Math.cos(angle) * cellPx * 0.14;
        const y = py + Math.sin(angle) * cellPx * 0.06;
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle + 1.2) * cellPx * 0.07, y + Math.sin(angle + 1.2) * cellPx * 0.035);
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle - 1.2) * cellPx * 0.06, y + Math.sin(angle - 1.2) * cellPx * 0.03);
    }
    ctx.stroke();
}

function drawIceRock(ctx, px, py, cellPx, s, profile, roll) {
    if ((profile.landform?.rock || 0) < 0.28 && (profile.water?.icyRocks || 0) < 0.32) return;
    const rock = colour(profile.visual?.rockHex, "#747a78");
    const x = px + (roll - 0.5) * cellPx * 0.35;
    const y = py + cellPx * 0.08;
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = rock;
    ctx.beginPath();
    ctx.moveTo(x - cellPx * 0.09, y);
    ctx.lineTo(x - cellPx * 0.045, y - cellPx * 0.1);
    ctx.lineTo(x + cellPx * 0.04, y - cellPx * 0.07);
    ctx.lineTo(x + cellPx * 0.1, y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.52;
    ctx.fillStyle = "#eff7fa";
    ctx.beginPath();
    ctx.ellipse(x - cellPx * 0.005, y - cellPx * 0.09, cellPx * 0.055, cellPx * 0.025, -0.1, 0, Math.PI * 2);
    ctx.fill();
    if (profile.water?.icicles > 0.3) {
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = "#d9edf3";
        ctx.lineWidth = Math.max(0.4, 0.55 * s);
        ctx.beginPath();
        ctx.moveTo(x, y - cellPx * 0.03);
        ctx.lineTo(x, y + cellPx * 0.08);
        ctx.stroke();
    }
}

function drawSnowBankAtStructure(ctx, px, py, cellPx, profile, roll) {
    if ((profile.surface?.driftAtStructures || 0) < 0.26) return;
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#f3f8fa";
    ctx.beginPath();
    ctx.ellipse(px + cellPx * 0.18, py + cellPx * 0.16,
        cellPx * (0.12 + roll * 0.05), cellPx * 0.055, 0.2, 0, Math.PI * 2);
    ctx.fill();
}

/** Ground pass for a snow land tile. */
export function drawSnowGround(ctx, px, py, cellPx, profile, s1 = 0.5, s2 = 0.5, s3 = 0.5) {
    if (!ctx || !profile?.snow || profile.water?.lake || profile.water?.river || !(cellPx > 0)) return;
    const s = cellPx / 48;
    const roll = clamp01((Number(s1) || 0) * 0.55 + (Number(s2) || 0) * 0.3 + (Number(s3) || 0) * 0.15);
    ctx.save();
    drawSnowPatch(ctx, px, py, cellPx, profile, roll);
    drawFrost(ctx, px, py, cellPx, s, profile, roll);
    drawTracks(ctx, px, py, cellPx, s, profile, roll);
    drawIceRock(ctx, px, py, cellPx, s, profile, roll);
    drawSnowBankAtStructure(ctx, px, py, cellPx, profile, roll);
    ctx.restore();
}

/** Frozen lake, river and coastal ice. */
export function drawSnowWater(ctx, px, py, cellPx, profile, s1 = 0.5, s2 = 0.5, s3 = 0.5) {
    if (!ctx || !profile?.snow || !(cellPx > 0)) return;
    const s = cellPx / 48;
    const ice = clamp01(profile.water?.iceCover);
    if (ice < 0.22) return;
    const roll = clamp01((Number(s1) || 0) * 0.5 + (Number(s2) || 0) * 0.3 + (Number(s3) || 0) * 0.2);
    ctx.save();
    ctx.globalAlpha = 0.48 + ice * 0.24;
    ctx.fillStyle = colour(profile.visual?.waterHex, "#b7d2da");
    ctx.beginPath();
    ctx.ellipse(px, py + cellPx * 0.08, cellPx * 0.32, cellPx * 0.14, 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = "#e1eef2";
    ctx.lineWidth = Math.max(0.5, 0.7 * s);
    ctx.beginPath();
    ctx.moveTo(px - cellPx * 0.24, py + cellPx * 0.02);
    ctx.lineTo(px - cellPx * 0.06, py + cellPx * 0.08);
    ctx.lineTo(px + cellPx * 0.15, py - cellPx * 0.01);
    ctx.moveTo(px - cellPx * 0.02, py + cellPx * 0.1);
    ctx.lineTo(px + cellPx * 0.06, py + cellPx * 0.02);
    ctx.stroke();
    if ((profile.water?.breakup || 0) > 0.28) {
        ctx.globalAlpha = 0.38;
        ctx.fillStyle = "#4e7484";
        ctx.beginPath();
        ctx.ellipse(px + cellPx * (roll - 0.5) * 0.28, py + cellPx * 0.1,
            cellPx * 0.075, cellPx * 0.035, roll * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }
    if ((profile.water?.iceEdge || 0) > 0.35) {
        ctx.globalAlpha = 0.32;
        ctx.strokeStyle = "#f4fbfd";
        ctx.beginPath();
        ctx.ellipse(px, py + cellPx * 0.1, cellPx * 0.29, cellPx * 0.12, 0.05, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
}

/** One snow-laden conifer or bare deciduous tree. */
export function drawSnowTree(ctx, px, py, cellPx, tree, profile, roll = 0.5) {
    if (!ctx || !tree || !(cellPx > 0)) return;
    const s = (cellPx / 48) * (Number(tree.scale) || 1);
    const x = px + (Number(tree.offsetX) || 0) * cellPx;
    const y = py + (Number(tree.offsetY) || 0) * cellPx + 3 * s;
    const snow = clamp01(tree.snowLoad ?? profile?.visual?.snowLoad ?? 0.5);
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = "#4b3f34";
    ctx.lineWidth = Math.max(0.7, 1.05 * s);
    ctx.beginPath();
    ctx.moveTo(x, y + 2 * s);
    ctx.lineTo(x, y - 12 * s);
    ctx.stroke();
    if (tree.bare || tree.kind === "broadleaf") {
        ctx.strokeStyle = "#6d6254";
        ctx.lineWidth = Math.max(0.45, 0.7 * s);
        ctx.beginPath();
        ctx.moveTo(x, y - 9 * s);
        ctx.lineTo(x - 5 * s, y - 15 * s);
        ctx.moveTo(x, y - 10 * s);
        ctx.lineTo(x + 5 * s, y - 16 * s);
        ctx.moveTo(x, y - 7 * s);
        ctx.lineTo(x - 3 * s, y - 12 * s);
        ctx.stroke();
        ctx.globalAlpha = Math.min(0.8, snow * 0.75);
        ctx.strokeStyle = "#f1f8fb";
        ctx.lineWidth = Math.max(0.4, 0.6 * s);
        ctx.beginPath();
        ctx.moveTo(x - 5 * s, y - 15 * s);
        ctx.lineTo(x + 5 * s, y - 16 * s);
        ctx.stroke();
    } else {
        const green = colour(tree.seasonColour, "#45564a");
        for (let tier = 0; tier < 3; tier++) {
            const ty = y - (4 + tier * 4) * s;
            const width = (10 - tier * 2.2) * s;
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = green;
            ctx.beginPath();
            ctx.moveTo(x, ty - 7 * s);
            ctx.lineTo(x - width, ty + 5 * s);
            ctx.lineTo(x + width, ty + 5 * s);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = Math.min(0.88, snow * 0.9);
            ctx.fillStyle = "#f3f9fb";
            ctx.beginPath();
            ctx.ellipse(x, ty - 1 * s, width * 0.72, 1.6 * s, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

/** Shrubs, winter grass, lichen, fauna, icefalls and thaw detail. */
export function drawSnowDetails(ctx, px, py, cellPx, profile, s1 = 0.5, s2 = 0.5, s3 = 0.5, tick = 0, zoom = 1) {
    if (!ctx || !profile?.snow || !(cellPx > 0)) return;
    const s = cellPx / 48;
    const roll = clamp01((Number(s1) || 0) * 0.5 + (Number(s2) || 0) * 0.3 + (Number(s3) || 0) * 0.2);
    ctx.save();
    const shrubs = profile.vegetation?.shrubs || [];
    for (let index = 0; index < Math.min(2, shrubs.length); index++) {
        const x = px + (index ? cellPx * 0.1 : -cellPx * 0.12);
        const y = py + cellPx * 0.09;
        const shrub = shrubs[index];
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = colour(shrub?.colours?.[0], "#777b65");
        ctx.beginPath();
        ctx.ellipse(x, y, cellPx * 0.1, cellPx * 0.045, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = "#eef6f9";
        ctx.beginPath();
        ctx.ellipse(x, y - cellPx * 0.035, cellPx * 0.085, cellPx * 0.026, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    const grasses = profile.vegetation?.grasses || [];
    if (grasses.length) {
        const grass = grasses[0];
        const sway = Math.sin((Number(tick) || 0) * 0.0018 + px * 0.13 + py * 0.07) * 1.2 * s;
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = colour(grass?.colours?.[0], "#9b9674");
        ctx.lineWidth = Math.max(0.45, 0.6 * s);
        ctx.beginPath();
        for (let index = 0; index < 3; index++) {
            const gx = px - cellPx * 0.1 + index * cellPx * 0.09;
            const gy = py + cellPx * 0.13;
            ctx.moveTo(gx, gy);
            ctx.quadraticCurveTo(gx + sway * 0.4, gy - 4 * s, gx + sway, gy - 7 * s);
        }
        ctx.stroke();
    }
    const lichens = profile.vegetation?.lichens || [];
    if (lichens.length && (profile.surface?.exposed || 0) > 0.18) {
        ctx.globalAlpha = 0.36;
        ctx.fillStyle = colour(lichens[0]?.colours?.[0], "#c9c7ab");
        ctx.beginPath();
        ctx.ellipse(px + cellPx * 0.14, py + cellPx * 0.02, cellPx * 0.06, cellPx * 0.028, 0.2, 0, Math.PI * 2);
        ctx.fill();
    }
    if ((profile.water?.icefalls || 0) > 0.3) {
        ctx.globalAlpha = 0.32;
        ctx.strokeStyle = "#d9edf3";
        ctx.lineWidth = Math.max(0.45, 0.6 * s);
        ctx.beginPath();
        ctx.moveTo(px + cellPx * 0.12, py - cellPx * 0.08);
        ctx.lineTo(px + cellPx * 0.13, py + cellPx * 0.1);
        ctx.stroke();
    }
    const fauna = (profile.fauna || []).slice(0, 3);
    if (fauna.length && cellPx >= 20) {
        for (let index = 0; index < fauna.length; index++) {
            const entry = fauna[index];
            const x = px + (hash(index + 70, Math.floor(px + py)) - 0.5) * cellPx * 0.5;
            const y = py - cellPx * 0.06 + (index % 2) * cellPx * 0.05;
            ctx.globalAlpha = 0.32;
            ctx.fillStyle = entry.group === "predator" ? "#59615e" : entry.group === "bird" ? "#d8dedb" : "#716a58";
            if (entry.group === "bird") {
                ctx.beginPath();
                ctx.ellipse(x, y, 1.4 * s, 0.8 * s, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = ctx.fillStyle;
                ctx.lineWidth = Math.max(0.4, 0.5 * s);
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x - 2 * s, y - 1.4 * s);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.ellipse(x, y, 1.3 * s, 0.65 * s, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    if ((profile.thaw?.meltwaterLakes || 0) > 0.32) {
        ctx.globalAlpha = 0.26;
        ctx.fillStyle = "#5f8795";
        ctx.beginPath();
        ctx.ellipse(px - cellPx * 0.02, py + cellPx * 0.1, cellPx * 0.13, cellPx * 0.04, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
