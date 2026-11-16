// Swamp and bog detail layer (spec 1.2.11.1–1.2.11.81).
//
// The baked terrain carries the broad wet-ground colour. This layer supplies
// what makes a wetland legible: peat and mud, open water with reflection and
// bubbles, reeds and sedges moving in the wind, moss carpets, water lilies,
// plant islands, mist, insect clouds and a bounded glimpse of the fauna. Every
// value comes from the deterministic swamp profile; every loop is capped so a
// low-end device pays only for visible detail.

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

function colour(value, fallback) {
    return typeof value === "string" && value.startsWith("#") ? value : fallback;
}

function hash(value, seed) {
    return ((Math.imul((value | 0) + 1, 0x9e3779b1) ^ Math.imul((seed | 0) + 1, 0x85ebca6b)) >>> 0) / 0x100000000;
}

function drawWetGround(ctx, px, py, cellPx, s, profile, roll, tick) {
    const visual = profile.visual || {};
    const water = profile.water || {};
    const density = profile.vegetation?.densityOverlay || null;
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = colour(visual.groundHex, "#4d4935");
    ctx.beginPath();
    ctx.ellipse(px + cellPx * 0.04, py + cellPx * 0.1, cellPx * 0.24, cellPx * 0.11, roll * 0.4, 0, Math.PI * 2);
    ctx.fill();
    // Peat is fibrous, not a smooth mud pat. A few dark strands read as the
    // accumulated root and moss remains underfoot.
    if (profile.soil?.peat > 0.34) {
        ctx.globalAlpha = 0.24;
        ctx.strokeStyle = "#3d3a2a";
        ctx.lineWidth = Math.max(0.35, 0.45 * s);
        for (let index = 0; index < 3; index++) {
            const x = px + (hash(index + 7, Math.floor(px * 3 + py)) - 0.5) * cellPx * 0.3;
            const y = py + cellPx * (0.06 + index * 0.035);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.quadraticCurveTo(x + 2 * s, y + 1.2 * s, x + 4.5 * s, y + 0.6 * s);
            ctx.stroke();
        }
    }
    // Bare mud is a real surface in the wetland profile, not merely a tile that
    // happens to have few reeds. It sits under the water layer so a channel or
    // pool still reads as water when both flags meet.
    if (density && Number(density.structure?.mud) > 0.3 && !density.openWater) {
        const mud = clamp01(density.structure.mud);
        ctx.globalAlpha = 0.18 + mud * 0.2;
        ctx.fillStyle = "#554d37";
        ctx.beginPath();
        ctx.ellipse(px + (roll - 0.5) * cellPx * 0.08, py + cellPx * 0.12,
            cellPx * (0.18 + mud * 0.08), cellPx * (0.07 + mud * 0.025), roll * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }
    if (water.standingWater) {
        const depth = clamp01(water.depth);
        const channel = Boolean(density?.channel) || Boolean(water.channel);
        const open = Boolean(density?.openWater);
        const width = cellPx * (channel ? 0.13 + roll * 0.04 : open ? 0.3 + roll * 0.08 : 0.22 + roll * 0.1);
        const waterHex = colour(visual.waterHex, depth > 0.5 ? "#263a38" : "#41554a");
        ctx.globalAlpha = channel ? 0.7 : 0.58;
        ctx.fillStyle = waterHex;
        ctx.beginPath();
        ctx.ellipse(px + cellPx * (channel ? 0.02 : 0.02), py + cellPx * 0.11,
            width, width * (channel ? 0.24 : 0.42), channel ? 0.03 : roll * 0.2, 0, Math.PI * 2);
        ctx.fill();
        // Reflection: a broken pale band on the still side of the pool.
        if (water.reflection > 0.24) {
            ctx.globalAlpha = 0.28;
            ctx.strokeStyle = "#bcc8ae";
            ctx.lineWidth = Math.max(0.4, 0.5 * s);
            ctx.beginPath();
            ctx.ellipse(px + cellPx * 0.01, py + cellPx * 0.085, width * 0.68, width * 0.2, roll * 0.2, Math.PI * 0.08, Math.PI * 0.92);
            ctx.stroke();
        }
        // Bubbles are small, deterministic and animate upward only within a
        // shallow band; no per-tile particle object is created.
        if (visual.bubbles > 0.2 && cellPx >= 24) {
            const bubbles = 1 + Math.floor(visual.bubbles * 3);
            ctx.fillStyle = "#cfdccb";
            for (let index = 0; index < bubbles; index++) {
                const bx = px + (hash(index + 11, Math.floor(px + py)) - 0.5) * width * 1.2;
                const drift = Math.sin((Number(tick) || 0) * 0.002 + index) * 0.8 * s;
                ctx.globalAlpha = 0.16 + (index % 2) * 0.08;
                ctx.beginPath();
                ctx.arc(bx + drift, py + cellPx * (0.11 + (index % 3) * 0.015), Math.max(0.5, 0.85 * s), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

function drawReeds(ctx, px, py, cellPx, s, profile, roll, tick, fineDetail = true) {
    const reeds = profile.vegetation?.reeds || [];
    const sedges = profile.vegetation?.sedges || [];
    if (!reeds.length && !sedges.length) return;
    const swayAmount = clamp01(profile.visual?.reedSway);
    const sway = Math.sin((Number(tick) || 0) * 0.0015 + px * 0.09 + py * 0.07) * (1.2 + swayAmount * 2.6) * s;
    const stem = colour(profile.visual?.reedHex, "#7f8a55");
    const density = profile.vegetation?.densityOverlay;
    // A free channel is water, not a corridor with reeds standing in it. Both
    // flags are derived by the density layer and already reach the survey.
    if (density?.openWater || density?.channel) return;
    const densityReed = Math.max(0, Math.min(1, Number(density?.reed) || 0));
    const count = Math.max(1, Math.min(fineDetail ? 9 : 4,
        Math.round((2 + reeds.length + sedges.length * 2) * (0.55 + densityReed * 0.8))));
    ctx.lineWidth = Math.max(0.4, 0.55 * s);
    for (let index = 0; index < count; index++) {
        const sedge = index % 2 === 1 && sedges.length;
        const source = sedge ? sedges[(index >> 1) % sedges.length] : reeds[index % Math.max(1, reeds.length)];
        if (!source) continue;
        const height = (sedge ? 6 : 12) * s * (0.58 + roll * 0.5);
        const x = px + (index - count / 2) * cellPx * 0.052 + (roll - 0.5) * cellPx * 0.08;
        const y = py + cellPx * 0.14;
        ctx.globalAlpha = 0.42 + roll * 0.2;
        ctx.strokeStyle = sedge ? "#7f8457" : stem;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + sway * 0.25, y - height * 0.5, x + sway * (0.5 + swayAmount * 0.5), y - height);
        ctx.stroke();
        if (!sedge && cellPx > 18) {
            ctx.globalAlpha = 0.34;
            ctx.fillStyle = source.id === "cattail" ? "#6e5238" : "#a9a16a";
            ctx.beginPath();
            ctx.ellipse(x + sway * 0.42, y - height * 0.86, 0.9 * s, 2.2 * s, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function drawMossAndLilies(ctx, px, py, cellPx, s, profile, roll) {
    const mosses = profile.vegetation?.mosses || [];
    const waterPlants = profile.vegetation?.waterPlants || [];
    if (mosses.length) {
        ctx.globalAlpha = 0.26;
        ctx.fillStyle = colour(profile.visual?.mossHex, "#62764f");
        ctx.beginPath();
        ctx.ellipse(px - cellPx * 0.12, py + cellPx * 0.12, cellPx * 0.15, cellPx * 0.07, roll * 0.5, 0, Math.PI * 2);
        ctx.ellipse(px + cellPx * 0.14, py + cellPx * 0.08, cellPx * 0.11, cellPx * 0.055, -roll * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }
    if (waterPlants.some(entry => entry.id === "water-lily") && profile.water?.standingWater) {
        const count = 2 + Math.floor(roll * 2);
        for (let index = 0; index < count; index++) {
            const x = px + (hash(index + 20, Math.floor(px + py)) - 0.5) * cellPx * 0.3;
            const y = py + cellPx * (0.1 + (index % 2) * 0.04);
            ctx.globalAlpha = 0.38;
            ctx.fillStyle = "#5f7d52";
            ctx.beginPath();
            ctx.ellipse(x, y, cellPx * 0.045, cellPx * 0.023, index * 0.4, 0, Math.PI * 2);
            ctx.fill();
            if (profile.vegetation?.bloom > 0.3 && index === 0) {
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = "#e4dfc4";
                ctx.beginPath();
                ctx.arc(x, y - 0.8 * s, 1.1 * s, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    // Plant islands: a dense floating raft, drawn as two overlapping lobes so
    // it reads as vegetation rather than a pond outline.
    if (profile.vegetation?.plantIslands > 0.3) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#536b48";
        ctx.beginPath();
        ctx.ellipse(px + cellPx * 0.05, py + cellPx * 0.13, cellPx * 0.13, cellPx * 0.06, roll * 0.3, 0, Math.PI * 2);
        ctx.ellipse(px - cellPx * 0.03, py + cellPx * 0.16, cellPx * 0.09, cellPx * 0.045, -roll * 0.2, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawSwampFlowers(ctx, px, py, cellPx, s, profile, roll) {
    const flowers = profile.vegetation?.flowers || [];
    if (!flowers.length || profile.vegetation?.bloom < 0.1) return;
    for (let index = 0; index < Math.min(3, flowers.length); index++) {
        const flower = flowers[index];
        const x = px + (hash(index + 31, Math.floor(px + py)) - 0.5) * cellPx * 0.42;
        const y = py + cellPx * (0.05 + index * 0.035);
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = colour(flower?.colours?.[0], "#d4b64d");
        ctx.beginPath();
        ctx.arc(x, y, 1.2 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = "#6d7c4b";
        ctx.lineWidth = Math.max(0.35, 0.4 * s);
        ctx.beginPath();
        ctx.moveTo(x, y + 1.1 * s);
        ctx.lineTo(x, y + 4.2 * s);
        ctx.stroke();
    }
}

function drawMist(ctx, px, py, cellPx, s, profile, roll) {
    const fog = clamp01(profile.visual?.fog);
    const mist = clamp01(profile.visual?.mist);
    if (fog < 0.14 && mist < 0.14) return;
    ctx.globalAlpha = Math.min(0.2, fog * 0.2 + mist * 0.08);
    ctx.fillStyle = colour(profile.visual?.fogHex, "#b9c4b7");
    ctx.beginPath();
    ctx.ellipse(px, py + cellPx * 0.03, cellPx * 0.29, cellPx * (0.08 + roll * 0.04), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = Math.min(0.15, fog * 0.12);
    ctx.strokeStyle = "#d5ddd0";
    ctx.lineWidth = Math.max(0.4, 0.5 * s);
    ctx.beginPath();
    ctx.moveTo(px - cellPx * 0.25, py + cellPx * 0.08);
    ctx.quadraticCurveTo(px, py - cellPx * 0.01, px + cellPx * 0.25, py + cellPx * 0.07);
    ctx.stroke();
}

function drawInsects(ctx, px, py, cellPx, s, profile, tick) {
    const swarms = clamp01(profile.hazards?.insectSwarms);
    if (swarms < 0.24 || cellPx < 20) return;
    const count = 2 + Math.floor(swarms * 4);
    ctx.globalAlpha = 0.22 + swarms * 0.14;
    ctx.fillStyle = "#4d4a39";
    const time = Number(tick) || 0;
    for (let index = 0; index < count; index++) {
        const x = px + Math.sin(time * 0.0017 + index * 1.7) * cellPx * 0.18;
        const y = py - cellPx * 0.02 + Math.cos(time * 0.0021 + index * 1.3) * cellPx * 0.1;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.4, 0.55 * s), 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawFauna(ctx, px, py, cellPx, s, profile, roll, tick) {
    const fauna = profile.fauna || [];
    if (!fauna.length || cellPx < 16) return;
    const time = Number(tick) || 0;
    ctx.globalAlpha = 0.34;
    for (let index = 0; index < Math.min(3, fauna.length); index++) {
        const entry = fauna[index];
        const x = px + (hash(index + 41, Math.floor(px + py)) - 0.5) * cellPx * 0.5;
        const y = py + cellPx * 0.08 + (index - 1) * cellPx * 0.035;
        ctx.fillStyle = entry.group === "bird" ? "#e2dfcd" : entry.group === "fish" ? "#6f8578" : "#5a5a3f";
        if (entry.group === "bird") {
            const flap = Math.sin(time * 0.004 + index) * 2.2 * s;
            ctx.beginPath();
            ctx.moveTo(x - 3 * s, y);
            ctx.quadraticCurveTo(x - 1 * s, y - flap, x, y);
            ctx.quadraticCurveTo(x + 1 * s, y - flap, x + 3 * s, y);
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = Math.max(0.5, 0.65 * s);
            ctx.stroke();
        } else if (entry.group === "fish") {
            ctx.globalAlpha = 0.22;
            ctx.beginPath();
            ctx.ellipse(x, y + cellPx * 0.04, 1.8 * s, 0.55 * s, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (entry.group === "insect") {
            ctx.beginPath();
            ctx.arc(x, y - cellPx * 0.03, 0.6 * s, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.ellipse(x, y, 1.4 * s, 0.7 * s, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 0.34;
    }
    if (fauna.some(entry => entry.id === "otter" || entry.id === "beaver")) {
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = "#c8d3c1";
        ctx.lineWidth = Math.max(0.4, 0.5 * s);
        ctx.beginPath();
        ctx.ellipse(px, py + cellPx * 0.14, cellPx * 0.18, cellPx * 0.04, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function drawLightMood(ctx, px, py, cellPx, profile, sun) {
    const visual = profile.visual || {};
    const shaded = visual.lightMood === "shaded";
    const light = Math.max(0, Math.min(1, Number(shaded ? visual.closedLight : visual.openLight) || Number(sun) || 0.5));
    ctx.globalAlpha = shaded ? 0.13 - light * 0.06 : 0.035 + light * 0.05;
    ctx.fillStyle = shaded ? "#263a2d" : "#e8e4ba";
    ctx.beginPath();
    ctx.ellipse(px, py + cellPx * 0.08, cellPx * 0.31, cellPx * 0.19, 0, 0, Math.PI * 2);
    ctx.fill();
}

function drawWorks(ctx, px, py, cellPx, s, profile, roll) {
    const use = profile.use || {};
    if (use.boardwalk) {
        ctx.globalAlpha = 0.72;
        ctx.strokeStyle = "#7c6646";
        ctx.lineWidth = Math.max(0.7, 1.05 * s);
        for (let index = 0; index < 5; index++) {
            const y = py + cellPx * (0.02 + index * 0.052);
            ctx.beginPath();
            ctx.moveTo(px - cellPx * 0.27, y);
            ctx.lineTo(px + cellPx * 0.27, y + cellPx * 0.012);
            ctx.stroke();
        }
        ctx.globalAlpha = 0.34;
        ctx.strokeStyle = "#4b3f2e";
        ctx.lineWidth = Math.max(0.5, 0.7 * s);
        for (const x of [-0.24, 0.24]) {
            ctx.beginPath();
            ctx.moveTo(px + cellPx * x, py - cellPx * 0.02);
            ctx.lineTo(px + cellPx * x, py + cellPx * 0.25);
            ctx.stroke();
        }
    }
    if (use.drained) {
        ctx.globalAlpha = 0.38;
        ctx.strokeStyle = "#3f5148";
        ctx.lineWidth = Math.max(0.6, 0.9 * s);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.3, py + cellPx * (0.19 + roll * 0.05));
        ctx.quadraticCurveTo(px, py + cellPx * 0.14, px + cellPx * 0.31, py + cellPx * 0.2);
        ctx.stroke();
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = "#b7c4af";
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.29, py + cellPx * 0.205);
        ctx.quadraticCurveTo(px, py + cellPx * 0.155, px + cellPx * 0.3, py + cellPx * 0.215);
        ctx.stroke();
    }
    if (use.peatCut) {
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = "#3c3022";
        for (let index = 0; index < 3; index++) {
            ctx.fillRect(px + cellPx * (-0.2 + index * 0.13), py + cellPx * (0.18 + (index % 2) * 0.035), cellPx * 0.1, cellPx * 0.045);
        }
    }
    if (use.fished) {
        ctx.globalAlpha = 0.48;
        ctx.strokeStyle = "#6d5a3d";
        ctx.lineWidth = Math.max(0.5, 0.7 * s);
        for (let index = 0; index < 3; index++) {
            const x = px + cellPx * (-0.16 + index * 0.12);
            ctx.beginPath();
            ctx.moveTo(x, py + cellPx * 0.12);
            ctx.lineTo(x, py + cellPx * 0.03);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, py + cellPx * 0.145, cellPx * 0.025, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    if (use.reedsCut) {
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = "#8b8758";
        ctx.lineWidth = Math.max(0.4, 0.55 * s);
        for (let index = 0; index < 6; index++) {
            const x = px + cellPx * (-0.22 + index * 0.085);
            ctx.beginPath();
            ctx.moveTo(x, py + cellPx * 0.18);
            ctx.lineTo(x + (index % 2 ? 1 : -1) * 1.2 * s, py + cellPx * 0.12);
            ctx.stroke();
        }
    }
    if (use.bridged) {
        ctx.globalAlpha = 0.62;
        ctx.strokeStyle = "#8a704a";
        ctx.lineWidth = Math.max(0.8, 1.1 * s);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.28, py + cellPx * 0.08);
        ctx.quadraticCurveTo(px, py + cellPx * 0.03, px + cellPx * 0.28, py + cellPx * 0.09);
        ctx.stroke();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = "#4b3b28";
        ctx.lineWidth = Math.max(0.4, 0.6 * s);
        for (let index = -2; index <= 2; index++) {
            const x = px + cellPx * index * 0.09;
            ctx.beginPath();
            ctx.moveTo(x, py + cellPx * 0.02);
            ctx.lineTo(x, py + cellPx * 0.13);
            ctx.stroke();
        }
    }
    if (use.defended) {
        ctx.globalAlpha = 0.44;
        ctx.strokeStyle = "#7f774d";
        ctx.lineWidth = Math.max(0.5, 0.7 * s);
        for (let index = 0; index < 8; index++) {
            const x = px + cellPx * (-0.26 + index * 0.075);
            ctx.beginPath();
            ctx.moveTo(x, py + cellPx * 0.16);
            ctx.lineTo(x + 0.8 * s, py - cellPx * 0.02);
            ctx.stroke();
        }
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#4e4930";
        ctx.fillRect(px - cellPx * 0.28, py + cellPx * 0.15, cellPx * 0.56, cellPx * 0.025);
    }
    if (use.surveyed) {
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = "#d7c990";
        ctx.lineWidth = Math.max(0.35, 0.5 * s);
        ctx.beginPath();
        ctx.moveTo(px + cellPx * 0.18, py + cellPx * 0.13);
        ctx.lineTo(px + cellPx * 0.26, py - cellPx * 0.02);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px + cellPx * 0.26, py - cellPx * 0.03, 0.9 * s, 0, Math.PI * 2);
        ctx.stroke();
    }
    if (use.settled) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#8a6f4d";
        ctx.fillRect(px - cellPx * 0.1, py + cellPx * 0.015, cellPx * 0.2, cellPx * 0.115);
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = "#3d3021";
        ctx.lineWidth = Math.max(0.4, 0.6 * s);
        ctx.strokeRect(px - cellPx * 0.1, py + cellPx * 0.015, cellPx * 0.2, cellPx * 0.115);
    }
}

/**
 * Draw one swamp tile. The function is safe with a null profile, and every
 * loop has a hard cap so the detail layer stays within the terrain budget.
 */
export function drawSwamp(ctx, px, py, cellPx, profile, s1 = 0.5, s2 = 0.5, s3 = 0.5, tick = 0, zoom = 1, sun = 0.6, dayOfYear = 150, climate = "swamp") {
    if (!ctx || !profile?.swamp || !(cellPx > 0)) return;
    const s = cellPx / 48;
    const roll = clamp01((Number(s1) || 0) * 0.55 + (Number(s2) || 0) * 0.3 + (Number(s3) || 0) * 0.15);
    // At the shipped 70% low-end scale a tile is only ~23 px wide. Keep the
    // water, ground, works, reeds and fauna that carry the wetland read, but
    // drop the sub-pixel flower heads and swarm dots instead of spending a
    // path per dot on every tile in the viewport.
    const fineDetail = cellPx >= 24 && Number(zoom) >= 0.62;
    ctx.save();
    drawWetGround(ctx, px, py, cellPx, s, profile, roll, tick);
    drawWorks(ctx, px, py, cellPx, s, profile, roll);
    if (fineDetail) drawMossAndLilies(ctx, px, py, cellPx, s, profile, roll);
    drawReeds(ctx, px, py, cellPx, s, profile, roll, tick, fineDetail);
    if (fineDetail) drawSwampFlowers(ctx, px, py, cellPx, s, profile, roll);
    if (fineDetail) drawMist(ctx, px, py, cellPx, s, profile, roll);
    drawLightMood(ctx, px, py, cellPx, profile, sun);
    if (fineDetail) drawInsects(ctx, px, py, cellPx, s, profile, tick);
    drawFauna(ctx, px, py, cellPx, s, profile, roll, tick);
    ctx.restore();
}

/**
 * Alder, willow, bog birch, floodplain oak or mangrove. Wetland trees are
 * drawn with a mossy lower trunk and a narrow, airy crown so they never read
 * as the closed broadleaf canopy of dry forest.
 */
export function drawSwampTree(ctx, px, py, cellPx, tree, profile, roll = 0.5) {
    if (!ctx || !tree || !(cellPx > 0)) return;
    const s = cellPx / 48;
    const leaf = colour(tree.seasonColour, colour(profile?.visual?.leafHex, "#557a4b"));
    const x = px + (Number(tree.offsetX) || 0) * cellPx;
    const y = py + (Number(tree.offsetY) || 0) * cellPx + 3 * s;
    const height = cellPx * (0.19 + (Number(tree.scale) || 0.8) * 0.14);
    const mangrove = tree.kind === "mangrove";
    const bark = tree.mossy ? "#4f5742" : "#625844";
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = bark;
    ctx.lineWidth = Math.max(0.9, 1.25 * s);
    ctx.beginPath();
    if (mangrove) {
        // Stilt roots are the mangrove's unmistakable silhouette.
        for (let root = -2; root <= 2; root++) {
            ctx.moveTo(x + root * 1.5 * s, y);
            ctx.quadraticCurveTo(x + root * 1.1 * s, y - height * 0.18, x, y - height * 0.38);
        }
    } else {
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - 0.7 * s, y - height * 0.42, x - 0.25 * s, y - height * 0.72);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.66;
    ctx.strokeStyle = bark;
    ctx.beginPath();
    ctx.moveTo(x - 0.2 * s, y - height * 0.55);
    ctx.lineTo(x - 2.2 * s, y - height * 0.8);
    ctx.moveTo(x - 0.1 * s, y - height * 0.62);
    ctx.lineTo(x + 1.9 * s, y - height * 0.84);
    ctx.stroke();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = leaf;
    ctx.beginPath();
    ctx.ellipse(x - cellPx * 0.06, y - height * 0.82, cellPx * 0.13, cellPx * 0.095, -0.12, 0, Math.PI * 2);
    ctx.ellipse(x + cellPx * 0.06, y - height * 0.78, cellPx * 0.115, cellPx * 0.085, 0.16, 0, Math.PI * 2);
    ctx.fill();
    // Moss on the trunk: a green sleeve around the base, not a green tree.
    if (tree.mossy) {
        ctx.globalAlpha = 0.24;
        ctx.strokeStyle = "#6f7d4e";
        ctx.lineWidth = Math.max(0.5, 0.8 * s);
        ctx.beginPath();
        ctx.moveTo(x - 0.5 * s, y - height * 0.04);
        ctx.lineTo(x - 0.5 * s, y - height * 0.34);
        ctx.stroke();
    }
    if (tree.flowering) {
        ctx.globalAlpha = 0.32;
        ctx.fillStyle = "#ded6a6";
        ctx.beginPath();
        ctx.arc(x - 2.1 * s, y - height * 0.86, 0.75 * s, 0, Math.PI * 2);
        ctx.arc(x + 1.7 * s, y - height * 0.82, 0.65 * s, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
