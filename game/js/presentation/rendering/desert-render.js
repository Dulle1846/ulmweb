// Desert detail layer (spec 1.2.8.1–1.2.8.75).
//
// The baked terrain pass supplies the broad sand/rock colour field. This layer
// adds the readable desert surface: dune crests and slip faces, wind scour,
// gravel, salt crust, boulders, cliffs, mesas, canyons, caves, thorn scrub,
// succulents, rain flowers, palms, oasis water, fields, caravans and wildlife.
// Every mark is derived from the tile's stable profile and every loop is
// bounded, so the renderer stays cheap on a low-end device.

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function colour(value, fallback) {
    return typeof value === "string" && value.startsWith("#") ? value : fallback;
}

function hashOffset(value, seed) {
    return ((Math.imul((value | 0) + 1, 0x9e3779b1) ^ Math.imul((seed | 0) + 1, 0x85ebca6b)) >>> 0) / 0x100000000;
}

function drawDune(ctx, px, py, cellPx, s, profile, roll) {
    const crest = profile.dunes?.primary || "small-hills";
    const sand = colour(profile.sand?.hex || profile.visual?.sandHex, "#d0b57e");
    const shade = profile.season === "winter" ? "#b9af9d" : "#b28d5e";
    const width = cellPx * (crest === "great-dunes" ? 0.5 : crest === "linear-ridges" ? 0.43 : 0.33);
    const height = cellPx * (crest === "great-dunes" ? 0.19 : crest === "linear-ridges" ? 0.1 : 0.12);
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = sand;
    ctx.beginPath();
    if (crest === "crescent-dunes") {
        ctx.moveTo(px - width, py + height * 0.2);
        ctx.quadraticCurveTo(px - width * 0.4, py - height, px + width * 0.55, py - height * 0.25);
        ctx.quadraticCurveTo(px + width * 0.15, py + height * 0.7, px - width, py + height * 0.2);
    } else {
        ctx.ellipse(px + (roll - 0.5) * cellPx * 0.12, py + height * 0.12, width, height, roll * 0.15, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = shade;
    ctx.lineWidth = Math.max(0.65, 0.9 * s);
    ctx.beginPath();
    ctx.moveTo(px - width * 0.82, py + height * 0.24);
    ctx.quadraticCurveTo(px, py - height * 0.9, px + width * 0.8, py + height * 0.12);
    ctx.stroke();
    // The lee slope is a soft second ridge, not a filled pancake. It keeps a
    // dune field readable as flowing sand at interior zoom.
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = "#8e6f4b";
    ctx.beginPath();
    ctx.moveTo(px - width * 0.72, py + height * 0.46);
    ctx.quadraticCurveTo(px - width * 0.02, py - height * 0.02, px + width * 0.76, py + height * 0.34);
    ctx.stroke();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "#f0d9a5";
    ctx.beginPath();
    for (let index = 0; index < 3; index++) {
        const y = py - height * (0.1 + index * 0.18);
        ctx.moveTo(px - width * (0.55 - index * 0.1), y);
        ctx.quadraticCurveTo(px - width * 0.05, y - height * 0.18, px + width * (0.48 - index * 0.06), y + height * 0.06);
    }
    ctx.stroke();
}

function drawRock(ctx, px, py, cellPx, s, profile, roll) {
    const rocks = profile.rocks || {};
    const strong = rocks.mesa || rocks.cliff || rocks.canyon || rocks.cave || rocks.boulders;
    // Sand seas can carry a rock score without reading as a rock desert. Keep
    // exposed stone sparse there; mesas, cliffs, caves and boulders still draw.
    if (!strong && (!rocks.exposed || roll < 0.58)) return;
    const stone = profile.soil?.stone > 0.55 ? "#7d7568" : "#9b866b";
    ctx.globalAlpha = 0.58;
    ctx.fillStyle = stone;
    ctx.strokeStyle = "#5e5549";
    ctx.lineWidth = Math.max(0.65, s);
    if (rocks.mesa && roll > 0.3) {
        const local = hashOffset(Math.round(px + py * 7), 52);
        const mesa = 0.72 + local * 0.5;
        const mx = px + (local - 0.5) * cellPx * 0.18;
        const my = py + (roll - 0.5) * cellPx * 0.1;
        ctx.beginPath();
        ctx.moveTo(mx - cellPx * 0.3 * mesa, my + cellPx * 0.14 * mesa);
        ctx.lineTo(mx - cellPx * 0.24 * mesa, my - cellPx * 0.12 * mesa);
        ctx.lineTo(mx + cellPx * 0.17 * mesa, my - cellPx * 0.16 * mesa);
        ctx.lineTo(mx + cellPx * 0.3 * mesa, my + cellPx * 0.12 * mesa);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = "#c0a77f";
        ctx.fillRect(mx - cellPx * 0.2 * mesa, my - cellPx * 0.115 * mesa, cellPx * 0.38 * mesa, cellPx * 0.035 * mesa);
    } else if (rocks.cliff) {
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.2, py + cellPx * 0.18);
        ctx.lineTo(px - cellPx * 0.12, py - cellPx * 0.2);
        ctx.lineTo(px + cellPx * 0.16, py - cellPx * 0.12);
        ctx.lineTo(px + cellPx * 0.26, py + cellPx * 0.18);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.24;
        ctx.strokeStyle = "#d1b486";
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.1, py - cellPx * 0.05);
        ctx.lineTo(px + cellPx * 0.19, py - cellPx * 0.02);
        ctx.stroke();
    } else if (rocks.boulders) {
        const count = 2 + Math.round(roll * 2);
        for (let index = 0; index < count; index++) {
            const x = px + (roll * 2 - 1) * cellPx * 0.22 + index * cellPx * 0.12;
            const y = py + cellPx * (0.09 - (index % 2) * 0.08);
            ctx.beginPath();
            ctx.ellipse(x, y, cellPx * (0.07 + index * 0.012), cellPx * (0.05 + index * 0.008), roll, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (rocks.canyon) {
        ctx.globalAlpha = 0.34;
        ctx.strokeStyle = "#6b5946";
        ctx.lineWidth = Math.max(1, 1.8 * s);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.36, py + cellPx * 0.2);
        ctx.quadraticCurveTo(px - cellPx * 0.02, py - cellPx * 0.04, px + cellPx * 0.35, py + cellPx * 0.06);
        ctx.stroke();
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = "#e0c18b";
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.33, py + cellPx * 0.12);
        ctx.quadraticCurveTo(px, py - cellPx * 0.1, px + cellPx * 0.3, py);
        ctx.stroke();
    } else if (rocks.cave) {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = "#4e463c";
        ctx.beginPath();
        ctx.ellipse(px + cellPx * 0.05, py + cellPx * 0.03, cellPx * 0.09, cellPx * 0.12, roll * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = "#d3b888";
        ctx.beginPath();
        ctx.arc(px + cellPx * 0.05, py + cellPx * 0.03, cellPx * 0.12, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
    } else if (rocks.weathered || rocks.rugged) {
        ctx.beginPath();
        for (let index = 0; index < 4; index++) {
            const angle = roll * 3 + index * 0.9;
            const radius = cellPx * (0.08 + index * 0.035);
            const x = px + Math.cos(angle) * radius;
            const y = py + Math.sin(angle) * radius * 0.55;
            if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
    }
    if (rocks.scree || profile.soil?.gravel > 0.36) {
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = "#766d60";
        for (let index = 0; index < 5; index++) {
            const x = px + (hashOffset(index + 700, hashOffset(px, py) * 1000) - 0.5) * cellPx * 0.72;
            const y = py + (hashOffset(index + 710, hashOffset(py, px) * 1000) - 0.5) * cellPx * 0.32;
            ctx.fillRect(x, y, Math.max(0.7, s * 1.3), Math.max(0.6, s * 0.8));
        }
    }
}

function drawSalt(ctx, px, py, cellPx, s, profile, roll) {
    if (profile.soil?.salt < 0.22) return;
    const points = 3 + Math.round(profile.soil.salt * 4);
    ctx.globalAlpha = 0.24 + profile.soil.salt * 0.22;
    ctx.fillStyle = "#e2dbc4";
    ctx.beginPath();
    ctx.ellipse(px + (roll - 0.5) * cellPx * 0.2, py + cellPx * 0.04,
        cellPx * (0.16 + roll * 0.11), cellPx * (0.06 + profile.soil.salt * 0.04), roll * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = "#f0e7cf";
    ctx.lineWidth = Math.max(0.4, 0.55 * s);
    ctx.beginPath();
    for (let index = 0; index < points; index++) {
        const x = px + (hashOffset(index + 600, hashOffset(px, py) * 1000) - 0.5) * cellPx * 0.3;
        const y = py + (hashOffset(index + 610, hashOffset(py, px) * 1000) - 0.5) * cellPx * 0.12;
        ctx.moveTo(x, y);
        ctx.lineTo(x + cellPx * 0.07, y + cellPx * 0.015);
    }
    ctx.stroke();
}

function drawTuft(ctx, x, y, s, profile, roll, snow) {
    const grass = profile.vegetation?.grasses?.[Math.floor(roll * (profile.vegetation.grasses.length || 1))] || profile.vegetation?.grasses?.[0];
    const base = colour(grass?.colours?.[0], profile.grassHex || "#9b9464");
    const height = (grass?.height === "tall" ? 8 : 4.4) * s;
    const lean = (roll - 0.5) * 4.2 * s;
    ctx.globalAlpha = 0.5 + roll * 0.18;
    ctx.strokeStyle = base;
    ctx.lineWidth = Math.max(0.55, 0.8 * s);
    ctx.beginPath();
    ctx.moveTo(x - 1.4 * s, y + 2 * s);
    ctx.quadraticCurveTo(x - 1.2 * s + lean * 0.3, y - height * 0.45, x - 0.8 * s + lean, y - height);
    ctx.moveTo(x + 1.1 * s, y + 1.8 * s);
    ctx.quadraticCurveTo(x + 1.4 * s + lean * 0.2, y - height * 0.3, x + 1.8 * s + lean * 0.7, y - height * 0.7);
    ctx.stroke();
    if (snow > 0.24) {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = "#ece9df";
        ctx.beginPath();
        ctx.ellipse(x + lean, y - height, 1.2 * s, 0.5 * s, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawShrub(ctx, x, y, s, shrub, roll) {
    const base = colour(shrub?.colours?.[0], "#7c7752");
    const leaf = colour(shrub?.colours?.[1], "#a09566");
    const height = (6 + roll * 5) * s;
    ctx.globalAlpha = 0.68;
    ctx.strokeStyle = "#6a5c42";
    ctx.lineWidth = Math.max(0.6, 1 * s);
    ctx.beginPath();
    ctx.moveTo(x, y + 3 * s);
    ctx.lineTo(x - 1.1 * s, y - height * 0.4);
    ctx.moveTo(x, y + 2.6 * s);
    ctx.lineTo(x + 1.3 * s, y - height * 0.5);
    ctx.stroke();
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse(x - 1.2 * s, y - height * 0.48, (2.5 + roll * 1.2) * s, (1.8 + roll * 0.8) * s, -0.4, 0, Math.PI * 2);
    ctx.ellipse(x + 1.1 * s, y - height * 0.58, (2.1 + roll) * s, (1.6 + roll * 0.7) * s, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.58;
    ctx.fillStyle = leaf;
    ctx.beginPath();
    ctx.ellipse(x - 1.6 * s, y - height * 0.65, 1.7 * s, 1.1 * s, -0.2, 0, Math.PI * 2);
    ctx.fill();
    if (shrub?.thorny) {
        ctx.globalAlpha = 0.56;
        ctx.strokeStyle = "#574b36";
        ctx.lineWidth = Math.max(0.45, 0.65 * s);
        ctx.beginPath();
        for (let index = 0; index < 3; index++) {
            const tx = x + (index - 1) * 2 * s;
            const ty = y - height * (0.35 + (index % 2) * 0.2);
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx + (index % 2 ? 2.2 : -2.1) * s, ty - (2 + index * 0.3) * s);
        }
        ctx.stroke();
    }
}

function drawSucculent(ctx, x, y, s, succulent, roll) {
    const base = colour(succulent?.colours?.[0], "#758a67");
    const tip = colour(succulent?.colours?.[1], "#a4b190");
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = base;
    ctx.beginPath();
    if (succulent?.id === "barrel-cactus") {
        ctx.ellipse(x, y - 2.4 * s, 2.2 * s, 3.4 * s, 0, 0, Math.PI * 2);
        ctx.fill();
    } else {
        const leaves = succulent?.id === "agave" ? 6 : 4;
        for (let index = 0; index < leaves; index++) {
            const angle = (Math.PI * 2 * index) / leaves + roll;
            ctx.ellipse(x + Math.cos(angle) * 1.7 * s, y - 2.1 * s + Math.sin(angle) * 1.2 * s,
                0.9 * s, 2.4 * s, angle, 0, Math.PI * 2);
        }
        ctx.fill();
    }
    ctx.globalAlpha = 0.48;
    ctx.fillStyle = tip;
    ctx.beginPath();
    ctx.arc(x, y - 3.7 * s, 0.85 * s, 0, Math.PI * 2);
    ctx.fill();
}

function drawFlower(ctx, x, y, s, flower, roll) {
    const petal = colour(flower?.colours?.[0], "#d5c49b");
    const centre = colour(flower?.colours?.[1], "#f0e3bd");
    ctx.globalAlpha = 0.74;
    ctx.strokeStyle = "#8b875a";
    ctx.lineWidth = Math.max(0.4, 0.6 * s);
    ctx.beginPath();
    ctx.moveTo(x, y + 1.8 * s);
    ctx.lineTo(x + (roll - 0.5) * 1.2 * s, y - 2 * s);
    ctx.stroke();
    ctx.fillStyle = petal;
    ctx.beginPath();
    for (let index = 0; index < 4; index++) {
        const angle = (Math.PI * 2 * index) / 4 + roll;
        ctx.ellipse(x + Math.cos(angle) * 1.2 * s, y - 2.2 * s + Math.sin(angle) * 1.1 * s,
            0.85 * s, 0.5 * s, angle, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = centre;
    ctx.beginPath();
    ctx.arc(x, y - 2.2 * s, 0.55 * s, 0, Math.PI * 2);
    ctx.fill();
}

function drawPalm(ctx, x, y, s, palm, roll) {
    const trunk = "#806444";
    const leaf = colour(palm?.seasonColour, "#68834c");
    const height = (15 + roll * 7) * s;
    ctx.globalAlpha = 0.78;
    ctx.strokeStyle = trunk;
    ctx.lineWidth = Math.max(0.9, 1.8 * s);
    ctx.beginPath();
    ctx.moveTo(x, y + 3 * s);
    ctx.quadraticCurveTo(x + (roll - 0.5) * 3 * s, y - height * 0.55, x + (roll - 0.5) * 4 * s, y - height);
    ctx.stroke();
    const crownX = x + (roll - 0.5) * 4 * s;
    ctx.fillStyle = leaf;
    ctx.globalAlpha = 0.7;
    for (let index = 0; index < 7; index++) {
        const angle = -Math.PI * 0.92 + (Math.PI * 1.84 * index) / 6;
        ctx.beginPath();
        ctx.ellipse(crownX + Math.cos(angle) * 5 * s, y - height + Math.sin(angle) * 2.8 * s,
            5.2 * s, 1.3 * s, angle, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 0.58;
    ctx.fillStyle = "#5d7246";
    ctx.beginPath();
    ctx.arc(crownX, y - height, 1.6 * s, 0, Math.PI * 2);
    ctx.fill();
}

function drawWaters(ctx, px, py, cellPx, s, profile, roll) {
    const water = profile.water || {};
    if (!water.oasis && !water.spring && !water.pond && !water.waterhole) return;
    const waterX = px + (roll - 0.5) * cellPx * 0.15;
    const waterY = py + cellPx * 0.08;
    ctx.globalAlpha = 0.56;
    ctx.fillStyle = "#5f9a98";
    ctx.beginPath();
    ctx.ellipse(waterX, waterY, cellPx * (water.pond ? 0.16 : 0.09), cellPx * (water.pond ? 0.07 : 0.035), roll * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.38;
    ctx.strokeStyle = "#b7d5c4";
    ctx.lineWidth = Math.max(0.5, 0.65 * s);
    ctx.beginPath();
    ctx.moveTo(waterX - cellPx * 0.1, waterY);
    ctx.quadraticCurveTo(waterX, waterY - cellPx * 0.025, waterX + cellPx * 0.11, waterY + cellPx * 0.005);
    ctx.stroke();
    if (water.oasis) {
        ctx.globalAlpha = 0.42;
        ctx.strokeStyle = "#587f4d";
        ctx.lineWidth = Math.max(0.45, 0.6 * s);
        ctx.beginPath();
        for (let index = 0; index < 3; index++) {
            const x = waterX - cellPx * 0.13 + index * cellPx * 0.11;
            ctx.moveTo(x, waterY + cellPx * 0.025);
            ctx.lineTo(x + (index - 1) * cellPx * 0.01, waterY - cellPx * 0.055);
        }
        ctx.stroke();
    }
}

function drawField(ctx, px, py, cellPx, s, profile, roll) {
    if (!profile.settlement?.fields) return;
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = "#a09b58";
    ctx.fillRect(px - cellPx * 0.2, py + cellPx * 0.04, cellPx * 0.36, cellPx * 0.12);
    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = "#6d7344";
    ctx.lineWidth = Math.max(0.4, 0.55 * s);
    ctx.beginPath();
    for (let index = 0; index < 3; index++) {
        const x = px - cellPx * 0.16 + index * cellPx * 0.1 + (roll - 0.5) * 0.02;
        ctx.moveTo(x, py + cellPx * 0.05);
        ctx.lineTo(x, py + cellPx * 0.14);
    }
    ctx.stroke();
    if (profile.settlement.orchards) {
        ctx.globalAlpha = 0.46;
        ctx.fillStyle = "#64804c";
        ctx.beginPath();
        ctx.arc(px + cellPx * 0.23, py + cellPx * 0.02, 2.4 * s, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawCaravan(ctx, px, py, cellPx, s, profile) {
    if (!profile.settlement?.label?.includes("caravan") && !profile.economy?.caravanTrade) return;
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = "#8e6e4d";
    ctx.lineWidth = Math.max(0.5, 0.65 * s);
    ctx.beginPath();
    ctx.moveTo(px - cellPx * 0.3, py + cellPx * 0.2);
    ctx.lineTo(px + cellPx * 0.24, py + cellPx * 0.02);
    ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#7f684e";
    ctx.beginPath();
    ctx.arc(px + cellPx * 0.25, py + cellPx * 0.02, 1.8 * s, 0, Math.PI * 2);
    ctx.fill();
}

function drawDesertAnimal(ctx, x, y, s, animal, roll) {
    const scale = (0.65 + roll * 0.35) * s;
    const body = animal.group === "livestock" ? "#b19a70"
        : animal.group === "predator" ? "#b58b64"
            : animal.group === "reptile" ? "#8d7a55"
                : animal.group === "scavenger" ? "#6d6659" : "#8d7653";
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = body;
    ctx.strokeStyle = body;
    ctx.lineWidth = Math.max(0.6, 1 * scale);
    if (animal.kind === "camel") {
        ctx.beginPath();
        ctx.ellipse(x, y - 3 * scale, 6.4 * scale, 2.7 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - 2.2 * scale, y - 1 * scale); ctx.lineTo(x - 3.2 * scale, y + 4 * scale);
        ctx.moveTo(x + 1.8 * scale, y - 1 * scale); ctx.lineTo(x + 2.8 * scale, y + 4 * scale);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x + 6.1 * scale, y - 4.8 * scale, 2 * scale, 1.15 * scale, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x - 1.8 * scale, y - 6.1 * scale, 2.1 * scale, 1.7 * scale, -0.2, 0, Math.PI * 2);
        ctx.ellipse(x + 1 * scale, y - 6.2 * scale, 2 * scale, 1.6 * scale, 0.2, 0, Math.PI * 2);
        ctx.fill();
    } else if (animal.kind === "fox" || animal.kind === "cat") {
        ctx.beginPath();
        ctx.ellipse(x, y - 1.4 * scale, 4.1 * scale, 1.6 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 3.7 * scale, y - 2.6 * scale, 1.7 * scale, 1.1 * scale, 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 4.4 * scale, y - 3.2 * scale); ctx.lineTo(x + 5.2 * scale, y - 5.4 * scale);
        ctx.moveTo(x + 5.1 * scale, y - 3.2 * scale); ctx.lineTo(x + 6.1 * scale, y - 5.1 * scale);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 3.9 * scale, y - 1.7 * scale);
        ctx.quadraticCurveTo(x - 6.4 * scale, y - 3.7 * scale, x - 7.1 * scale, y - 1 * scale);
        ctx.stroke();
    } else if (animal.kind === "snake") {
        ctx.strokeStyle = "#9b8558";
        ctx.lineWidth = Math.max(0.8, 1.4 * scale);
        ctx.beginPath();
        ctx.moveTo(x - 6 * scale, y + 1 * scale);
        ctx.quadraticCurveTo(x - 2 * scale, y - 4 * scale, x + 1 * scale, y - 1 * scale);
        ctx.quadraticCurveTo(x + 4 * scale, y + 2 * scale, x + 6 * scale, y - 2 * scale);
        ctx.stroke();
    } else if (animal.kind === "lizard" || animal.kind === "scorpion" || animal.kind === "beetle") {
        ctx.beginPath();
        ctx.ellipse(x, y - 1.4 * scale, 2.2 * scale, 1.2 * scale, roll, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = body;
        ctx.beginPath();
        if (animal.kind === "scorpion") {
            ctx.moveTo(x + 1.4 * scale, y - 2 * scale);
            ctx.quadraticCurveTo(x + 5 * scale, y - 5 * scale, x + 3.4 * scale, y + 1 * scale);
        } else {
            ctx.moveTo(x - 2 * scale, y - 0.5 * scale); ctx.lineTo(x - 3.5 * scale, y + 2.4 * scale);
            ctx.moveTo(x + 2 * scale, y - 0.5 * scale); ctx.lineTo(x + 3.5 * scale, y + 2.4 * scale);
        }
        ctx.stroke();
    } else if (animal.kind === "vulture") {
        ctx.strokeStyle = body;
        ctx.lineWidth = Math.max(0.8, 1.2 * scale);
        ctx.beginPath();
        ctx.moveTo(x - 6 * scale, y - 3 * scale);
        ctx.quadraticCurveTo(x, y - 7 * scale, x + 6 * scale, y - 3 * scale);
        ctx.moveTo(x, y - 4 * scale); ctx.lineTo(x, y + 1 * scale);
        ctx.stroke();
    } else {
        ctx.beginPath();
        ctx.ellipse(x, y - 1.2 * scale, 2.5 * scale, 1.6 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 1.8 * scale, y - 2.8 * scale, 0.9 * scale, 0, Math.PI * 2);
        ctx.fill();
    }
}

/** Draw one palm or oasis tree on the sparse tree lattice. */
export function drawDesertTree(ctx, px, py, cellPx, palm, profile = null, seed = 0.5) {
    if (!palm || !Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(cellPx)) return;
    const s = Math.max(0.35, cellPx / 48);
    ctx.save();
    drawPalm(ctx, px, py, s, palm, seed);
    if (profile?.water?.waterhole) {
        ctx.globalAlpha = 0.26;
        ctx.fillStyle = "#6c9d91";
        ctx.beginPath();
        ctx.ellipse(px + cellPx * 0.2, py + cellPx * 0.12, cellPx * 0.12, cellPx * 0.035, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

/**
 * Draw one desert detail tile. The profile comes from desertProfileAt(); all
 * loops are bounded to a handful of marks regardless of density.
 */
export function drawDesert(ctx, px, py, cellPx, profile, s1 = 0.5, s2 = 0.5, s3 = 0.5, tick = 0, zoom = 1, sun = 0.6, dayOfYear = 150, climateKey = "arid") {
    if (!profile || !Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(cellPx)) return;
    const s = Math.max(0.35, cellPx / 48);
    const visual = profile.visual || {};
    const soil = profile.soil || {};
    const landform = profile.landform || {};
    const vegetation = profile.vegetation || {};
    const snow = clamp01(visual.snowCover);
    const roll = salt => number(hashOffset(Math.round(px + py * 3), salt), 0.5);

    ctx.save();
    // The baked ground already supplies the continuous desert field. Filling
    // this tile here produces visible squares (and per-tile ellipses produce
    // rows of ovals), so this layer deliberately adds only readable detail.
    ctx.fillStyle = colour(visual.sandHex, "#d3b77e");

    if (landform.sandSea || landform.duneField || profile.dunes?.types?.length) {
        drawDune(ctx, px, py, cellPx, s, profile, roll(31));
    }
    drawSalt(ctx, px, py, cellPx, s, profile, roll(41));
    drawRock(ctx, px, py, cellPx, s, profile, roll(51));
    if (soil.gravel > 0.3 || soil.pebble > 0.3) {
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = "#71695d";
        const count = 3 + Math.round((soil.gravel + soil.pebble) * 4);
        for (let index = 0; index < count; index++) {
            const x = px + (roll(60 + index) - 0.5) * cellPx * 0.8;
            const y = py + (roll(70 + index) - 0.5) * cellPx * 0.36;
            ctx.fillRect(x, y, Math.max(0.7, s * (0.8 + index * 0.2)), Math.max(0.5, s * 0.5));
        }
    }
    if (profile.rocks?.erosion) {
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = "#8b7757";
        ctx.lineWidth = Math.max(0.7, 1.1 * s);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.34, py + cellPx * 0.16);
        ctx.quadraticCurveTo(px - cellPx * 0.04, py - cellPx * 0.01, px + cellPx * 0.34, py + cellPx * 0.18);
        ctx.stroke();
    }

    drawWaters(ctx, px, py, cellPx, s, profile, roll(81));

    const grassCount = Math.max(1, Math.min(9, Math.round(1 + (vegetation.density || 0) * 8)));
    for (let index = 0; index < grassCount; index++) {
        const angle = roll(100 + index) * Math.PI * 2;
        const radius = Math.sqrt(roll(200 + index)) * cellPx * 0.38;
        drawTuft(ctx, px + Math.cos(angle) * radius, py + Math.sin(angle) * radius * 0.52,
            s, profile, roll(300 + index), snow);
    }
    const shrubs = vegetation.shrubs || [];
    const shrubCount = Math.max(0, Math.min(3, Math.round((vegetation.shrubCover || 0) * 3)));
    for (let index = 0; index < shrubCount; index++) {
        const angle = roll(400 + index) * Math.PI * 2;
        const radius = 0.12 + roll(500 + index) * 0.28;
        drawShrub(ctx, px + Math.cos(angle) * cellPx * radius, py + Math.sin(angle) * cellPx * radius * 0.56,
            s, shrubs[index % shrubs.length], roll(600 + index));
    }
    const succulents = vegetation.succulents || [];
    for (let index = 0; index < Math.min(2, succulents.length); index++) {
        if (roll(610 + index) > 0.72) continue;
        const angle = roll(620 + index) * Math.PI * 2;
        const radius = 0.1 + roll(630 + index) * 0.3;
        drawSucculent(ctx, px + Math.cos(angle) * cellPx * radius, py + Math.sin(angle) * cellPx * radius * 0.52,
            s, succulents[index], roll(640 + index));
    }
    const flowers = vegetation.flowers || [];
    for (let index = 0; index < Math.min(3, flowers.length); index++) {
        if (roll(700 + index) > 0.78) continue;
        const angle = roll(710 + index) * Math.PI * 2;
        const radius = 0.08 + roll(720 + index) * 0.32;
        drawFlower(ctx, px + Math.cos(angle) * cellPx * radius, py + Math.sin(angle) * cellPx * radius * 0.5,
            s, flowers[index], roll(730 + index));
    }
    const palms = vegetation.palms || [];
    for (let index = 0; index < Math.min(2, palms.length); index++) {
        const palm = palms[index];
        drawPalm(ctx, px + (roll(740 + index) - 0.5) * cellPx * 0.34, py + (roll(750 + index) - 0.5) * cellPx * 0.12,
            s, palm, roll(760 + index));
    }
    drawField(ctx, px, py, cellPx, s, profile, roll(770));
    drawCaravan(ctx, px, py, cellPx, s, profile);

    if (visual.dust > 0.18 || visual.dustStorm > 0.2) {
        ctx.globalAlpha = 0.07 + clamp01(visual.dustStorm) * 0.11;
        ctx.fillStyle = "#d8bd8d";
        ctx.beginPath();
        ctx.ellipse(px, py - cellPx * 0.02, cellPx * 0.52, cellPx * 0.16, 0.06, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = "#e4cba0";
        ctx.lineWidth = Math.max(0.5, 0.7 * s);
        ctx.beginPath();
        for (let index = 0; index < 3; index++) {
            const y = py - cellPx * (0.04 + index * 0.06);
            ctx.moveTo(px - cellPx * 0.32, y);
            ctx.quadraticCurveTo(px, y - cellPx * 0.03, px + cellPx * 0.34, y + cellPx * 0.015);
        }
        ctx.stroke();
    }
    if (visual.mirage > 0.35 && zoom >= 0.7) {
        ctx.globalAlpha = 0.1 + visual.mirage * 0.08;
        ctx.strokeStyle = "#f4e3b4";
        ctx.lineWidth = Math.max(0.5, 0.7 * s);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.3, py + cellPx * 0.04);
        ctx.quadraticCurveTo(px, py + cellPx * 0.01, px + cellPx * 0.3, py + cellPx * 0.04);
        ctx.stroke();
    }
    if (snow > 0.14) {
        ctx.globalAlpha = 0.2 + snow * 0.34;
        ctx.fillStyle = "#e8e7df";
        ctx.beginPath();
        ctx.ellipse(px, py + cellPx * 0.1, cellPx * (0.26 + snow * 0.14), cellPx * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    if (zoom >= 0.95 && s3 > 0.88 && profile.fauna?.length) {
        const animal = profile.fauna[Math.floor(s2 * profile.fauna.length) % profile.fauna.length];
        if (animal) drawDesertAnimal(ctx, px + (s2 - 0.5) * cellPx * 0.34, py + cellPx * 0.03, s, animal, s1);
    }
    ctx.restore();
}
