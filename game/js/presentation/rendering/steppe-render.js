// Steppe detail layer (spec 1.2.7.1–1.2.7.56).
//
// The ground itself is already baked by the terrain pass. This layer adds the
// steppe's readable surface: short and middle grasses, thorn scrub, spring
// flowers, dust, salt, snow, erosion, seasonal water and the animals that make
// the open plain feel alive. Every position comes from the tile's stable roll,
// so panning does not reshuffle the landscape.

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function colour(value, fallback) {
    return typeof value === "string" && value.startsWith("#") ? value : fallback;
}

function hashOffset(value, seed) {
    return ((Math.imul((value | 0) + 1, 0x9e3779b1) ^ Math.imul((seed | 0) + 1, 0x85ebca6b)) >>> 0) / 0x100000000;
}

function drawTuft(ctx, x, y, s, profile, roll, snow) {
    const grass = profile.grasses?.[Math.floor(roll * (profile.grasses.length || 1))] || profile.grasses?.[0];
    const base = colour(grass?.colours?.[0], profile.grassHex || "#9a925f");
    const tip = colour(grass?.colours?.[1], "#c2b47d");
    const height = (grass?.height === "tall" ? 10.5 : grass?.height === "short" ? 5.2 : 7.8) * s;
    const lean = (roll - 0.5) * 5.4 * s + Math.sin(roll * 9) * 1.1 * s;
    const snowCap = snow > 0.28;
    ctx.strokeStyle = base;
    ctx.globalAlpha = 0.55 + roll * 0.22;
    ctx.lineWidth = Math.max(0.65, (grass?.height === "tall" ? 1.15 : 0.9) * s);
    ctx.beginPath();
    ctx.moveTo(x - 1.9 * s, y + 2.4 * s);
    ctx.quadraticCurveTo(x - 1.5 * s + lean * 0.35, y - height * 0.45, x - 1.3 * s + lean, y - height);
    ctx.moveTo(x + 1.6 * s, y + 2.2 * s);
    ctx.quadraticCurveTo(x + 2.2 * s + lean * 0.25, y - height * 0.4, x + 2.4 * s + lean * 0.72, y - height * 0.78);
    ctx.stroke();
    if (snowCap) {
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = "#e8ece7";
        ctx.beginPath();
        ctx.ellipse(x - 1.3 * s + lean, y - height, 1.45 * s, 0.72 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 2.4 * s + lean * 0.72, y - height * 0.78, 1.1 * s, 0.58 * s, 0, 0, Math.PI * 2);
        ctx.fill();
    } else if (profile.bloom > 0.28 && roll > 0.62) {
        ctx.globalAlpha = 0.62;
        ctx.fillStyle = tip;
        ctx.beginPath();
        ctx.ellipse(x - 1.3 * s + lean, y - height - 1.1 * s, 1.25 * s, 0.9 * s, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawShrub(ctx, x, y, s, profile, shrub, roll) {
    const base = colour(shrub?.colours?.[0], "#81835b");
    const leaf = colour(shrub?.colours?.[1], "#a3a271");
    const height = (7 + roll * 5) * s;
    ctx.globalAlpha = 0.74;
    ctx.strokeStyle = "#695f45";
    ctx.lineWidth = Math.max(0.7, 1.1 * s);
    ctx.beginPath();
    ctx.moveTo(x, y + 3 * s);
    ctx.lineTo(x - 1.3 * s, y - height * 0.25);
    ctx.moveTo(x, y + 2.5 * s);
    ctx.lineTo(x + 1.5 * s, y - height * 0.45);
    ctx.stroke();
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse(x - 1.3 * s, y - height * 0.38, (3.2 + roll * 1.4) * s, (2.4 + roll) * s, -0.36, 0, Math.PI * 2);
    ctx.ellipse(x + 1.2 * s, y - height * 0.5, (2.8 + roll) * s, (2.1 + roll * 0.8) * s, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.64;
    ctx.fillStyle = leaf;
    ctx.beginPath();
    ctx.ellipse(x - 1.8 * s, y - height * 0.6, 2.1 * s, 1.4 * s, -0.3, 0, Math.PI * 2);
    ctx.ellipse(x + 0.6 * s, y - height * 0.72, 1.9 * s, 1.2 * s, 0.2, 0, Math.PI * 2);
    ctx.fill();
    if (shrub?.thorny) {
        ctx.globalAlpha = 0.68;
        ctx.strokeStyle = "#5e523c";
        ctx.lineWidth = Math.max(0.55, 0.8 * s);
        ctx.beginPath();
        for (let index = 0; index < 4; index++) {
            const tx = x + (index - 1.5) * 2.2 * s;
            const ty = y - height * (0.35 + (index % 2) * 0.2);
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx + (index % 2 ? 2.7 : -2.5) * s, ty - (2.4 + index * 0.25) * s);
        }
        ctx.stroke();
    }
}

function drawFlower(ctx, x, y, s, flower, roll) {
    const petal = colour(flower?.colours?.[0], "#c9a85d");
    const centre = colour(flower?.colours?.[1], "#e0c66c");
    ctx.globalAlpha = 0.76;
    ctx.strokeStyle = "#6d7946";
    ctx.lineWidth = Math.max(0.5, 0.7 * s);
    ctx.beginPath();
    ctx.moveTo(x, y + 2 * s);
    ctx.lineTo(x + (roll - 0.5) * 1.8 * s, y - 2.2 * s);
    ctx.stroke();
    ctx.fillStyle = petal;
    ctx.beginPath();
    for (let petalIndex = 0; petalIndex < 4; petalIndex++) {
        const angle = (Math.PI * 2 * petalIndex) / 4 + roll;
        ctx.ellipse(x + Math.cos(angle) * 1.35 * s, y - 2.5 * s + Math.sin(angle) * 1.35 * s,
            1.05 * s, 0.65 * s, angle, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = centre;
    ctx.beginPath();
    ctx.arc(x, y - 2.5 * s, 0.68 * s, 0, Math.PI * 2);
    ctx.fill();
}

function drawHerb(ctx, x, y, s, herb, roll) {
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = colour(herb?.colour, "#a9a06f");
    ctx.lineWidth = Math.max(0.45, 0.62 * s);
    ctx.beginPath();
    ctx.moveTo(x, y + 2.2 * s);
    ctx.lineTo(x + (roll - 0.5) * 1.2 * s, y - (3.2 + roll * 2.4) * s);
    ctx.stroke();
    ctx.fillStyle = colour(herb?.colour, "#b8ad79");
    ctx.beginPath();
    ctx.ellipse(x + (roll - 0.5) * 1.4 * s, y - (2.2 + roll) * s, 0.85 * s, 0.5 * s, roll, 0, Math.PI * 2);
    ctx.fill();
}

function drawSteppeAnimal(ctx, x, y, s, animal, roll) {
    const scale = (0.7 + roll * 0.35) * s;
    const dark = animal.group === "predator" ? "#5f5847" : animal.group === "raptor" ? "#6c6552" : "#6d6048";
    const body = animal.kind === "antelope" ? "#a98d61" : animal.kind === "horse" ? "#806b4c" : animal.kind === "sheep" ? "#c4b795" : dark;
    ctx.globalAlpha = 0.74;
    ctx.fillStyle = body;
    ctx.strokeStyle = body;
    ctx.lineWidth = Math.max(0.6, 1.05 * scale);
    if (animal.kind === "horse" || animal.kind === "antelope" || animal.kind === "sheep") {
        const length = animal.kind === "horse" ? 7.4 : animal.kind === "antelope" ? 6.2 : 4.7;
        ctx.beginPath();
        ctx.ellipse(x, y - 2.2 * scale, length * scale, 2.5 * scale, roll - 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - 2.4 * scale, y - 1.2 * scale); ctx.lineTo(x - 3.6 * scale, y + 4.2 * scale);
        ctx.moveTo(x + 1.2 * scale, y - 1.2 * scale); ctx.lineTo(x + 2.4 * scale, y + 4.2 * scale);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x + length * 0.72 * scale, y - 4.2 * scale, 1.8 * scale, 1.25 * scale, 0.4, 0, Math.PI * 2);
        ctx.fill();
        if (animal.kind === "antelope") {
            ctx.strokeStyle = "#8b7658";
            ctx.beginPath();
            ctx.moveTo(x + 5 * scale, y - 5.2 * scale); ctx.lineTo(x + 5.8 * scale, y - 8.6 * scale);
            ctx.moveTo(x + 5.7 * scale, y - 5.2 * scale); ctx.lineTo(x + 6.7 * scale, y - 8.2 * scale);
            ctx.stroke();
        }
    } else if (animal.kind === "wolf" || animal.kind === "fox") {
        ctx.beginPath();
        ctx.ellipse(x, y - 1.6 * scale, 4.6 * scale, 1.8 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - 2.4 * scale, y + 0.4 * scale); ctx.lineTo(x - 3.2 * scale, y + 3.6 * scale);
        ctx.moveTo(x + 1.6 * scale, y + 0.4 * scale); ctx.lineTo(x + 2.4 * scale, y + 3.6 * scale);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x + 4.1 * scale, y - 2.8 * scale, 1.5 * scale, 1 * scale, 0.38, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = body;
        ctx.beginPath();
        ctx.moveTo(x - 4.4 * scale, y - 2.1 * scale);
        ctx.quadraticCurveTo(x - 7 * scale, y - 4.6 * scale, x - 8 * scale, y - 1.4 * scale);
        ctx.stroke();
    } else if (animal.kind === "marmot" || animal.kind === "rodent") {
        ctx.beginPath();
        ctx.ellipse(x, y - 1.2 * scale, 2.3 * scale, 1.65 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 1.4 * scale, y - 2.7 * scale, 0.9 * scale, 0, Math.PI * 2);
        ctx.fill();
    } else if (animal.kind === "raptor") {
        ctx.strokeStyle = body;
        ctx.lineWidth = Math.max(0.8, 1.3 * scale);
        ctx.beginPath();
        ctx.moveTo(x - 5 * scale, y - 3.2 * scale);
        ctx.quadraticCurveTo(x, y - 7.2 * scale, x + 5 * scale, y - 3.2 * scale);
        ctx.moveTo(x, y - 4.2 * scale); ctx.lineTo(x, y + 0.8 * scale);
        ctx.stroke();
    } else if (animal.kind === "ground-bird" || animal.kind === "songbird") {
        ctx.beginPath();
        ctx.ellipse(x, y - 1.3 * scale, 2.3 * scale, 1.5 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 1.9 * scale, y - 2.8 * scale, 0.9 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#8b7658";
        ctx.beginPath();
        ctx.moveTo(x + 2.8 * scale, y - 2.8 * scale); ctx.lineTo(x + 3.7 * scale, y - 3.1 * scale);
        ctx.stroke();
    } else if (animal.kind === "locust") {
        ctx.fillStyle = "#8e8251";
        ctx.beginPath();
        ctx.ellipse(x, y - 2 * scale, 1.5 * scale, 0.65 * scale, roll * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(208,191,130,0.55)";
        ctx.beginPath();
        ctx.moveTo(x - 2.5 * scale, y - 3.3 * scale); ctx.lineTo(x + 2.5 * scale, y - 0.8 * scale);
        ctx.stroke();
    } else {
        ctx.beginPath();
        ctx.arc(x, y - 2 * scale, 1.2 * scale, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * Draw one steppe detail tile. `profile` is the value returned by
 * steppeProfileAt(). The function is intentionally bounded: at most a handful
 * of tufts, shrubs, flowers, herbs and animals per tile, regardless of density.
 */
export function drawSteppe(ctx, px, py, cellPx, profile, s1 = 0.5, s2 = 0.5, s3 = 0.5, tick = 0, zoom = 1, sun = 0.6, dayOfYear = 150, climateKey = "arid") {
    if (!profile || !Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(cellPx)) return;
    const s = Math.max(0.35, cellPx / 48);
    const visual = profile.visual || {};
    const snow = clamp01(visual.snowCover);
    const density = clamp01(profile.sward?.density ?? 0.45);
    const soil = profile.soil || {};
    const landform = profile.landform || {};
    const roll = (salt) => number(hashOffset(Math.round(px + py * 3), salt), 0.5);

    ctx.save();
    // Dry ground, sand and salt are part of the tile, not a separate biome.
    ctx.globalAlpha = 0.2 + (1 - density) * 0.12;
    ctx.fillStyle = colour(profile.groundHex, "#b7a171");
    ctx.beginPath();
    ctx.ellipse(px, py + cellPx * 0.1, cellPx * 0.46, cellPx * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    if (soil.sand > 0.3 || profile.formation === "sandy") {
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = "#cfb886";
        for (let index = 0; index < 4; index++) {
            const angle = roll(10 + index) * Math.PI * 2;
            const radius = 0.08 + roll(20 + index) * 0.38;
            ctx.beginPath();
            ctx.ellipse(px + Math.cos(angle) * radius * cellPx, py + Math.sin(angle) * radius * cellPx * 0.62,
                (0.08 + roll(30 + index) * 0.1) * cellPx, (0.025 + roll(40 + index) * 0.035) * cellPx, angle * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (soil.salt > 0.48) {
        ctx.globalAlpha = 0.38;
        ctx.fillStyle = "#e0d8bf";
        ctx.beginPath();
        ctx.ellipse(px + (s2 - 0.5) * cellPx * 0.28, py + (s3 - 0.5) * cellPx * 0.22,
            cellPx * (0.16 + s1 * 0.12), cellPx * 0.07, s1 * 2, 0, Math.PI * 2);
        ctx.fill();
    }
    if (landform.gully) {
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = "#88775a";
        ctx.lineWidth = Math.max(0.7, 1.1 * s);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.36, py + cellPx * 0.15);
        ctx.quadraticCurveTo(px - cellPx * 0.05, py - cellPx * 0.03, px + cellPx * 0.35, py + cellPx * 0.2);
        ctx.stroke();
    }
    if (landform.seasonalPool && snow < 0.55) {
        ctx.globalAlpha = 0.48;
        ctx.fillStyle = "#87a9a0";
        ctx.beginPath();
        ctx.ellipse(px + (s1 - 0.5) * cellPx * 0.25, py + cellPx * 0.08,
            cellPx * (0.13 + s2 * 0.08), cellPx * (0.055 + s3 * 0.04), s1, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#758f6a";
        ctx.globalAlpha = 0.52;
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.1, py + cellPx * 0.1);
        ctx.lineTo(px - cellPx * 0.08, py - cellPx * 0.07);
        ctx.moveTo(px + cellPx * 0.08, py + cellPx * 0.09);
        ctx.lineTo(px + cellPx * 0.1, py - cellPx * 0.06);
        ctx.stroke();
    }

    // Bare earth from grazing, drought and erosion.
    if (soil.bare > 0.25) {
        ctx.globalAlpha = 0.2 + soil.bare * 0.12;
        ctx.fillStyle = "#8f7959";
        ctx.beginPath();
        ctx.ellipse(px - cellPx * 0.24, py + cellPx * 0.2, cellPx * 0.12, cellPx * 0.045, -0.3, 0, Math.PI * 2);
        ctx.fill();
    }

    const tuftCount = Math.max(2, Math.min(9, Math.round(2 + density * 8)));
    for (let index = 0; index < tuftCount; index++) {
        const angle = roll(100 + index) * Math.PI * 2;
        const radius = Math.sqrt(roll(200 + index)) * cellPx * 0.36;
        const tx = px + Math.cos(angle) * radius;
        const ty = py + Math.sin(angle) * radius * 0.52;
        drawTuft(ctx, tx, ty, s, profile, roll(300 + index), snow);
    }

    if (profile.shrubPatches > 0.3 && profile.shrubs?.length) {
        const shrubCount = Math.max(1, Math.min(3, Math.round(profile.shrubPatches * 3)));
        for (let index = 0; index < shrubCount; index++) {
            const angle = roll(400 + index) * Math.PI * 2;
            const radius = 0.12 + roll(500 + index) * 0.28;
            drawShrub(ctx, px + Math.cos(angle) * cellPx * radius, py + Math.sin(angle) * cellPx * radius * 0.56,
                s, profile, profile.shrubs[index % profile.shrubs.length], roll(600 + index));
        }
    }

    const flowers = profile.flowers || [];
    for (let index = 0; index < Math.min(3, flowers.length); index++) {
        if (roll(700 + index) > 0.84) continue;
        const angle = roll(710 + index) * Math.PI * 2;
        const radius = 0.08 + roll(720 + index) * 0.32;
        drawFlower(ctx, px + Math.cos(angle) * cellPx * radius, py + Math.sin(angle) * cellPx * radius * 0.5,
            s, flowers[index], roll(730 + index));
    }
    const herbs = profile.herbs || [];
    for (let index = 0; index < Math.min(2, herbs.length); index++) {
        const angle = roll(800 + index) * Math.PI * 2;
        const radius = 0.12 + roll(810 + index) * 0.3;
        drawHerb(ctx, px + Math.cos(angle) * cellPx * radius, py + Math.sin(angle) * cellPx * radius * 0.56,
            s, herbs[index], roll(820 + index));
    }

    // A tree island is mostly drawn by the tree lattice. On a ground-only tile,
    // a low sapling keeps the island legible without turning every tile into a
    // wood. The actual trees remain on the sparse tree sample.
    if (profile.trees?.length && s1 > 0.54) {
        ctx.globalAlpha = 0.52;
        ctx.strokeStyle = "#6e5c42";
        ctx.lineWidth = Math.max(0.8, 1.2 * s);
        ctx.beginPath();
        ctx.moveTo(px + cellPx * 0.28, py + cellPx * 0.12);
        ctx.lineTo(px + cellPx * 0.28, py - cellPx * 0.07);
        ctx.stroke();
        ctx.fillStyle = colour(profile.leafColour, "#657547");
        ctx.beginPath();
        ctx.ellipse(px + cellPx * 0.28, py - cellPx * 0.1, cellPx * 0.09, cellPx * 0.055, 0.2, 0, Math.PI * 2);
        ctx.fill();
    }

    if (visual.dust > 0.2 || visual.dustStorm > 0.25) {
        ctx.globalAlpha = 0.08 + clamp01(visual.dustStorm) * 0.12;
        ctx.fillStyle = "#cdb483";
        ctx.beginPath();
        ctx.ellipse(px, py - cellPx * 0.02, cellPx * 0.5, cellPx * 0.15, 0.06, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = "#d6bf90";
        ctx.lineWidth = Math.max(0.55, 0.75 * s);
        ctx.beginPath();
        for (let index = 0; index < 3; index++) {
            const y = py - cellPx * (0.04 + index * 0.07);
            ctx.moveTo(px - cellPx * 0.3, y);
            ctx.quadraticCurveTo(px, y - cellPx * 0.03, px + cellPx * 0.32, y + cellPx * 0.02);
        }
        ctx.stroke();
    }

    if (snow > 0.16) {
        ctx.globalAlpha = 0.24 + snow * 0.38;
        ctx.fillStyle = "#e5e9e5";
        ctx.beginPath();
        ctx.ellipse(px, py + cellPx * 0.12, cellPx * (0.28 + snow * 0.15), cellPx * 0.07, 0.03, 0, Math.PI * 2);
        ctx.ellipse(px - cellPx * 0.2, py + cellPx * 0.05, cellPx * 0.11, cellPx * 0.04, -0.2, 0, Math.PI * 2);
        ctx.fill();
    }

    if (zoom >= 0.95 && s3 > 0.9 && profile.fauna?.length) {
        const animal = profile.fauna[Math.floor(s2 * profile.fauna.length) % profile.fauna.length];
        if (animal) drawSteppeAnimal(ctx, px + (s2 - 0.5) * cellPx * 0.32, py + cellPx * 0.02, s, animal, s1);
    }
    ctx.restore();
}
