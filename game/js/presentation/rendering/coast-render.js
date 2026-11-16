// Coastal detail layer (spec 1.2.14.1–1.2.14.71).
//
// The baked terrain carries the broad sand, shingle, water and vegetation
// colours. This layer supplies the readable coast: surf-cut beaches, dunes,
// cliffs, lagoons, tidal creeks, reefs, salt marsh, beach grass, seabirds,
// seals, driftwood, boats and the works built by the realm. Every loop is
// capped and every roll comes from the deterministic ecology profile, so a
// low-end frame pays only for visible tiles.

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

function wavePath(ctx, px, py, cellPx, progress, amplitude, alpha, colourValue) {
    ctx.save();
    ctx.strokeStyle = rgba(colourValue, alpha);
    ctx.lineWidth = Math.max(0.6, cellPx * 0.025);
    ctx.beginPath();
    const start = px - cellPx * 0.42;
    const end = px + cellPx * 0.42;
    for (let index = 0; index <= 8; index++) {
        const t = index / 8;
        const x = start + (end - start) * t;
        const y = py + Math.sin((t * 2.5 + progress) * Math.PI * 2) * cellPx * amplitude;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
}

export function drawCoastGround(ctx, px, py, cellPx, profile, s1, s2, s3) {
    if (!profile?.coastal || profile.water?.sea) return;
    const land = profile.landform;
    const visual = profile.visual;
    ctx.save();
    if (land.sand > 0.28) {
        ctx.fillStyle = rgba(visual.sandHex, 0.18 + land.sand * 0.16);
        poly(ctx, [
            [px - cellPx * 0.5, py + cellPx * 0.32],
            [px - cellPx * 0.28, py - cellPx * (0.22 + s1 * 0.1)],
            [px + cellPx * 0.42, py - cellPx * (0.18 + s2 * 0.12)],
            [px + cellPx * 0.5, py + cellPx * 0.34],
        ]);
    }
    if (land.shingle > 0.34) {
        ctx.fillStyle = rgba(visual.shingleHex, 0.2 + land.shingle * 0.12);
        const count = 3 + Math.floor(s3 * 3);
        for (let index = 0; index < count; index++) {
            const x = px + (s1 - 0.5) * cellPx * (0.62 + index * 0.04);
            const y = py + (s2 - 0.5) * cellPx * (0.42 + index * 0.03);
            ctx.beginPath();
            ctx.ellipse(x, y, cellPx * (0.02 + s3 * 0.02), cellPx * 0.012, s1 * 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (land.cliff > 0.42) {
        ctx.globalAlpha = 0.28 + land.cliff * 0.18;
        ctx.fillStyle = colour(visual.rockHex, "#77746b");
        poly(ctx, [
            [px - cellPx * 0.46, py + cellPx * 0.3],
            [px - cellPx * 0.34, py - cellPx * (0.3 + land.cliff * 0.2)],
            [px - cellPx * 0.1, py - cellPx * (0.18 + s1 * 0.12)],
            [px + cellPx * 0.06, py + cellPx * 0.3],
        ]);
        ctx.fillStyle = "#4d514f";
        poly(ctx, [
            [px - cellPx * 0.1, py - cellPx * (0.18 + s1 * 0.12)],
            [px + cellPx * 0.38, py - cellPx * (0.28 + land.cliff * 0.18)],
            [px + cellPx * 0.46, py + cellPx * 0.3],
            [px + cellPx * 0.06, py + cellPx * 0.3],
        ]);
    }
    if (land.marsh > 0.38 || land.tidal > 0.34) {
        ctx.globalAlpha = 0.14 + land.marsh * 0.12;
        ctx.fillStyle = rgba(visual.marshHex, 0.6);
        for (let index = 0; index < 4; index++) {
            const y = py + (index - 1.5) * cellPx * 0.08;
            ctx.fillRect(px - cellPx * 0.42, y, cellPx * 0.84, cellPx * 0.018);
        }
        ctx.globalAlpha = 0.24;
        ctx.strokeStyle = rgba(visual.waterHex, 0.55);
        ctx.lineWidth = Math.max(0.4, cellPx * 0.014);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.46, py + cellPx * 0.34);
        ctx.bezierCurveTo(px - cellPx * 0.1, py - cellPx * 0.05, px + cellPx * 0.12, py + cellPx * 0.3, px + cellPx * 0.46, py - cellPx * 0.08);
        ctx.stroke();
    }
    if (land.dune > 0.36) {
        ctx.globalAlpha = 0.2 + land.dune * 0.14;
        ctx.fillStyle = rgba(visual.sandHex, 0.8);
        for (let index = 0; index < 2; index++) {
            const x = px + (s1 - 0.5) * cellPx * 0.34 + index * cellPx * 0.24;
            const y = py - cellPx * (0.06 + s2 * 0.12);
            ctx.beginPath();
            ctx.ellipse(x, y, cellPx * (0.24 + s3 * 0.08), cellPx * (0.08 + s2 * 0.03), s1 * 0.2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

export function drawCoastWater(ctx, px, py, cellPx, profile, s1, s2, s3, tick = 0) {
    if (!profile?.coastal || !profile.water?.sea) return;
    const visual = profile.visual;
    const water = profile.water;
    ctx.save();
    if (water.shallow) {
        ctx.fillStyle = rgba(visual.foamHex, 0.16 + s1 * 0.08);
        ctx.beginPath();
        ctx.ellipse(px, py + cellPx * 0.08, cellPx * 0.42, cellPx * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    if (profile.landform.reef > 0.46) {
        ctx.fillStyle = rgba(visual.rockHex, 0.3);
        for (let index = 0; index < 3; index++) {
            const x = px + (s1 + index * 0.17 - 0.5) * cellPx * 0.6;
            const y = py + (s2 + index * 0.13 - 0.5) * cellPx * 0.34;
            ctx.beginPath();
            ctx.ellipse(x, y, cellPx * 0.08, cellPx * 0.035, index, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (profile.landform.sandbank > 0.48) {
        ctx.fillStyle = rgba(visual.sandHex, 0.28);
        ctx.beginPath();
        ctx.ellipse(px + (s1 - 0.5) * cellPx * 0.24, py + (s2 - 0.5) * cellPx * 0.2, cellPx * 0.3, cellPx * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    if (water.wave > 0.32) {
        wavePath(ctx, px, py - cellPx * 0.04, cellPx, (tick * 0.004 + s1) % 1, 0.028, 0.16 + water.wave * 0.22, visual.foamHex);
        wavePath(ctx, px, py + cellPx * 0.2, cellPx, (tick * 0.003 + s2) % 1, 0.02, 0.1 + water.wave * 0.16, visual.waterHex);
    }
    if (profile.climate.ice > 0.25) {
        ctx.fillStyle = rgba(visual.iceHex, 0.32);
        for (let index = 0; index < 2; index++) {
            ctx.beginPath();
            ctx.ellipse(px + (s1 - 0.5) * cellPx * 0.4 + index * cellPx * 0.2, py + (s2 - 0.5) * cellPx * 0.25,
                cellPx * (0.18 + s3 * 0.05), cellPx * 0.035, 0.2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

function drawGrassTuft(ctx, x, y, size, colourValue, alpha = 0.5, blades = 4) {
    ctx.save();
    ctx.strokeStyle = rgba(colourValue, alpha);
    ctx.lineWidth = Math.max(0.4, size * 0.045);
    for (let index = 0; index < blades; index++) {
        const offset = (index - (blades - 1) / 2) * size * 0.12;
        ctx.beginPath();
        ctx.moveTo(x + offset, y);
        ctx.quadraticCurveTo(x + offset + size * 0.08, y - size * 0.55, x + offset - size * 0.1, y - size);
        ctx.stroke();
    }
    ctx.restore();
}

function drawWader(ctx, x, y, size, colourValue) {
    ctx.save();
    ctx.strokeStyle = colourValue;
    ctx.fillStyle = colourValue;
    ctx.lineWidth = Math.max(0.4, size * 0.045);
    ctx.beginPath();
    ctx.ellipse(x, y, size * 0.12, size * 0.06, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + size * 0.08, y - size * 0.02);
    ctx.lineTo(x + size * 0.18, y - size * 0.16);
    ctx.moveTo(x, y + size * 0.05);
    ctx.lineTo(x - size * 0.03, y + size * 0.2);
    ctx.moveTo(x + size * 0.03, y + size * 0.05);
    ctx.lineTo(x + size * 0.07, y + size * 0.2);
    ctx.stroke();
    ctx.restore();
}

export function drawCoastDetails(ctx, px, py, cellPx, profile, s1, s2, s3, tick = 0, zoom = 1) {
    if (!profile?.coastal || profile.water?.sea) return;
    const visual = profile.visual;
    const veg = profile.vegetation;
    const land = profile.landform;
    const level = Math.max(0, Math.min(1, zoom / 1.2));
    ctx.save();
    // Beach grass and dune plants are the first readable edge of land.
    if (veg.beachGrass || veg.dunePlants || (land.sand > 0.32 && s1 > 0.36)) {
        const count = 3 + Math.floor(s2 * 3);
        for (let index = 0; index < count; index++) {
            const x = px + (s1 + index * 0.21 - 0.45) * cellPx * 0.6;
            const y = py + (s3 + index * 0.13 - 0.35) * cellPx * 0.24;
            drawGrassTuft(ctx, x, y, cellPx * (0.16 + s2 * 0.08), visual.grassHex, 0.34 + s3 * 0.22, 3 + (index % 2));
        }
    }
    if (veg.reeds) {
        const count = 3 + Math.floor(s1 * 4);
        for (let index = 0; index < count; index++) {
            const x = px + (s2 + index * 0.17 - 0.46) * cellPx * 0.7;
            const y = py + (s3 + index * 0.1 - 0.32) * cellPx * 0.2;
            drawGrassTuft(ctx, x, y, cellPx * (0.24 + s1 * 0.1), visual.marshHex, 0.42, 4);
        }
    }
    if (land.marsh > 0.45) {
        ctx.fillStyle = rgba(visual.waterHex, 0.25);
        ctx.beginPath();
        ctx.ellipse(px + (s1 - 0.5) * cellPx * 0.3, py + cellPx * 0.16, cellPx * 0.24, cellPx * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
        if (s1 > 0.55) drawWader(ctx, px + (s2 - 0.5) * cellPx * 0.4, py + cellPx * 0.22, cellPx * 0.5, "#e6e2cf");
    }
    // Shells, pebbles and driftwood keep the beach from reading as a flat fill.
    if (land.sand > 0.4 && s2 > 0.42) {
        ctx.fillStyle = rgba("#f0e6cf", 0.55);
        for (let index = 0; index < 3; index++) {
            const x = px + (s1 + index * 0.31 - 0.4) * cellPx * 0.65;
            const y = py + (s3 + index * 0.19 - 0.28) * cellPx * 0.3;
            ctx.beginPath();
            ctx.arc(x, y, cellPx * (0.012 + s2 * 0.008), 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (profile.goods.some(good => good.id === "driftwood") && s3 > 0.58) {
        ctx.strokeStyle = rgba("#8c7758", 0.55);
        ctx.lineWidth = Math.max(0.5, cellPx * 0.04 * level);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.2, py + cellPx * 0.1);
        ctx.lineTo(px + cellPx * 0.16, py - cellPx * 0.02);
        ctx.stroke();
    }
    if (land.outcrop > 0.45) {
        ctx.fillStyle = rgba(visual.rockHex, 0.34);
        for (let index = 0; index < 2; index++) {
            ctx.beginPath();
            ctx.ellipse(px + (s1 + index * 0.2 - 0.32) * cellPx * 0.5, py + (s2 - 0.5) * cellPx * 0.28,
                cellPx * 0.1, cellPx * 0.05, 0.4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    // Wildlife silhouettes are intentionally sparse; they are observations,
    // not a second agent simulation.
    for (const entry of profile.fauna.slice(0, 3)) {
        if (entry.group === "seabird") {
            ctx.strokeStyle = rgba("#35464b", 0.65);
            ctx.lineWidth = Math.max(0.5, cellPx * 0.018);
            const x = px + (s1 - 0.5) * cellPx * 0.55;
            const y = py - cellPx * (0.18 + s2 * 0.14);
            ctx.beginPath();
            ctx.moveTo(x - cellPx * 0.06, y);
            ctx.quadraticCurveTo(x - cellPx * 0.01, y - cellPx * 0.07, x, y);
            ctx.quadraticCurveTo(x + cellPx * 0.01, y - cellPx * 0.07, x + cellPx * 0.06, y);
            ctx.stroke();
        } else if (entry.group === "marine-mammal") {
            ctx.fillStyle = rgba("#4b5353", 0.55);
            ctx.beginPath();
            ctx.ellipse(px + (s2 - 0.5) * cellPx * 0.46, py + cellPx * 0.18, cellPx * 0.11, cellPx * 0.035, -0.1, 0, Math.PI * 2);
            ctx.fill();
        } else if (entry.group === "wader") {
            drawWader(ctx, px + (s3 - 0.5) * cellPx * 0.42, py + cellPx * 0.1, cellPx * 0.42, "#e1ddc9");
        }
    }
    // A small work marker on the shore makes a built harbour or lighthouse
    // visible at rooftop distance without drawing a second building sprite.
    const works = profile.use || {};
    if (works.lighthouse) {
        ctx.fillStyle = "#e9dfc2";
        ctx.fillRect(px + cellPx * 0.18, py - cellPx * 0.34, cellPx * 0.08, cellPx * 0.2);
        ctx.fillStyle = "#9c6045";
        ctx.fillRect(px + cellPx * 0.17, py - cellPx * 0.36, cellPx * 0.1, cellPx * 0.035);
        ctx.fillStyle = rgba("#f4d27a", 0.7);
        ctx.beginPath();
        ctx.arc(px + cellPx * 0.22, py - cellPx * 0.37, cellPx * 0.035, 0, Math.PI * 2);
        ctx.fill();
    } else if (works.harbour || works.navalBase) {
        ctx.strokeStyle = rgba("#6b5740", 0.55);
        ctx.lineWidth = Math.max(0.5, cellPx * 0.04);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.12, py + cellPx * 0.08);
        ctx.lineTo(px + cellPx * 0.28, py + cellPx * 0.08);
        ctx.moveTo(px + cellPx * 0.02, py + cellPx * 0.08);
        ctx.lineTo(px + cellPx * 0.08, py - cellPx * 0.06);
        ctx.stroke();
    } else if (works.fishingVillage || works.saltworks) {
        ctx.fillStyle = rgba("#8b7a5d", 0.45);
        ctx.fillRect(px - cellPx * 0.16, py - cellPx * 0.02, cellPx * 0.12, cellPx * 0.08);
    }
    ctx.restore();
}

export function drawCoastTree(ctx, px, py, cellPx, tree, profile, roll = 0.5) {
    if (!tree) return;
    const x = px + (Number(tree.offsetX) || 0) * cellPx;
    const y = py + (Number(tree.offsetY) || 0) * cellPx;
    const scale = Math.max(0.35, Number(tree.scale) || 0.7);
    const height = cellPx * (0.5 + scale * 0.35) * (tree.kind === "conifer" ? 1.2 : 1);
    const crown = cellPx * (0.18 + scale * 0.12);
    const sway = Math.sin((Number(profile?.visual?.wind) || 0.3) * 3 + roll * 6) * cellPx * 0.04;
    ctx.save();
    ctx.strokeStyle = "#5a4735";
    ctx.lineWidth = Math.max(0.6, cellPx * 0.045 * scale);
    ctx.beginPath();
    ctx.moveTo(x, y + cellPx * 0.08);
    ctx.quadraticCurveTo(x + sway * 0.6, y - height * 0.45, x + sway, y - height);
    ctx.stroke();
    const leaf = tree.seasonColour || "#5e7a4a";
    ctx.fillStyle = rgba(leaf, 0.7);
    if (tree.kind === "conifer") {
        for (let index = 0; index < 3; index++) {
            const t = index / 3;
            poly(ctx, [
                [x + sway - crown * (0.9 - t * 0.45), y - height * (0.36 + t * 0.2)],
                [x + sway, y - height * (1.02 - t * 0.06)],
                [x + sway + crown * (0.9 - t * 0.45), y - height * (0.36 + t * 0.2)],
            ]);
        }
    } else {
        ctx.beginPath();
        ctx.ellipse(x + sway, y - height * 0.76, crown * 1.1, crown * 0.78, 0.1, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
