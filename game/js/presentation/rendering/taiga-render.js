// Taiga detail layer (spec 1.2.10.1–1.2.10.56).
//
// The baked terrain supplies the broad boreal colour. This layer adds what
// makes the taiga readable: needle litter and moss, lichen heath, exposed
// roots and stumps, bog pools and lake ice, sedges, berry shrubs, fireweed,
// snow patches, fire scars, windthrow and a bounded glimpse of wildlife. Every
// value comes from the deterministic taiga profile, and every loop is capped so
// low-end devices pay only for visible detail.

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

function colour(value, fallback) {
    return typeof value === "string" && value.startsWith("#") ? value : fallback;
}

function hash(value, seed) {
    return ((Math.imul((value | 0) + 1, 0x9e3779b1) ^ Math.imul((seed | 0) + 1, 0x85ebca6b)) >>> 0) / 0x100000000;
}

function drawFloor(ctx, px, py, cellPx, s, profile, roll) {
    const visual = profile.visual || {};
    const moss = colour(visual.mossHex, "#7d8a64");
    const lichen = colour(visual.lichenHex, "#c4c19c");
    const forest = clamp01(profile.vegetation?.density);
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = moss;
    ctx.beginPath();
    ctx.ellipse(px - cellPx * 0.11, py + cellPx * 0.08, cellPx * (0.2 + roll * 0.08), cellPx * 0.1, roll * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = lichen;
    ctx.beginPath();
    ctx.ellipse(px + cellPx * 0.14, py - cellPx * 0.02, cellPx * 0.14, cellPx * 0.07, -roll * 0.4, 0, Math.PI * 2);
    ctx.fill();
    // Needle litter darkens the closed stands; moss dominates the wet ground.
    if (forest > 0.5) {
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = "#594b37";
        ctx.beginPath();
        ctx.ellipse(px + cellPx * 0.05, py + cellPx * 0.12, cellPx * 0.22, cellPx * 0.08, 0.2, 0, Math.PI * 2);
        ctx.fill();
    }
    if (profile.soil?.peat > 0.34) {
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = colour(visual.peatHex, "#5f5240");
        ctx.beginPath();
        ctx.ellipse(px - cellPx * 0.04, py + cellPx * 0.12, cellPx * 0.2, cellPx * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawWater(ctx, px, py, cellPx, s, profile, roll) {
    const water = profile.water || {};
    if (!water.openWater && !water.marsh && !water.ice) return;
    const ice = Boolean(water.ice || water.frozen);
    const river = Number(water.river) || 0;
    const lake = Math.max(Number(water.lake) || 0, Number(water.pond) || 0);
    const width = cellPx * (0.14 + Math.max(lake, river * 0.8, Number(water.marsh) * 0.64) * 0.18);
    const base = colour(profile.visual?.waterHex, ice ? "#c7d8dd" : "#547f88");
    ctx.globalAlpha = ice ? 0.58 : 0.52;
    ctx.fillStyle = base;
    ctx.beginPath();
    if (river > 0.34 && lake < 0.26) {
        ctx.moveTo(px - cellPx * 0.32, py + cellPx * 0.02);
        ctx.quadraticCurveTo(px - cellPx * 0.08, py + cellPx * (0.12 + roll * 0.04), px + cellPx * 0.3, py + cellPx * 0.07);
        ctx.lineTo(px + cellPx * 0.3, py + cellPx * 0.14);
        ctx.quadraticCurveTo(px - cellPx * 0.02, py + cellPx * (0.2 + roll * 0.03), px - cellPx * 0.32, py + cellPx * 0.09);
        ctx.closePath();
    } else {
        ctx.ellipse(px, py + cellPx * 0.1, width, width * 0.38, roll * 0.3, 0, Math.PI * 2);
    }
    ctx.fill();
    if (ice) {
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = "#eef5f7";
        ctx.lineWidth = Math.max(0.4, 0.55 * s);
        ctx.beginPath();
        ctx.moveTo(px - width * 0.7, py + cellPx * 0.08);
        ctx.lineTo(px - width * 0.2, py + cellPx * 0.11);
        ctx.lineTo(px + width * 0.36, py + cellPx * 0.08);
        ctx.stroke();
    } else {
        ctx.globalAlpha = 0.34;
        ctx.strokeStyle = "#a9c9ca";
        ctx.lineWidth = Math.max(0.35, 0.45 * s);
        ctx.beginPath();
        ctx.ellipse(px, py + cellPx * 0.08, width * 0.7, width * 0.2, roll * 0.3, 0, Math.PI * 2);
        ctx.stroke();
    }
    if (water.marsh > 0.24) {
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = "#67775a";
        ctx.beginPath();
        ctx.ellipse(px - width * 1.2, py + cellPx * 0.13, width * 1.3, width * 0.4, roll * 0.2, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawSedges(ctx, px, py, cellPx, s, profile, roll, tick) {
    const grasses = profile.vegetation?.grasses || [];
    if (!grasses.length || profile.vegetation?.light < 0.12) return;
    const sway = Math.sin((Number(tick) || 0) * 0.0016 + px * 0.12 + py * 0.08) * 1.2 * s;
    const count = Math.min(3, Math.max(2, grasses.length));
    ctx.lineWidth = Math.max(0.45, 0.55 * s);
    for (let index = 0; index < count; index++) {
        const grass = grasses[index % grasses.length];
        const base = colour(grass?.colours?.[0], profile.visual?.grassHex || "#75865c");
        const tip = colour(grass?.colours?.[1], base);
        const height = (grass?.id === "reed" || grass?.id === "cotton-sedge" ? 9 : 5.5) * s
            * (0.6 + clamp01(profile.vegetation?.bloom) * 0.3)
            * (profile.visual?.snowCover > 0.6 ? 0.35 : 1);
        const x = px + (index - count / 2) * cellPx * 0.08 + (roll - 0.5) * cellPx * 0.08;
        const y = py + cellPx * 0.13;
        ctx.globalAlpha = 0.42 + clamp01(profile.vegetation?.light) * 0.18;
        ctx.strokeStyle = base;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + sway * 0.3, y - height * 0.5, x + sway * 0.7, y - height);
        ctx.stroke();
        if (index === 0 && grass?.id === "cotton-sedge") {
            ctx.globalAlpha = 0.62;
            ctx.fillStyle = tip;
            ctx.beginPath();
            ctx.arc(x + sway * 0.7, y - height, 1.25 * s, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function drawShrub(ctx, px, py, cellPx, s, shrub, roll, snow) {
    const base = colour(shrub?.colours?.[0], "#5d7650");
    const light = colour(shrub?.colours?.[1], "#8b9c6d");
    const y = py + cellPx * 0.1;
    const width = cellPx * (0.085 + roll * 0.04);
    ctx.globalAlpha = 0.48;
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse(px - width * 0.5, y - 1.8 * s, width, width * 0.42, -0.2, 0, Math.PI * 2);
    ctx.ellipse(px + width * 0.38, y - 2.4 * s, width * 0.76, width * 0.36, 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.ellipse(px - width * 0.1, y - 3.1 * s, width * 0.5, width * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    if (shrub?.id === "blueberry" || shrub?.id === "lingonberry" || shrub?.id === "cloudberry") {
        ctx.globalAlpha = 0.58;
        ctx.fillStyle = shrub.id === "cloudberry" ? "#d5a25f" : "#465b50";
        ctx.beginPath();
        ctx.arc(px + width * 0.3, y - 3 * s, 0.9 * s, 0, Math.PI * 2);
        ctx.arc(px - width * 0.15, y - 4.2 * s, 0.78 * s, 0, Math.PI * 2);
        ctx.fill();
    }
    if (snow > 0.25) {
        ctx.globalAlpha = Math.min(0.76, snow * 0.68);
        ctx.fillStyle = "#edf3f5";
        ctx.beginPath();
        ctx.ellipse(px, y - 4.3 * s, width * 0.86, 1.1 * s, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawFlowers(ctx, px, py, cellPx, s, flowers, bloom, snow) {
    if (!flowers.length || bloom < 0.08 || snow > 0.5) return;
    const count = Math.min(2, flowers.length);
    for (let index = 0; index < count; index++) {
        const flower = flowers[index];
        const petal = colour(flower?.colours?.[0], "#c7b87f");
        const x = px + (index ? cellPx * 0.08 : -cellPx * 0.11);
        const y = py + cellPx * (index ? 0.04 : 0.08);
        ctx.globalAlpha = 0.58 + bloom * 0.16;
        ctx.strokeStyle = "#7e8a62";
        ctx.lineWidth = Math.max(0.35, 0.45 * s);
        ctx.beginPath();
        ctx.moveTo(x, y + 2 * s);
        ctx.lineTo(x, y - 1.2 * s);
        ctx.stroke();
        ctx.fillStyle = petal;
        ctx.beginPath();
        ctx.arc(x, y - 1.7 * s, 0.9 * s, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawDeadwood(ctx, px, py, cellPx, s, profile, roll) {
    const deadwood = clamp01(profile.vegetation?.deadwood);
    if (deadwood < 0.26) return;
    ctx.globalAlpha = 0.38;
    ctx.strokeStyle = "#5a4b3a";
    ctx.lineWidth = Math.max(0.7, 1.1 * s);
    const x = px + (roll - 0.5) * cellPx * 0.32;
    const y = py + cellPx * 0.1;
    ctx.beginPath();
    ctx.moveTo(x - cellPx * 0.08, y);
    ctx.lineTo(x + cellPx * 0.07, y - cellPx * 0.015);
    ctx.stroke();
    if (profile.vegetation?.deadwood > 0.4) {
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = "#6a5944";
        ctx.fillRect(x - 3.2 * s, y - 8 * s, 2.2 * s, 8 * s);
    }
    if (clamp01(profile.vegetation?.roots) > 0.3) {
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = "#695842";
        ctx.lineWidth = Math.max(0.45, 0.65 * s);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.12, py + cellPx * 0.15);
        ctx.lineTo(px - cellPx * 0.04, py + cellPx * 0.11);
        ctx.lineTo(px + cellPx * 0.02, py + cellPx * 0.15);
        ctx.stroke();
    }
}

function drawSnow(ctx, px, py, cellPx, profile, roll) {
    const snow = clamp01(profile.visual?.snowCover);
    if (snow < 0.2) return;
    ctx.globalAlpha = Math.min(0.68, snow * 0.58);
    ctx.fillStyle = "#edf3f5";
    ctx.beginPath();
    ctx.ellipse(px + cellPx * (roll - 0.5) * 0.14, py + cellPx * 0.07, cellPx * 0.23, cellPx * 0.09, roll * 0.2, 0, Math.PI * 2);
    ctx.fill();
}

function drawFire(ctx, px, py, cellPx, s, profile, roll) {
    if (profile.hazards?.fireRisk < 0.4) return;
    ctx.globalAlpha = 0.14 + (profile.hazards.fireRisk - 0.4) * 0.24;
    ctx.fillStyle = colour(profile.visual?.fireHex, "#4f4032");
    ctx.beginPath();
    ctx.ellipse(px + cellPx * 0.05, py + cellPx * 0.02, cellPx * 0.18, cellPx * 0.08, roll * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "#8b7650";
    ctx.lineWidth = Math.max(0.35, 0.45 * s);
    ctx.beginPath();
    ctx.moveTo(px - cellPx * 0.13, py + cellPx * 0.06);
    ctx.lineTo(px + cellPx * 0.12, py + cellPx * 0.04);
    ctx.stroke();
}

function drawFauna(ctx, px, py, cellPx, s, profile, roll, tick) {
    const fauna = (profile.fauna || []).slice(0, 3);
    if (!fauna.length || cellPx < 22) return;
    for (let index = 0; index < fauna.length; index++) {
        const entry = fauna[index];
        const x = px + (hash(index + 90, Math.floor(px + py)) - 0.5) * cellPx * 0.56;
        const y = py - cellPx * 0.1 + (index % 2) * cellPx * 0.06;
        ctx.globalAlpha = entry.group === "predator" ? 0.3 : 0.34;
        ctx.fillStyle = entry.id === "bear" ? "#5b4b3d" : entry.group === "predator" ? "#5a5d55" : "#6b6452";
        if (entry.group === "bird") {
            ctx.beginPath();
            ctx.ellipse(x, y, 1.5 * s, 0.8 * s, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = Math.max(0.4, 0.55 * s);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - 2 * s, y - 1.4 * s);
            ctx.moveTo(x, y);
            ctx.lineTo(x + 2 * s, y - 1.4 * s);
            ctx.stroke();
        } else if (entry.id === "bear") {
            ctx.beginPath();
            ctx.ellipse(x, y, 2.1 * s, 1.2 * s, 0, 0, Math.PI * 2);
            ctx.ellipse(x + 2 * s, y - 0.6 * s, 0.9 * s, 0.7 * s, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (entry.herd) {
            const count = Math.min(4, Math.max(2, Math.round((Number(entry.count) || 2) / 2)));
            for (let animal = 0; animal < count; animal++) {
                const ax = x + (animal - count / 2) * 2.2 * s;
                const ay = y + (animal % 2) * 1.1 * s;
                ctx.beginPath();
                ctx.ellipse(ax, ay, 1.05 * s, 0.6 * s, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = ctx.fillStyle;
                ctx.lineWidth = Math.max(0.35, 0.38 * s);
                ctx.beginPath();
                ctx.moveTo(ax - 0.5 * s, ay + 0.4 * s);
                ctx.lineTo(ax - 0.5 * s, ay + 1 * s);
                ctx.moveTo(ax + 0.5 * s, ay + 0.4 * s);
                ctx.lineTo(ax + 0.5 * s, ay + 1 * s);
                ctx.stroke();
            }
        } else {
            ctx.beginPath();
            ctx.ellipse(x, y, 1.3 * s, 0.7 * s, 0, 0, Math.PI * 2);
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

/**
 * Draw one taiga tile. Safe with a null profile; every loop is capped so the
 * layer stays far below the generic terrain detail budget.
 */
export function drawTaiga(ctx, px, py, cellPx, profile, s1 = 0.5, s2 = 0.5, s3 = 0.5, tick = 0, zoom = 1, sun = 0.6, dayOfYear = 150, climate = "taiga") {
    if (!ctx || !profile?.taiga || !(cellPx > 0)) return;
    const s = cellPx / 48;
    const roll = clamp01((Number(s1) || 0) * 0.55 + (Number(s2) || 0) * 0.3 + (Number(s3) || 0) * 0.15);
    const snow = clamp01(profile.visual?.snowCover);
    ctx.save();
    drawFloor(ctx, px, py, cellPx, s, profile, roll);
    drawWater(ctx, px, py, cellPx, s, profile, roll);
    drawSnow(ctx, px, py, cellPx, profile, roll);
    drawSedges(ctx, px, py, cellPx, s, profile, roll, tick);
    const shrubs = profile.vegetation?.shrubs || [];
    for (let index = 0; index < Math.min(2, shrubs.length); index++) {
        drawShrub(ctx, px + (index ? cellPx * 0.1 : -cellPx * 0.15), py + cellPx * (index ? 0.03 : 0.07), cellPx, s, shrubs[index], (roll + index * 0.27) % 1, snow);
    }
    drawFlowers(ctx, px, py, cellPx, s, profile.vegetation?.flowers || [], Number(profile.vegetation?.bloom) || 0, snow);
    drawDeadwood(ctx, px, py, cellPx, s, profile, roll);
    drawFire(ctx, px, py, cellPx, s, profile, roll);
    drawFauna(ctx, px, py, cellPx, s, profile, roll, tick);
    ctx.restore();
}

/**
 * Draw one taiga tree. Spruce and fir are tiered spires, pine is a high crown,
 * larch is an airy deciduous conifer and birch is a pale airy stem. The tree is
 * always rooted in its tile and stays finite at every zoom.
 */
// Winter ice is painted by the terrain detail layer because the baked ground
// colour is shared by every season. Keeping it per-tile avoids a full-map
// rebake when the first frost arrives.
export function drawTaigaIce(ctx, px, py, cellPx, s1 = 0.5, s2 = 0.5) {
    if (!ctx || !(cellPx > 0)) return;
    ctx.save();
    // Opaque fill with a one-pixel overlap: adjacent water tiles must read as
    // one frozen surface, not a grid of pale rectangles.
    ctx.fillStyle = "#b8cfd6";
    ctx.fillRect(px, py, cellPx + 1, cellPx + 1);
    // Sparse pressure cracks avoid a repeated stamp across a large lake.
    ctx.globalAlpha = 0.36;
    ctx.strokeStyle = "#e4eff1";
    ctx.lineWidth = Math.max(0.7, cellPx * 0.014);
    if (s1 > 0.52) {
        ctx.beginPath();
        ctx.moveTo(px + cellPx * (0.12 + s1 * 0.16), py + cellPx * 0.22);
        ctx.lineTo(px + cellPx * (0.4 + s2 * 0.16), py + cellPx * (0.46 + s1 * 0.08));
        ctx.lineTo(px + cellPx * (0.32 + s2 * 0.2), py + cellPx * 0.78);
        ctx.stroke();
    }
    if (s2 > 0.72) {
        ctx.beginPath();
        ctx.moveTo(px + cellPx * (0.62 + s2 * 0.12), py + cellPx * 0.3);
        ctx.lineTo(px + cellPx * (0.82 - s1 * 0.08), py + cellPx * 0.66);
        ctx.stroke();
    }
    ctx.restore();
}

export function drawTaigaTree(ctx, px, py, cellPx, tree, profile, roll = 0.5) {
    if (!ctx || !tree || !(cellPx > 0)) return;
    const s = cellPx / 48;
    const leaf = colour(tree.seasonColour, colour(profile?.visual?.leafHex, "#3d6047"));
    const snow = clamp01((profile?.visual?.snowCover || 0) * (Number(tree.snow) > 0 ? 1 : 0.7));
    const kind = tree.kind || "spruce";
    const conifer = kind === "spruce" || kind === "pine" || kind === "larch";
    const height = cellPx * (0.18 + (Number(tree.scale) || 0.7) * 0.16) * (kind === "dwarf-birch" ? 0.28 : 1);
    const x = px + (Number(tree.offsetX) || 0) * cellPx;
    const y = py + (Number(tree.offsetY) || 0) * cellPx + 4 * s;
    const bark = kind === "birch" || kind === "aspen" ? "#d8d2bf"
        : kind === "larch" ? "#6a513b" : kind === "pine" ? "#7a5836" : "#574131";
    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.strokeStyle = bark;
    ctx.lineWidth = Math.max(0.65, (kind === "birch" ? 1.2 : 1.7) * s);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (kind === "spruce" ? 0 : 1.2 * s), y - height * (conifer ? 0.55 : 0.48));
    ctx.stroke();
    ctx.globalAlpha = 0.64;
    ctx.fillStyle = leaf;
    if (kind === "spruce" || kind === "bog-pine") {
        // Tiered spire: each layer is a downward triangle, narrowing upward.
        for (let tier = 0; tier < 4; tier++) {
            const t = tier / 4;
            const width = cellPx * (0.19 - t * 0.11) * (kind === "bog-pine" ? 0.62 : 1);
            const top = y - height * (0.3 + t * 0.68);
            ctx.globalAlpha = 0.5 + t * 0.12;
            ctx.beginPath();
            ctx.moveTo(x - width, top);
            ctx.lineTo(x, top - height * 0.2);
            ctx.lineTo(x + width, top);
            ctx.closePath();
            ctx.fill();
            if (snow > 0.3 && tier > 1) {
                ctx.globalAlpha = Math.min(0.68, snow * 0.6);
                ctx.fillStyle = "#edf3f5";
                ctx.beginPath();
                ctx.ellipse(x, top - height * 0.06, width * 0.86, 1.15 * s, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = leaf;
            }
        }
    } else if (kind === "pine") {
        ctx.globalAlpha = 0.56;
        ctx.beginPath();
        ctx.ellipse(x, y - height * 0.92, cellPx * 0.17, cellPx * 0.065, 0, 0, Math.PI * 2);
        ctx.ellipse(x - cellPx * 0.07, y - height * 0.82, cellPx * 0.12, cellPx * 0.05, -0.1, 0, Math.PI * 2);
        ctx.fill();
        if (snow > 0.3) {
            ctx.globalAlpha = Math.min(0.62, snow * 0.58);
            ctx.fillStyle = "#edf3f5";
            ctx.beginPath();
            ctx.ellipse(x, y - height * 0.97, cellPx * 0.13, 1.3 * s, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (kind === "larch") {
        // Larch is a conifer that lets light through and drops its needles.
        for (let tier = 0; tier < 3; tier++) {
            const t = tier / 3;
            const width = cellPx * (0.16 - t * 0.08);
            const top = y - height * (0.4 + t * 0.6);
            ctx.globalAlpha = 0.4 + t * 0.12;
            ctx.beginPath();
            ctx.moveTo(x - width, top);
            ctx.lineTo(x, top - height * 0.22);
            ctx.lineTo(x + width, top);
            ctx.closePath();
            ctx.fill();
        }
        if (snow > 0.32) {
            ctx.globalAlpha = Math.min(0.55, snow * 0.52);
            ctx.fillStyle = "#edf3f5";
            ctx.beginPath();
            ctx.ellipse(x, y - height * 0.86, cellPx * 0.12, 1 * s, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    } else {
        // Birch, aspen, willow and rowan: a light, airy crown with a visible stem.
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.ellipse(x - cellPx * 0.055, y - height * 0.78, cellPx * 0.15, cellPx * 0.12, -0.15, 0, Math.PI * 2);
        ctx.ellipse(x + cellPx * 0.07, y - height * 0.84, cellPx * 0.13, cellPx * 0.1, 0.18, 0, Math.PI * 2);
        ctx.fill();
        if (kind === "birch") {
            ctx.globalAlpha = 0.46;
            ctx.strokeStyle = "#4b4a40";
            ctx.lineWidth = Math.max(0.3, 0.35 * s);
            ctx.beginPath();
            ctx.moveTo(x - 1.4 * s, y - height * 0.45);
            ctx.lineTo(x - 0.7 * s, y - height * 0.5);
            ctx.stroke();
        }
        if (snow > 0.28) {
            ctx.globalAlpha = Math.min(0.68, snow * 0.62);
            ctx.fillStyle = "#edf3f5";
            ctx.beginPath();
            ctx.ellipse(x - cellPx * 0.05, y - height * 0.87, cellPx * 0.12, 1.3 * s, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (tree.flowering) {
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = "#d8d2a4";
        ctx.beginPath();
        ctx.arc(x - 2 * s, y - height * 0.82, 0.8 * s, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
