// Savanna detail layer (spec 1.2.10.1–1.2.10.48).
//
// The baked terrain supplies the broad hot-ground colour. This layer adds what
// makes savanna readable: red soil and cracked clay, tall golden grass and the
// green flush after rain, flat-crowned acacias and baobabs, thorn scrub,
// termite spires, watering holes, ash after fire, flowers and a bounded glimpse
// of the herds and predators that follow the water. Every value comes from the
// deterministic savanna profile, and every loop has a hard cap so low-end
// devices pay only for visible detail.

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

function colour(value, fallback) {
    return typeof value === "string" && value.startsWith("#") ? value : fallback;
}

function hash(value, seed) {
    return ((Math.imul((value | 0) + 1, 0x9e3779b1) ^ Math.imul((seed | 0) + 1, 0x85ebca6b)) >>> 0) / 0x100000000;
}

function drawSoil(ctx, px, py, cellPx, s, profile, roll) {
    const visual = profile.visual || {};
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = colour(visual.groundHex, "#9a7149");
    ctx.beginPath();
    ctx.ellipse(px - cellPx * 0.1, py + cellPx * 0.07, cellPx * (0.2 + roll * 0.1), cellPx * 0.1, roll * 0.5, 0, Math.PI * 2);
    ctx.fill();
    if (profile.water?.pan > 0.34 && !profile.water?.standingWater) {
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = "#7d654e";
        ctx.lineWidth = Math.max(0.4, 0.55 * s);
        ctx.beginPath();
        for (let index = 0; index < 3; index++) {
            const offset = (index - 1) * cellPx * 0.09;
            ctx.moveTo(px - cellPx * 0.2, py + offset * 0.3);
            ctx.lineTo(px - cellPx * 0.06, py + offset * 0.35 + 1.5 * s);
            ctx.lineTo(px + cellPx * 0.02, py + offset * 0.28);
            ctx.lineTo(px + cellPx * 0.18, py + offset * 0.34 + 1.2 * s);
        }
        ctx.stroke();
    }
    if (profile.hazards?.burned) {
        ctx.globalAlpha = 0.36;
        ctx.fillStyle = colour(visual.ashHex, "#3d3831");
        ctx.beginPath();
        ctx.ellipse(px + cellPx * 0.06, py + cellPx * 0.02, cellPx * 0.22, cellPx * 0.1, roll * 0.2, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawGrass(ctx, px, py, cellPx, s, profile, roll, tick) {
    const grasses = profile.vegetation?.grasses || [];
    if (!grasses.length) return;
    const burned = Boolean(profile.hazards?.burned);
    const green = clamp01(profile.visual?.wetSeason);
    const dry = clamp01(profile.visual?.drySeason);
    const sway = Math.sin((Number(tick) || 0) * 0.0016 + px * 0.11 + py * 0.09) * 1.3 * s;
    const count = Math.min(4, Math.max(2, grasses.length + 1));
    ctx.lineWidth = Math.max(0.4, 0.55 * s);
    for (let index = 0; index < count; index++) {
        const grass = grasses[index % grasses.length];
        const tall = grass?.height === "tall";
        const base = burned ? "#4b4133" : colour(grass?.colours?.[0], dry > green ? "#a98d4e" : "#85904e");
        const tip = burned ? "#6f5c43" : colour(grass?.colours?.[1], green > dry ? "#b9be72" : "#d0b66c");
        const height = (tall ? 10 : 5.5) * s * (burned ? 0.4 : 0.7 + green * 0.36);
        const x = px + (index - count / 2) * cellPx * 0.07 + (roll - 0.5) * cellPx * 0.1;
        const y = py + cellPx * 0.12;
        ctx.globalAlpha = burned ? 0.4 : 0.46 + green * 0.16;
        ctx.strokeStyle = base;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + sway * 0.25, y - height * 0.5, x + sway * (tall ? 0.8 : 0.45), y - height);
        ctx.stroke();
        if (!burned && tall && index % 2 === 0) {
            ctx.globalAlpha = 0.38;
            ctx.strokeStyle = tip;
            ctx.beginPath();
            ctx.moveTo(x + 1 * s, y);
            ctx.quadraticCurveTo(x + 1 * s + sway * 0.2, y - height * 0.45, x + 1.2 * s + sway * 0.6, y - height * 0.82);
            ctx.stroke();
        }
    }
}

function drawWater(ctx, px, py, cellPx, s, profile, roll) {
    if (!profile.water?.standingWater) return;
    const water = colour(profile.visual?.waterHex, "#6f8c82");
    const width = cellPx * (0.2 + roll * 0.09);
    ctx.globalAlpha = 0.56;
    ctx.fillStyle = water;
    ctx.beginPath();
    ctx.ellipse(px + cellPx * 0.03, py + cellPx * 0.1, width, width * 0.4, roll * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "#cdd7bd";
    ctx.lineWidth = Math.max(0.4, 0.5 * s);
    ctx.beginPath();
    ctx.ellipse(px + cellPx * 0.03, py + cellPx * 0.085, width * 0.7, width * 0.22, roll * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    // Trampled mud ring: the waterhole is a working place, not a pond ornament.
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#6f5942";
    ctx.beginPath();
    ctx.ellipse(px + cellPx * 0.03, py + cellPx * 0.13, width * 1.24, width * 0.58, roll * 0.2, 0, Math.PI * 2);
    ctx.fill();
}

function drawTermiteMound(ctx, px, py, cellPx, s, profile, roll) {
    const count = Math.max(0, Math.min(3, Number(profile.termites?.moundCount) || 0));
    if (!count) return;
    const base = colour(profile.visual?.termiteHex, "#a56f4e");
    for (let index = 0; index < count; index++) {
        const x = px + (hash(index + 30, Math.floor(px + py)) - 0.5) * cellPx * 0.56;
        const y = py + (index - count / 2) * cellPx * 0.025 + cellPx * 0.11;
        const height = cellPx * (0.08 + roll * 0.04) * (index ? 0.72 : 1);
        ctx.globalAlpha = 0.58;
        ctx.fillStyle = base;
        ctx.beginPath();
        ctx.moveTo(x - 2.4 * s, y);
        ctx.lineTo(x - 1.1 * s, y - height * 0.8);
        ctx.lineTo(x - 0.4 * s, y - height);
        ctx.lineTo(x + 0.8 * s, y - height * 0.74);
        ctx.lineTo(x + 2.2 * s, y);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#c08d67";
        ctx.beginPath();
        ctx.moveTo(x - 0.5 * s, y - height * 0.74);
        ctx.lineTo(x - 0.2 * s, y - height * 0.9);
        ctx.lineTo(x + 0.5 * s, y - height * 0.7);
        ctx.closePath();
        ctx.fill();
    }
}

function drawShrub(ctx, px, py, cellPx, s, shrub, roll) {
    const base = colour(shrub?.colours?.[0], "#6f7142");
    const light = colour(shrub?.colours?.[1], "#9a9459");
    const y = py + cellPx * 0.1;
    const width = cellPx * (0.09 + roll * 0.04);
    ctx.globalAlpha = 0.52;
    ctx.strokeStyle = base;
    ctx.lineWidth = Math.max(0.5, 0.7 * s);
    ctx.beginPath();
    for (let index = 0; index < 3; index++) {
        ctx.moveTo(px + (index - 1) * 1.5 * s, y);
        ctx.lineTo(px + (index - 1) * width * 0.7, y - width * (0.5 + index * 0.1));
    }
    ctx.stroke();
    ctx.globalAlpha = 0.46;
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.ellipse(px, y - width * 0.6, width, width * 0.38, roll * 0.2, 0, Math.PI * 2);
    ctx.fill();
}

function drawFlowers(ctx, px, py, cellPx, s, flowers, bloom, burned) {
    if (!flowers.length || bloom < 0.08 || burned) return;
    const count = Math.min(2, flowers.length);
    for (let index = 0; index < count; index++) {
        const flower = flowers[index];
        const petal = colour(flower?.colours?.[0], "#d49a59");
        const x = px + (index ? cellPx * 0.11 : -cellPx * 0.14);
        const y = py + cellPx * (index ? 0.03 : 0.07);
        ctx.globalAlpha = 0.58 + bloom * 0.16;
        ctx.strokeStyle = "#7e8b4d";
        ctx.lineWidth = Math.max(0.35, 0.45 * s);
        ctx.beginPath();
        ctx.moveTo(x, y + 2 * s);
        ctx.lineTo(x, y - 1.4 * s);
        ctx.stroke();
        ctx.fillStyle = petal;
        ctx.beginPath();
        if (flower?.id === "aloe") {
            for (let petalIndex = 0; petalIndex < 3; petalIndex++) {
                ctx.ellipse(x, y - 1.8 * s - petalIndex * 1.2 * s, 0.8 * s, 0.5 * s, 0.4, 0, Math.PI * 2);
            }
        } else {
            ctx.arc(x, y - 1.8 * s, 0.95 * s, 0, Math.PI * 2);
        }
        ctx.fill();
    }
}

function drawFauna(ctx, px, py, cellPx, s, profile, roll, tick) {
    const fauna = (profile.fauna || []).slice(0, 3);
    if (!fauna.length || cellPx < 22) return;
    for (let index = 0; index < fauna.length; index++) {
        const entry = fauna[index];
        const x = px + (hash(index + 90, Math.floor(px + py)) - 0.5) * cellPx * 0.58;
        const y = py - cellPx * 0.1 + (index % 2) * cellPx * 0.055;
        const body = entry.group === "predator" ? "#6d5844" : "#76644c";
        ctx.globalAlpha = entry.group === "predator" ? 0.3 : 0.34;
        ctx.fillStyle = body;
        if (entry.group === "bird") {
            ctx.strokeStyle = body;
            ctx.lineWidth = Math.max(0.5, 0.65 * s);
            ctx.beginPath();
            ctx.moveTo(x - 2.2 * s, y);
            ctx.quadraticCurveTo(x - 0.7 * s, y - 1.4 * s, x, y);
            ctx.quadraticCurveTo(x + 0.9 * s, y - 1.4 * s, x + 2.4 * s, y);
            ctx.stroke();
        } else if (entry.kind === "elephant") {
            ctx.beginPath();
            ctx.ellipse(x, y, 2.1 * s, 1.2 * s, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(x + 1.8 * s, y - 0.5 * s, 0.75 * s, 0.55 * s, 0, 0, Math.PI * 2);
            ctx.ellipse(x + 1.5 * s, y + 0.8 * s, 0.55 * s, 0.8 * s, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (entry.kind === "giraffe") {
            ctx.strokeStyle = body;
            ctx.lineWidth = Math.max(0.6, 0.8 * s);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - 1.6 * s, y);
            ctx.moveTo(x + 0.3 * s, y - 0.3 * s);
            ctx.lineTo(x + 1.2 * s, y - 3.5 * s);
            ctx.lineTo(x + 2.1 * s, y - 3.6 * s);
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(x + 1.1 * s, y - 3.7 * s, 0.75 * s, 0.42 * s, 0.1, 0, Math.PI * 2);
            ctx.fill();
        } else if (entry.herd) {
            const count = Math.min(4, Math.max(2, Math.round((Number(entry.count) || 2) / 2)));
            for (let animal = 0; animal < count; animal++) {
                const ax = x + (animal - count / 2) * 2.1 * s;
                const ay = y + (animal % 2) * 1.1 * s;
                ctx.beginPath();
                ctx.ellipse(ax, ay, 1.0 * s, 0.58 * s, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = body;
                ctx.lineWidth = Math.max(0.35, 0.4 * s);
                ctx.beginPath();
                ctx.moveTo(ax - 0.5 * s, ay + 0.35 * s);
                ctx.lineTo(ax - 0.5 * s, ay + 0.85 * s);
                ctx.moveTo(ax + 0.5 * s, ay + 0.35 * s);
                ctx.lineTo(ax + 0.5 * s, ay + 0.85 * s);
                ctx.stroke();
            }
        } else {
            ctx.beginPath();
            ctx.ellipse(x, y, 1.3 * s, 0.68 * s, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        if (entry.group === "insect") {
            ctx.globalAlpha = 0.2;
            ctx.beginPath();
            ctx.arc(x + 2 * s + Math.sin((Number(tick) || 0) * 0.002 + index) * s, y - 3 * s, 0.55 * s, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function drawDust(ctx, px, py, cellPx, profile, roll) {
    const haze = clamp01(profile.visual?.haze);
    if (haze < 0.12) return;
    ctx.globalAlpha = Math.min(0.22, haze * 0.3);
    ctx.strokeStyle = colour(profile.visual?.dustHex, "#c4a67a");
    ctx.lineWidth = Math.max(0.4, 0.5);
    ctx.beginPath();
    ctx.moveTo(px - cellPx * 0.26, py + cellPx * (0.02 + roll * 0.04));
    ctx.quadraticCurveTo(px, py - 1.5, px + cellPx * 0.24, py + cellPx * 0.03);
    ctx.stroke();
}

/**
 * Draw one savanna tile. The function is safe with a null profile and every
 * loop is capped; the maximum stays far below the generic terrain budget.
 */
export function drawSavanna(ctx, px, py, cellPx, profile, s1 = 0.5, s2 = 0.5, s3 = 0.5, tick = 0, zoom = 1, sun = 0.6, dayOfYear = 150, climate = "savanna") {
    if (!ctx || !profile?.savanna || !(cellPx > 0)) return;
    const s = cellPx / 48;
    const roll = clamp01((Number(s1) || 0) * 0.55 + (Number(s2) || 0) * 0.3 + (Number(s3) || 0) * 0.15);
    ctx.save();
    drawSoil(ctx, px, py, cellPx, s, profile, roll);
    drawDust(ctx, px, py, cellPx, profile, roll);
    drawWater(ctx, px, py, cellPx, s, profile, roll);
    drawGrass(ctx, px, py, cellPx, s, profile, roll, tick);
    const shrubs = profile.vegetation?.shrubs || [];
    for (let index = 0; index < Math.min(2, shrubs.length); index++) {
        drawShrub(ctx, px + (index ? cellPx * 0.11 : -cellPx * 0.16), py + cellPx * (index ? 0.04 : 0.08), cellPx, s, shrubs[index], (roll + index * 0.27) % 1);
    }
    drawTermiteMound(ctx, px, py, cellPx, s, profile, roll);
    drawFlowers(ctx, px, py, cellPx, s, profile.vegetation?.flowers || [], Number(profile.vegetation?.bloom) || 0, Boolean(profile.hazards?.burned));
    drawFauna(ctx, px, py, cellPx, s, profile, roll, tick);
    ctx.restore();
}

/**
 * Scattered savanna tree. Acacias keep a flat, umbrella crown and baobabs a
 * swollen trunk with root-like branches; neither forms a closed canopy.
 */
export function drawSavannaTree(ctx, px, py, cellPx, tree, profile, roll = 0.5) {
    if (!ctx || !tree || !(cellPx > 0)) return;
    const s = cellPx / 48;
    const leaf = colour(tree.seasonColour, colour(profile?.visual?.leafHex, "#778c45"));
    const baobab = tree.kind === "baobab";
    const broadleaf = tree.kind === "broadleaf";
    const bark = baobab ? "#81705a" : "#6c5940";
    const height = cellPx * (0.22 + (Number(tree.scale) || 0.8) * 0.13) * (baobab ? 1.08 : 1);
    const x = px + (Number(tree.offsetX) || 0) * cellPx;
    const y = py + (Number(tree.offsetY) || 0) * cellPx + 4 * s;
    ctx.save();
    ctx.globalAlpha = 0.76;
    ctx.strokeStyle = bark;
    ctx.lineWidth = Math.max(0.9, (baobab ? 2.6 : 1.35) * s);
    ctx.beginPath();
    if (baobab) {
        ctx.moveTo(x - 1.5 * s, y);
        ctx.quadraticCurveTo(x - 1.2 * s, y - height * 0.55, x - 0.4 * s, y - height * 0.72);
        ctx.moveTo(x + 1.4 * s, y);
        ctx.quadraticCurveTo(x + 1.1 * s, y - height * 0.52, x + 0.4 * s, y - height * 0.7);
        ctx.moveTo(x - 0.3 * s, y - height * 0.7);
        ctx.lineTo(x - 2.2 * s, y - height * 0.94);
        ctx.moveTo(x + 0.2 * s, y - height * 0.72);
        ctx.lineTo(x + 1.8 * s, y - height * 0.98);
        ctx.moveTo(x, y - height * 0.7);
        ctx.lineTo(x - 0.4 * s, y - height * 1.02);
    } else {
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - 0.8 * s, y - height * 0.4, x - 0.4 * s, y - height * 0.68);
        ctx.moveTo(x - 0.3 * s, y - height * 0.5);
        ctx.lineTo(x - 2.1 * s, y - height * 0.8);
        ctx.moveTo(x - 0.25 * s, y - height * 0.58);
        ctx.lineTo(x + 1.8 * s, y - height * 0.84);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.58;
    ctx.fillStyle = leaf;
    if (baobab) {
        ctx.beginPath();
        ctx.ellipse(x - cellPx * 0.08, y - height * 0.96, cellPx * 0.13, cellPx * 0.05, -0.12, 0, Math.PI * 2);
        ctx.ellipse(x + cellPx * 0.06, y - height * 1.01, cellPx * 0.12, cellPx * 0.045, 0.14, 0, Math.PI * 2);
        ctx.fill();
    } else if (broadleaf) {
        ctx.beginPath();
        ctx.ellipse(x - cellPx * 0.055, y - height * 0.82, cellPx * 0.15, cellPx * 0.115, -0.1, 0, Math.PI * 2);
        ctx.ellipse(x + cellPx * 0.06, y - height * 0.78, cellPx * 0.135, cellPx * 0.1, 0.16, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // Umbrella crown: a wide, thin disc is the acacia's unmistakable read.
        ctx.beginPath();
        ctx.ellipse(x, y - height * 0.84, cellPx * 0.21, cellPx * 0.075, 0, 0, Math.PI * 2);
        ctx.ellipse(x - cellPx * 0.07, y - height * 0.78, cellPx * 0.13, cellPx * 0.05, -0.08, 0, Math.PI * 2);
        ctx.fill();
    }
    if (tree.flowering) {
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = "#e7d68e";
        ctx.beginPath();
        ctx.arc(x - 2.2 * s, y - height * 0.9, 0.8 * s, 0, Math.PI * 2);
        ctx.arc(x + 1.6 * s, y - height * 0.86, 0.7 * s, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
