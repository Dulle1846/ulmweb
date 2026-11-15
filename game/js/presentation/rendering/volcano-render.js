// Volcanic detail layer (spec 1.2.13.1–1.2.13.73).
//
// The baked terrain carries the broad lava and ash colour. This layer supplies
// the readable volcano: cones, crater rims and calderas, open fissures, cooled
// flows, glowing cracks, steam, hot springs, sulfur, pioneer plants, animals
// and the works built by the realm. Every loop is capped and every roll comes
// from the deterministic profile, so a low-end frame pays for visible tiles
// only.

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

function colour(value, fallback) {
    return typeof value === "string" && value.startsWith("#") ? value : fallback;
}

function rgba(hex, alpha) {
    const value = colour(hex, "#000000").slice(1);
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`;
}

function poly(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let index = 1; index < points.length; index++) ctx.lineTo(points[index][0], points[index][1]);
    ctx.closePath();
    ctx.fill();
}

function drawLavaCrack(ctx, px, py, cellPx, s, profile, roll, index = 0) {
    const lava = profile.landform;
    const active = profile.climate.eruption;
    const glow = clamp01(lava.freshLava * 0.7 + lava.lavaFlow * 0.4 + active * 0.3);
    if (glow < 0.22) return;
    const x = px + (roll - 0.5) * cellPx * 0.5;
    const y = py + (0.18 + (index % 3) * 0.22) * cellPx;
    ctx.save();
    ctx.strokeStyle = rgba(profile.visual.lavaHex, 0.55 + glow * 0.3);
    ctx.lineWidth = Math.max(0.5, (0.7 + glow * 1.1) * s);
    ctx.beginPath();
    ctx.moveTo(x - cellPx * 0.2, y - cellPx * 0.08);
    ctx.lineTo(x - cellPx * 0.06, y + cellPx * 0.02);
    ctx.lineTo(x + cellPx * 0.08, y + cellPx * 0.11);
    ctx.lineTo(x + cellPx * 0.2, y + cellPx * 0.05);
    ctx.stroke();
    if (glow > 0.55) {
        ctx.strokeStyle = rgba(profile.visual.lavaCoreHex, 0.62);
        ctx.lineWidth = Math.max(0.35, 0.55 * s);
        ctx.stroke();
    }
    ctx.restore();
}

function drawCone(ctx, px, py, cellPx, s, profile, roll) {
    const land = profile.landform;
    const cone = land.cone;
    if (cone < 0.16) return;
    const baseY = py + cellPx * (0.54 + roll * 0.1);
    // A shield volcano is low and broad; an extinct cone is worn down and
    // rounded. Without these formation terms every cone shared one silhouette.
    const broad = profile.formation === "shield-volcano";
    const worn = profile.formation === "extinct-volcano";
    const height = cellPx * (0.28 + cone * 0.5) * (broad ? 0.58 : worn ? 0.52 : 1);
    const half = cellPx * (0.34 + cone * 0.2) * (broad ? 1.34 : worn ? 1.2 : 1);
    ctx.save();
    ctx.globalAlpha = 0.34 + cone * 0.22;
    ctx.fillStyle = colour(profile.visual.rockHex, "#5c5750");
    poly(ctx, [[px - half, baseY], [px - half * 0.18, baseY - height], [px + half * 0.12, baseY - height * 0.96], [px + half, baseY]]);
    // A darker windward flank gives the silhouette a readable key light.
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = "#242526";
    poly(ctx, [[px - half * 0.18, baseY - height], [px + half * 0.12, baseY - height * 0.96], [px + half, baseY], [px + cellPx * 0.03, baseY]]);
    // Summit crater or breach.
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = land.freshLava > 0.42 ? colour(profile.visual.lavaHex, "#b34321") : "#2d2b29";
    ctx.beginPath();
    ctx.ellipse(px + cellPx * (0.01 + (roll - 0.5) * 0.08), baseY - height * 0.94,
        cellPx * (0.07 + land.crater * 0.06), cellPx * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();
    if (worn) {
        // Two shallow erosion gullies and a breached rim read as age, not as a
        // fresh scoria cone with a different colour.
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = "#777064";
        ctx.lineWidth = Math.max(0.45, 0.7 * s);
        for (let index = 0; index < 2; index++) {
            const side = index === 0 ? -1 : 1;
            ctx.beginPath();
            ctx.moveTo(px + side * cellPx * 0.04, baseY - height * 0.9);
            ctx.quadraticCurveTo(px + side * cellPx * 0.11, baseY - height * 0.48,
                px + side * cellPx * (0.22 + roll * 0.04), baseY - cellPx * 0.02);
            ctx.stroke();
        }
    }
    if (land.lavaFlow > 0.36 && land.freshLava > 0.28) {
        ctx.globalAlpha = 0.56;
        ctx.strokeStyle = colour(profile.visual.lavaHex, "#b34321");
        ctx.lineWidth = Math.max(0.5, 0.8 * s);
        ctx.beginPath();
        ctx.moveTo(px + cellPx * 0.04, baseY - height * 0.9);
        ctx.quadraticCurveTo(px + cellPx * 0.18, baseY - height * 0.4, px + cellPx * (0.12 + roll * 0.2), baseY);
        ctx.stroke();
    }
    ctx.restore();
}

function drawCrater(ctx, px, py, cellPx, s, profile, roll) {
    const land = profile.landform;
    const depth = Math.max(land.crater, land.caldera);
    if (depth < 0.2) return;
    const radiusX = cellPx * (0.24 + depth * 0.24);
    const radiusY = cellPx * (0.11 + depth * 0.12);
    ctx.save();
    ctx.globalAlpha = 0.26 + depth * 0.2;
    ctx.fillStyle = "#1f2022";
    ctx.beginPath();
    ctx.ellipse(px + (roll - 0.5) * cellPx * 0.1, py + cellPx * 0.42, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.32 + depth * 0.26;
    ctx.strokeStyle = colour(profile.visual.rockHex, "#655f56");
    ctx.lineWidth = Math.max(0.6, 1.2 * s);
    ctx.beginPath();
    ctx.ellipse(px + (roll - 0.5) * cellPx * 0.1, py + cellPx * 0.39, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (land.freshLava > 0.3 || profile.climate.active) {
        ctx.globalAlpha = 0.48;
        ctx.fillStyle = colour(profile.visual.lavaHex, "#b34321");
        ctx.beginPath();
        ctx.ellipse(px, py + cellPx * 0.42, radiusX * 0.48, radiusY * 0.48, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawFissure(ctx, px, py, cellPx, s, profile, roll) {
    const strength = Math.max(profile.landform.fissure, profile.hazards.earthquake * 0.8);
    if (strength < 0.28) return;
    const fresh = profile.landform.freshLava > 0.25 || profile.climate.active;
    ctx.save();
    ctx.globalAlpha = 0.52;
    ctx.strokeStyle = fresh ? colour(profile.visual.lavaHex, "#b34321") : "#242526";
    ctx.lineWidth = Math.max(0.55, (0.8 + strength * 1.4) * s);
    ctx.beginPath();
    ctx.moveTo(px - cellPx * 0.38, py + cellPx * (0.2 + roll * 0.36));
    ctx.lineTo(px - cellPx * 0.13, py + cellPx * (0.33 + roll * 0.16));
    ctx.lineTo(px + cellPx * 0.12, py + cellPx * (0.27 + roll * 0.22));
    ctx.lineTo(px + cellPx * 0.38, py + cellPx * (0.4 + roll * 0.1));
    ctx.stroke();
    ctx.globalAlpha = 0.26;
    ctx.beginPath();
    ctx.moveTo(px - cellPx * 0.08, py + cellPx * 0.32);
    ctx.lineTo(px + cellPx * 0.02, py + cellPx * 0.13);
    ctx.stroke();
    ctx.restore();
}

function drawLavaField(ctx, px, py, cellPx, s, profile, roll, s2 = 0.5, s3 = 0.5) {
    const lava = profile.landform;
    if (lava.freshLava < 0.2 && lava.oldLava < 0.3 && lava.lavaFlow < 0.42) return;
    if (roll > 0.54) return;
    ctx.save();
    ctx.globalAlpha = 0.11 + lava.freshLava * 0.13;
    // The profile's baked ground colour carries fresh black, rust, grey and
    // ochre lava. Using it here makes requirement 18 visible instead of
    // reducing every cooled field to the same grey patch.
    ctx.fillStyle = lava.freshLava > 0.45 ? colour(profile.visual.groundHex, "#1c1c1f")
        : lava.oldLava > 0.5 ? "#4d4a42" : "#3f403e";
    // Broken clinker, not a perfect pool. Four uneven corners keep the flow
    // texture from stamping the same oval onto every tile.
    poly(ctx, [
        [px - cellPx * (0.28 + roll * 0.08), py + cellPx * 0.38],
        [px - cellPx * 0.2, py + cellPx * (0.28 + s2 * 0.06)],
        [px + cellPx * (0.12 + s3 * 0.08), py + cellPx * 0.31],
        [px + cellPx * (0.32 + roll * 0.06), py + cellPx * 0.44],
        [px + cellPx * 0.12, py + cellPx * 0.52],
        [px - cellPx * 0.18, py + cellPx * 0.51],
    ]);
    if (lava.brokenRock > 0.35) {
        ctx.globalAlpha = 0.24;
        ctx.strokeStyle = lava.oldLava > 0.5 ? "#727469" : "#292a2c";
        ctx.lineWidth = Math.max(0.4, 0.6 * s);
        for (let index = 0; index < 3; index++) {
            const x = px + (index - 1) * cellPx * 0.2;
            const y = py + cellPx * (0.3 + ((index + roll) % 3) * 0.1);
            ctx.beginPath();
            ctx.moveTo(x - cellPx * 0.09, y);
            ctx.lineTo(x + cellPx * 0.09, y + cellPx * 0.04);
            ctx.stroke();
        }
    }
    ctx.restore();
}


// A dark, heat-cracked patch that says the rock itself is hot. It is separate
// from the lava crack: hot rock can occur without an open flow.
function drawHotRock(ctx, px, py, cellPx, s, profile, roll) {
    const land = profile.landform;
    if (land.hotRock < 0.38) return;
    ctx.save();
    ctx.globalAlpha = 0.2 + land.hotRock * 0.18;
    ctx.strokeStyle = colour(profile.visual.lavaHex, "#b34321");
    ctx.lineWidth = Math.max(0.4, 0.6 * s);
    for (let index = 0; index < 2; index++) {
        const x = px + (index * 0.19 + roll * 0.12 - 0.16) * cellPx;
        const y = py + (0.3 + index * 0.12) * cellPx;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + cellPx * 0.06, y + cellPx * 0.025);
        ctx.lineTo(x + cellPx * 0.035, y + cellPx * 0.055);
        ctx.stroke();
    }
    ctx.restore();
}

// Cave mouths are the visible habitat behind 1.2.13.47. Without this mark the
// bat existed only in a data array and the tile looked like open ash.
function drawCaveMouth(ctx, px, py, cellPx, s, profile) {
    if (!profile.landform.cave) return;
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = "#151518";
    ctx.beginPath();
    ctx.moveTo(px - cellPx * 0.22, py + cellPx * 0.5);
    ctx.quadraticCurveTo(px - cellPx * 0.12, py + cellPx * 0.22, px - cellPx * 0.02, py + cellPx * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = colour(profile.visual.rockHex, "#655f56");
    ctx.lineWidth = Math.max(0.45, 0.8 * s);
    ctx.beginPath();
    ctx.arc(px - cellPx * 0.12, py + cellPx * 0.49, cellPx * 0.1, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

// A new meltwater channel is a landscape feature, not a label. It runs from
// the upper slope to the lower edge and is distinct from a hot spring pool.
function drawWatercourse(ctx, px, py, cellPx, s, profile, roll) {
    const channel = profile.water.newChannel;
    if (channel < 0.46) return;
    ctx.save();
    ctx.globalAlpha = 0.3 + channel * 0.28;
    ctx.strokeStyle = colour(profile.visual.waterHex, "#4f9990");
    ctx.lineWidth = Math.max(0.6, (0.65 + channel * 1.1) * s);
    const startX = px + (roll - 0.5) * cellPx * 0.18;
    ctx.beginPath();
    ctx.moveTo(startX + cellPx * 0.06, py + cellPx * 0.12);
    ctx.bezierCurveTo(startX - cellPx * 0.1, py + cellPx * 0.24,
        startX + cellPx * 0.12, py + cellPx * 0.36, startX - cellPx * 0.02, py + cellPx * 0.54);
    ctx.stroke();
    ctx.globalAlpha = 0.24;
    ctx.lineWidth = Math.max(0.35, 0.45 * s);
    ctx.strokeStyle = "#cfe4dc";
    ctx.stroke();
    ctx.restore();
}

// Ash is not steam. A dark, leaning plume and a few falling specks distinguish
// an ash emission from the pale fumarole and geyser lines.
function drawAshPlume(ctx, px, py, cellPx, s, profile, roll) {
    const ash = profile.climate.ash;
    if (ash < 0.34) return;
    ctx.save();
    ctx.globalAlpha = 0.14 + ash * 0.2;
    ctx.strokeStyle = "#4a4541";
    ctx.lineWidth = Math.max(0.7, (0.9 + ash * 1.3) * s);
    const x = px + (roll - 0.5) * cellPx * 0.16;
    ctx.beginPath();
    ctx.moveTo(x, py + cellPx * 0.48);
    ctx.bezierCurveTo(x - cellPx * 0.12, py + cellPx * 0.28,
        x + cellPx * 0.14, py + cellPx * 0.13, x + cellPx * 0.06, py - cellPx * 0.02);
    ctx.stroke();
    ctx.fillStyle = "#3b3733";
    for (let index = 0; index < 3; index++) {
        const fx = x + (index - 1) * cellPx * 0.13;
        const fy = py + cellPx * (0.18 + ((roll + index * 0.27) % 0.25));
        ctx.beginPath();
        ctx.arc(fx, fy, Math.max(0.3, cellPx * 0.012), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

/** Ground and landform alone: safe on every volcanic tile. */
export function drawVolcanoGround(ctx, px, py, cellPx, profile, s1 = 0.5, s2 = 0.5, s3 = 0.5) {
    if (!ctx || !profile?.volcanic || !(cellPx > 0)) return;
    const s = cellPx / 48;
    const roll = clamp01((Number(s1) || 0) * 0.55 + (Number(s2) || 0) * 0.3 + (Number(s3) || 0) * 0.15);
    ctx.save();
    // The terrain bake already carries the climate palette. Do not wash every
    // tile with an oval: that produced a field of identical dark stamps.
    if (roll > 0.34) drawLavaField(ctx, px, py, cellPx, s, profile, roll, s2, s3);
    if (profile.landform.spires > 0.34 && s1 > 0.56) {
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = colour(profile.visual.rockHex, "#5c5750");
        poly(ctx, [[px + cellPx * 0.08, py + cellPx * 0.55], [px + cellPx * 0.19, py + cellPx * 0.12], [px + cellPx * 0.27, py + cellPx * 0.55]]);
        ctx.globalAlpha = 0.22;
        poly(ctx, [[px - cellPx * 0.2, py + cellPx * 0.56], [px - cellPx * 0.11, py + cellPx * 0.24], [px - cellPx * 0.03, py + cellPx * 0.56]]);
    }
    // A volcano is a landscape, not a repeating stamp. Only a share of tiles
    // carries the cone or crater silhouette; the rest read as its flanks,
    // ash apron and lava apron. Occupancy is deterministic, so panning cannot
    // add or remove a landmark.
    const landmark = roll > 0.64;
    if (landmark && profile.formation === "volcanic-chain") {
        drawCone(ctx, px - cellPx * 0.16, py - cellPx * 0.08, cellPx * 0.72, s, profile, roll);
        if (s2 > 0.62) drawCone(ctx, px + cellPx * 0.2, py + cellPx * 0.08, cellPx * 0.56, s, profile, (roll + 0.37) % 1);
    } else if (landmark && profile.formation === "crater-field") {
        drawCrater(ctx, px - cellPx * 0.14, py - cellPx * 0.05, cellPx * 0.66, s, profile, roll);
        if (s3 > 0.68) drawCrater(ctx, px + cellPx * 0.23, py + cellPx * 0.14, cellPx * 0.48, s, profile, (roll + 0.44) % 1);
    } else if (landmark && profile.formation !== "fissure-field") {
        drawCone(ctx, px, py, cellPx, s, profile, roll);
        drawCrater(ctx, px, py, cellPx, s, profile, roll);
    }
    if (profile.formation === "fissure-field" || profile.landform.fissure > 0.45
        || profile.hazards.earthquake > 0.55) {
        if (s2 > 0.4 || profile.formation === "fissure-field" || profile.hazards.earthquake > 0.55) {
            drawFissure(ctx, px, py, cellPx, s, profile, roll);
        }
    }
    if (landmark && (profile.formation === "large-crater" || profile.formation === "caldera")) drawCrater(ctx, px, py, cellPx, s, profile, roll);
    // A deep crater must not disappear on the two thirds of tiles that are not
    // chosen as the landmark stamp. Requirement 1.2.13.70 is about the visible
    // crater changing with eruptions; hiding it behind a landmark roll made the
    // profile value impossible to observe on most of the landscape.
    if (!landmark && (profile.landform.crater > 0.5 || profile.landform.caldera > 0.5)) {
        drawCrater(ctx, px, py, cellPx, s, profile, roll);
    }
    if (s2 > 0.74 && (profile.landform.freshLava > 0.32 || profile.climate.active)) {
        drawLavaCrack(ctx, px, py, cellPx, s, profile, roll, 0);
    }
    ctx.restore();
}

function drawSteam(ctx, px, py, cellPx, s, profile, roll, tick) {
    const smoke = profile.climate.smoke;
    const steam = profile.climate.steam;
    if (Math.max(smoke, steam) < 0.44) return;
    if (roll < 0.62) return;
    const amount = Math.max(smoke, steam);
    const drift = Math.sin((Number(tick) || 0) * 0.0016 + roll * 6.28) * cellPx * 0.08;
    ctx.save();
    ctx.globalAlpha = 0.12 + amount * 0.18;
    ctx.strokeStyle = smoke > steam ? "#77716a" : "#d8e2dd";
    ctx.lineWidth = Math.max(0.7, (0.8 + amount * 1.4) * s);
    for (let index = 0; index < 2; index++) {
        const baseX = px + (index === 0 ? -0.06 : 0.08) * cellPx;
        const baseY = py + cellPx * (0.42 + index * 0.08);
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.bezierCurveTo(baseX - cellPx * 0.08 + drift, baseY - cellPx * 0.18,
            baseX + cellPx * 0.12 + drift, baseY - cellPx * 0.3, baseX + cellPx * 0.04 + drift * 1.4, baseY - cellPx * 0.46);
        ctx.stroke();
    }
    ctx.restore();
}

function drawHotWater(ctx, px, py, cellPx, s, profile, roll, tick) {
    const water = profile.water;
    if (water.hotSpring < 0.6 && water.mudPool < 0.62 && water.geyser < 0.6) return;
    if (roll < 0.66) return;
    const sulfurSpring = water.sulfurSpring > 0.38;
    const spring = Math.max(water.hotSpring, water.mudPool);
    const radiusX = cellPx * (0.1 + spring * 0.16);
    const radiusY = cellPx * (0.055 + spring * 0.075);
    const x = px + (roll - 0.5) * cellPx * 0.26;
    const y = py + cellPx * 0.36;
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = sulfurSpring ? "#a7a24e"
        : water.mudPool > water.hotSpring ? "#5c4c3f" : colour(profile.visual.hotWaterHex, "#67b8a7");
    ctx.beginPath();
    ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.36;
    ctx.strokeStyle = sulfurSpring ? "#e5d76e" : "#ddd6c4";
    ctx.lineWidth = Math.max(0.4, 0.55 * s);
    ctx.beginPath();
    ctx.ellipse(x, y, radiusX * 1.05, radiusY * 1.1, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (water.geyser > 0.44) {
        const pulse = 0.18 + (0.5 + Math.sin((Number(tick) || 0) * 0.002 + roll * 8) * 0.5) * 0.3;
        ctx.globalAlpha = 0.34;
        ctx.strokeStyle = "#e5f1ea";
        ctx.lineWidth = Math.max(0.5, 0.8 * s);
        ctx.beginPath();
        ctx.moveTo(x, y - radiusY);
        ctx.quadraticCurveTo(x + cellPx * 0.04, y - cellPx * (0.12 + pulse * 0.24), x + cellPx * 0.02, y - cellPx * 0.3);
        ctx.stroke();
    }
    ctx.restore();
}

function drawSulfurAndMinerals(ctx, px, py, cellPx, s, profile, roll) {
    const land = profile.landform;
    const sulfur = Number(profile.soil?.sulfur) || 0;
    ctx.save();
    if (sulfur > 0.3) {
        ctx.globalAlpha = 0.28 + sulfur * 0.26;
        ctx.fillStyle = colour(profile.visual.sulfurHex, "#c6b84e");
        for (let index = 0; index < 2; index++) {
            ctx.beginPath();
            ctx.ellipse(px + (index - 0.5) * cellPx * 0.22, py + cellPx * (0.22 + ((roll + index * 0.3) % 0.3)),
                cellPx * 0.045, cellPx * 0.025, 0.2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (land.pumice > 0.36) {
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = colour(profile.visual.pumiceHex, "#b6ae9f");
        for (let index = 0; index < 3; index++) {
            ctx.beginPath();
            ctx.arc(px + ((index * 0.23 + roll * 0.2) % 0.8 - 0.4) * cellPx,
                py + (0.28 + (index % 2) * 0.12) * cellPx, cellPx * 0.022, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (land.obsidian > 0.4) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = colour(profile.visual.obsidianHex, "#24252b");
        poly(ctx, [[px + cellPx * 0.12, py + cellPx * 0.44], [px + cellPx * 0.18, py + cellPx * 0.26], [px + cellPx * 0.24, py + cellPx * 0.44]]);
    }
    if (profile.soil?.minerals > 0.35) {
        // Mineral crusts are a separate pale vein from yellow sulfur and grey
        // pumice. This is the visible surface of 1.2.13.31 / 1.2.13.54.
        ctx.globalAlpha = 0.24 + profile.soil.minerals * 0.2;
        ctx.strokeStyle = colour(profile.visual.mineralHex, "#c9c4b2");
        ctx.lineWidth = Math.max(0.4, 0.6 * s);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.25, py + cellPx * 0.36);
        ctx.lineTo(px - cellPx * 0.08, py + cellPx * 0.31);
        ctx.lineTo(px + cellPx * 0.1, py + cellPx * 0.38);
        ctx.stroke();
    }
    if (land.basalt > 0.42) {
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = colour(profile.visual.basaltHex, "#3f4143");
        ctx.lineWidth = Math.max(0.35, 0.5 * s);
        for (let index = 0; index < 3; index++) {
            const x = px + (index - 1) * cellPx * 0.12;
            ctx.beginPath();
            ctx.moveTo(x, py + cellPx * 0.42);
            ctx.lineTo(x + cellPx * 0.01, py + cellPx * 0.55);
            ctx.stroke();
        }
    }
    ctx.restore();
}

function drawFlora(ctx, px, py, cellPx, s, profile, roll) {
    const vegetation = profile.vegetation;
    if (vegetation.stageRank < 1) return;
    ctx.save();
    if (vegetation.stageRank >= 1) {
        ctx.globalAlpha = 0.36;
        ctx.fillStyle = vegetation.mosses[0]?.colours?.[1] || "#8e9870";
        for (let index = 0; index < 2; index++) {
            ctx.beginPath();
            ctx.arc(px + (index - 0.5) * cellPx * 0.28, py + cellPx * (0.46 + index * 0.02), cellPx * 0.024, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (vegetation.grassHex && vegetation.stageRank >= 2) {
        ctx.globalAlpha = 0.42;
        ctx.strokeStyle = profile.visual.grassHex;
        ctx.lineWidth = Math.max(0.35, 0.55 * s);
        for (let index = 0; index < 3; index++) {
            const x = px + (index - 1) * cellPx * 0.11;
            const y = py + cellPx * 0.53;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + cellPx * 0.02, y - cellPx * 0.08);
            ctx.stroke();
        }
    }
    if (vegetation.stageRank >= 3 && vegetation.shrubs.length) {
        ctx.globalAlpha = 0.48;
        ctx.fillStyle = vegetation.shrubs[0].colours?.[0] || "#5e6b4b";
        ctx.beginPath();
        ctx.ellipse(px + cellPx * 0.1, py + cellPx * 0.45, cellPx * 0.07, cellPx * 0.055, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    if (vegetation.flowers.length && profile.season !== "winter") {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = vegetation.flowers[0].colours?.[1] || "#c7b46a";
        ctx.beginPath();
        ctx.arc(px - cellPx * 0.05, py + cellPx * 0.37, cellPx * 0.026, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
    // A lone tree belongs in the ground detail so the tree lattice can reuse
    // the larger silhouette without drawing a second woodland pass per tile.
}

function drawFauna(ctx, px, py, cellPx, s, profile, tick) {
    const fauna = profile.fauna;
    if (!fauna.length || cellPx < 24) return;
    const animal = fauna[(Math.floor((Number(tick) || 0) / 1200) + profile.x + profile.y) % fauna.length];
    const x = px + cellPx * 0.4;
    const y = py + cellPx * 0.48;
    ctx.save();
    ctx.globalAlpha = 0.64;
    ctx.fillStyle = animal.group === "bird" ? "#3d3730" : animal.group === "insect" ? "#6d5a35" : "#61584b";
    if (animal.group === "bird") {
        ctx.beginPath();
        ctx.arc(x, y - cellPx * 0.04, cellPx * 0.025, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - cellPx * 0.05, y - cellPx * 0.035);
        ctx.lineTo(x, y - cellPx * 0.055);
        ctx.lineTo(x + cellPx * 0.05, y - cellPx * 0.035);
        ctx.strokeStyle = "#3d3730";
        ctx.lineWidth = Math.max(0.4, 0.5 * s);
        ctx.stroke();
    } else if (animal.group === "cave") {
        ctx.beginPath();
        ctx.ellipse(x, y, cellPx * 0.014, cellPx * 0.02, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - cellPx * 0.05, y - cellPx * 0.05, x - cellPx * 0.08, y - cellPx * 0.01);
        ctx.quadraticCurveTo(x - cellPx * 0.04, y + cellPx * 0.01, x, y);
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + cellPx * 0.05, y - cellPx * 0.05, x + cellPx * 0.08, y - cellPx * 0.01);
        ctx.quadraticCurveTo(x + cellPx * 0.04, y + cellPx * 0.01, x, y);
        ctx.fill();
    } else if (animal.kind === "lizard" || animal.kind === "gecko") {
        ctx.beginPath();
        ctx.ellipse(x, y, cellPx * 0.045, cellPx * 0.016, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#61584b";
        ctx.lineWidth = Math.max(0.4, 0.5 * s);
        ctx.beginPath();
        ctx.moveTo(x - cellPx * 0.04, y);
        ctx.lineTo(x - cellPx * 0.085, y - cellPx * 0.012);
        ctx.stroke();
    } else if (animal.group === "insect") {
        ctx.beginPath();
        ctx.arc(x, y, cellPx * 0.018, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.beginPath();
        ctx.ellipse(x, y, cellPx * (animal.kind === "lizard" || animal.kind === "gecko" ? 0.045 : 0.035),
            cellPx * (animal.kind === "goat" ? 0.028 : 0.018), 0, 0, Math.PI * 2);
        ctx.fill();
        if (animal.kind === "goat" || animal.kind === "fox") {
            ctx.fillRect(x - cellPx * 0.018, y + cellPx * 0.012, Math.max(0.5, cellPx * 0.006), cellPx * 0.025);
            ctx.fillRect(x + cellPx * 0.012, y + cellPx * 0.012, Math.max(0.5, cellPx * 0.006), cellPx * 0.025);
        }
    }
    ctx.restore();
}

function drawWorkMark(ctx, px, py, cellPx, s, kind, profile) {
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.strokeStyle = "#e7dcc3";
    ctx.fillStyle = "#5b4a35";
    ctx.lineWidth = Math.max(0.5, 0.7 * s);
    if (kind === "fertileTerrace") {
        for (let index = 0; index < 3; index++) {
            const y = py + cellPx * (0.3 + index * 0.075);
            ctx.beginPath();
            ctx.moveTo(px - cellPx * 0.26, y);
            ctx.quadraticCurveTo(px, y - cellPx * 0.04, px + cellPx * 0.24, y);
            ctx.stroke();
        }
        return;
    }
    if (kind === "geothermalPlant") {
        ctx.fillRect(px - cellPx * 0.09, py + cellPx * 0.3, cellPx * 0.18, cellPx * 0.15);
        ctx.beginPath();
        ctx.moveTo(px, py + cellPx * 0.3);
        ctx.lineTo(px, py + cellPx * 0.17);
        ctx.stroke();
        ctx.globalAlpha = 0.24;
        ctx.strokeStyle = "#e9f1e8";
        ctx.beginPath();
        ctx.moveTo(px, py + cellPx * 0.18);
        ctx.bezierCurveTo(px - cellPx * 0.08, py + cellPx * 0.1, px + cellPx * 0.08, py + cellPx * 0.02, px, py - cellPx * 0.03);
        ctx.stroke();
        return;
    }
    if (kind === "observatory") {
        ctx.fillRect(px - cellPx * 0.06, py + cellPx * 0.28, cellPx * 0.12, cellPx * 0.18);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.09, py + cellPx * 0.28);
        ctx.lineTo(px, py + cellPx * 0.2);
        ctx.lineTo(px + cellPx * 0.09, py + cellPx * 0.28);
        ctx.closePath();
        ctx.fill();
        return;
    }
    if (kind === "craterExpedition") {
        ctx.beginPath();
        ctx.moveTo(px + cellPx * 0.05, py + cellPx * 0.3);
        ctx.lineTo(px + cellPx * 0.05, py + cellPx * 0.1);
        ctx.lineTo(px + cellPx * 0.15, py + cellPx * 0.15);
        ctx.lineTo(px + cellPx * 0.05, py + cellPx * 0.2);
        ctx.closePath();
        ctx.fill();
        return;
    }
    // Quarries and mines share one adit-and-spoil mark.
    ctx.fillRect(px - cellPx * 0.1, py + cellPx * 0.3, cellPx * 0.2, cellPx * 0.14);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#1f2020";
    ctx.beginPath();
    ctx.ellipse(px, py + cellPx * 0.37, cellPx * 0.045, cellPx * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = "#8e897b";
    ctx.beginPath();
    ctx.arc(px + cellPx * 0.14, py + cellPx * 0.42, cellPx * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawWorks(ctx, px, py, cellPx, s, profile, roll) {
    const works = profile.use || {};
    const order = ["lavaQuarry", "obsidianQuarry", "pumiceQuarry", "sulfurMine", "metalMine",
        "mineralWorks", "geothermalPlant", "fertileTerrace", "craterExpedition", "observatory"];
    const active = order.filter(key => works[key]);
    if (!active.length) return;
    drawWorkMark(ctx, px, py, cellPx, s, active[0], profile);
    if (active.length > 1) {
        ctx.save();
        ctx.globalAlpha = 0.38;
        ctx.fillStyle = "#d8c9a8";
        ctx.beginPath();
        ctx.arc(px + cellPx * 0.29, py + cellPx * 0.25, cellPx * 0.022, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

/** Works, water, glowing lava, flora and fauna: open volcanic ground only. */
export function drawVolcanoDetails(ctx, px, py, cellPx, profile, s1 = 0.5, s2 = 0.5, s3 = 0.5, tick = 0, zoom = 1) {
    if (!ctx || !profile?.volcanic || !(cellPx > 0)) return;
    const s = cellPx / 48;
    const roll = clamp01((Number(s1) || 0) * 0.55 + (Number(s2) || 0) * 0.3 + (Number(s3) || 0) * 0.15);
    const fine = cellPx >= 24 && Number(zoom) >= 0.62;
    ctx.save();
    drawWorks(ctx, px, py, cellPx, s, profile, roll);
    drawHotWater(ctx, px, py, cellPx, s, profile, roll, tick);
    drawSteam(ctx, px, py, cellPx, s, profile, roll, tick);
    drawAshPlume(ctx, px, py, cellPx, s, profile, roll);
    drawHotRock(ctx, px, py, cellPx, s, profile, roll);
    drawSulfurAndMinerals(ctx, px, py, cellPx, s, profile, roll);
    drawCaveMouth(ctx, px, py, cellPx, s, profile);
    drawWatercourse(ctx, px, py, cellPx, s, profile, roll);
    if (fine) drawFlora(ctx, px, py, cellPx, s, profile, roll);
    if (fine) drawFauna(ctx, px, py, cellPx, s, profile, tick);
    if (profile.visual.lightMood === "ash-cloud") {
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = "#373432";
        ctx.fillRect(px - cellPx * 0.25, py - cellPx * 0.02, cellPx * 0.5, cellPx * 0.2);
    }
    ctx.restore();
}

/** Draw one complete volcanic tile with capped, deterministic detail. */
export function drawVolcano(ctx, px, py, cellPx, profile, s1 = 0.5, s2 = 0.5, s3 = 0.5, tick = 0, zoom = 1) {
    drawVolcanoGround(ctx, px, py, cellPx, profile, s1, s2, s3);
    drawVolcanoDetails(ctx, px, py, cellPx, profile, s1, s2, s3, tick, zoom);
}

/** Draw one volcanic tree: a wind-bent crown on a dark, fire-scarred trunk. */
export function drawVolcanoTree(ctx, px, py, cellPx, tree, profile, roll = 0.5) {
    if (!ctx || !tree || !(cellPx > 0)) return;
    const s = cellPx / 48;
    const leaf = colour(tree.seasonColour, colour(profile?.visual?.grassHex, "#5c704c"));
    const x = px + (Number(tree.offsetX) || 0) * cellPx;
    const y = py + (Number(tree.offsetY) || 0) * cellPx + 3 * s;
    const height = cellPx * (0.18 + (Number(tree.scale) || 0.8) * 0.14);
    const lean = (roll - 0.5) * height * 0.3;
    ctx.save();
    ctx.strokeStyle = "#44372d";
    ctx.lineWidth = Math.max(0.55, height * 0.06);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * 0.4, y - height * 0.55, x + lean, y - height);
    ctx.stroke();
    ctx.fillStyle = leaf;
    if (tree.kind === "conifer") {
        poly(ctx, [[x + lean - height * 0.18, y - height * 0.54], [x + lean, y - height * 1.14], [x + lean + height * 0.18, y - height * 0.54]]);
        poly(ctx, [[x + lean - height * 0.25, y - height * 0.3], [x + lean, y - height * 0.86], [x + lean + height * 0.25, y - height * 0.3]]);
    } else {
        ctx.globalAlpha = 0.92;
        ctx.beginPath();
        ctx.ellipse(x + lean, y - height * 0.94, height * 0.3, height * 0.22, lean * 0.02, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + lean - height * 0.18, y - height * 0.8, height * 0.2, height * 0.15, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + lean + height * 0.2, y - height * 0.78, height * 0.18, height * 0.14, 0.2, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
