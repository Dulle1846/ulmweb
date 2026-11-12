// Jungle interior Canvas2D art (1.2.5).
//
// These helpers draw the understory/landscape features that the tropical tree
// pass cannot express: thicket walls, thorn scrub, bamboo brakes, vine curtains,
// animal trails, hidden streams, ravines, rock outcrops and small clearings.
// Every function is pure drawing and reads only the derived `stand.jungle`
// profile, so it never mutates state or introduces a second ecology.

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

function leaf(ctx, x, y, rx, ry, angle, fill, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawThicket(ctx, px, py, cellPx, s, s1, s2, dense) {
    const count = 4 + Math.round(dense * 5);
    for (let i = 0; i < count; i++) {
        const angle = i * 2.31 + s1 * 5;
        const ox = Math.cos(angle) * cellPx * (0.12 + (i % 3) * 0.11);
        const oy = Math.sin(angle) * cellPx * 0.08 + (s2 - 0.5) * cellPx * 0.08;
        const size = (2.4 + (i % 4) * 0.9 + dense * 1.4) * s;
        leaf(ctx, px + ox, py + 2 * s + oy, size * 1.15, size * 0.68,
            angle * 0.4, i % 3 === 0 ? '#315f36' : i % 3 === 1 ? '#477a40' : '#294d30', 0.9);
    }
}

function drawThornScrub(ctx, px, py, cellPx, s, s1, s2) {
    ctx.save();
    ctx.strokeStyle = '#78643b';
    ctx.lineWidth = Math.max(0.5, 0.75 * s);
    for (let i = 0; i < 4; i++) {
        const x = px + (i - 1.5) * cellPx * 0.2 + (s1 - 0.5) * cellPx * 0.1;
        const base = py + 3 * s;
        ctx.beginPath();
        ctx.moveTo(x, base);
        ctx.lineTo(x + (i % 2 ? 3 : -3) * s, base - (4 + i) * s);
        ctx.stroke();
        for (let t = 0; t < 3; t++) {
            const y = base - (1.4 + t * 1.2) * s;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + (t % 2 ? 2.2 : -2.2) * s, y - 0.8 * s);
            ctx.stroke();
        }
    }
    ctx.fillStyle = '#546b3b';
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(px + ((s2 * 11 + i * 7) % 13 - 6) * s, py - (2 + i) * s, 1.2 * s, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawBambooBrake(ctx, px, py, cellPx, s, s1, s2) {
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
        const x = px + (i - 2) * cellPx * 0.13 + (s1 - 0.5) * cellPx * 0.08;
        const height = (8 + i * 2.3 + s2 * 6) * s;
        ctx.strokeStyle = i % 2 ? '#7f9b45' : '#5f8137';
        ctx.lineWidth = Math.max(0.7, 1.15 * s);
        ctx.beginPath();
        ctx.moveTo(x, py + 4 * s);
        ctx.lineTo(x + (s1 - 0.5) * 3 * s, py + 4 * s - height);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(214, 224, 153, 0.62)';
        ctx.lineWidth = Math.max(0.45, 0.6 * s);
        for (let node = 1; node < 4; node++) {
            const y = py + 4 * s - height * node / 4;
            ctx.beginPath();
            ctx.moveTo(x - 2 * s, y);
            ctx.lineTo(x + 2 * s, y);
            ctx.stroke();
        }
        ctx.fillStyle = '#98b454';
        for (let b = 0; b < 2; b++) {
            leaf(ctx, x + (b ? 2 : -2) * s, py + 4 * s - height * (0.55 + b * 0.16),
                2.3 * s, 0.8 * s, b ? 0.5 : -0.5, '#8fae4b', 0.75);
        }
    }
    ctx.restore();
}

function drawVineCurtain(ctx, px, py, cellPx, s, s1, s2) {
    ctx.save();
    ctx.strokeStyle = 'rgba(78, 108, 54, 0.72)';
    ctx.lineWidth = Math.max(0.45, 0.7 * s);
    for (let i = 0; i < 3; i++) {
        const x = px + (i - 1) * cellPx * 0.24 + (s1 - 0.5) * cellPx * 0.1;
        ctx.beginPath();
        ctx.moveTo(x, py - 17 * s);
        ctx.bezierCurveTo(x + 7 * s, py - 9 * s, x - 5 * s, py - 3 * s, x + (s2 - 0.5) * 4 * s, py + 3 * s);
        ctx.stroke();
        leaf(ctx, x + 3 * s, py - 8 * s, 1.5 * s, 0.55 * s, 0.7, '#6e944b', 0.72);
    }
    ctx.restore();
}

function drawRavine(ctx, px, py, cellPx, s) {
    ctx.save();
    ctx.fillStyle = 'rgba(28, 38, 27, 0.64)';
    ctx.beginPath();
    ctx.moveTo(px - cellPx * 0.48, py + cellPx * 0.42);
    ctx.quadraticCurveTo(px - cellPx * 0.12, py + cellPx * 0.08, px + cellPx * 0.14, py + cellPx * 0.2);
    ctx.quadraticCurveTo(px + cellPx * 0.35, py + cellPx * 0.3, px + cellPx * 0.48, py + cellPx * 0.44);
    ctx.lineTo(px + cellPx * 0.4, py + cellPx * 0.5);
    ctx.quadraticCurveTo(px + cellPx * 0.14, py + cellPx * 0.35, px - cellPx * 0.12, py + cellPx * 0.25);
    ctx.quadraticCurveTo(px - cellPx * 0.34, py + cellPx * 0.18, px - cellPx * 0.5, py + cellPx * 0.47);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(125, 139, 93, 0.45)';
    ctx.lineWidth = Math.max(0.5, 0.8 * s);
    ctx.beginPath();
    ctx.moveTo(px - cellPx * 0.44, py + cellPx * 0.4);
    ctx.quadraticCurveTo(px, py + cellPx * 0.12, px + cellPx * 0.44, py + cellPx * 0.43);
    ctx.stroke();
    ctx.restore();
}

function drawHiddenStream(ctx, px, py, cellPx, s, s1, waterfall) {
    ctx.save();
    const width = Math.max(1.4, (2.4 + s1 * 2.4) * s);
    ctx.strokeStyle = 'rgba(83, 139, 133, 0.78)';
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px - cellPx * 0.42, py + cellPx * 0.3);
    ctx.quadraticCurveTo(px - cellPx * 0.08, py + cellPx * 0.12, px + cellPx * 0.12, py + cellPx * 0.22);
    ctx.quadraticCurveTo(px + cellPx * 0.28, py + cellPx * 0.32, px + cellPx * 0.46, py + cellPx * 0.18);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(180, 220, 204, 0.45)';
    ctx.lineWidth = Math.max(0.4, width * 0.28);
    ctx.stroke();
    if (waterfall) {
        ctx.strokeStyle = 'rgba(218, 240, 231, 0.8)';
        ctx.lineWidth = Math.max(1.2, 2.4 * s);
        ctx.beginPath();
        ctx.moveTo(px + cellPx * 0.04, py - cellPx * 0.36);
        ctx.lineTo(px + cellPx * 0.09, py + cellPx * 0.14);
        ctx.stroke();
        ctx.fillStyle = 'rgba(151, 202, 197, 0.55)';
        ctx.beginPath();
        ctx.ellipse(px + cellPx * 0.1, py + cellPx * 0.18, 3.4 * s, 1.3 * s, 0.1, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawRockOutcrop(ctx, px, py, cellPx, s, s1, s2) {
    ctx.save();
    ctx.fillStyle = '#626756';
    ctx.strokeStyle = '#343e35';
    ctx.lineWidth = Math.max(0.6, 0.8 * s);
    ctx.beginPath();
    ctx.moveTo(px - cellPx * 0.25, py + 5 * s);
    ctx.lineTo(px - cellPx * 0.18, py - 4 * s);
    ctx.lineTo(px + cellPx * 0.02, py - 8 * s);
    ctx.lineTo(px + cellPx * 0.25, py - 3 * s);
    ctx.lineTo(px + cellPx * 0.21, py + 5 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(145, 165, 125, 0.6)';
    ctx.beginPath();
    ctx.moveTo(px - cellPx * 0.14, py - 3 * s);
    ctx.quadraticCurveTo(px, py - 6 * s, px + cellPx * 0.17, py - 2 * s);
    ctx.stroke();
    leaf(ctx, px - cellPx * 0.2, py - 2 * s, 1.7 * s, 0.7 * s, -0.6, '#5d8b45', 0.8);
    leaf(ctx, px + cellPx * 0.18, py - 4 * s, 1.4 * s, 0.6 * s, 0.5, '#6d9a4b', 0.7);
    ctx.restore();
}

function drawGiantFern(ctx, px, py, cellPx, s, s1, s2) {
    ctx.save();
    ctx.strokeStyle = '#456d38';
    ctx.lineWidth = Math.max(0.6, 1.15 * s);
    ctx.lineCap = 'round';
    const rootX = px + (s1 - 0.5) * cellPx * 0.12;
    const rootY = py + 4 * s;
    for (let f = 0; f < 5; f++) {
        const angle = -Math.PI / 2 + (f - 2) * 0.42 + (s1 - 0.5) * 0.2;
        const length = (11 + (f % 3) * 3 + s2 * 4) * s;
        ctx.beginPath();
        ctx.moveTo(rootX, rootY);
        ctx.quadraticCurveTo(rootX + Math.cos(angle) * length * 0.55,
            rootY + Math.sin(angle) * length * 0.6,
            rootX + Math.cos(angle) * length, rootY + Math.sin(angle) * length);
        ctx.stroke();
        for (let leaflet = 1; leaflet <= 3; leaflet++) {
            const t = leaflet / 4;
            const lx = rootX + Math.cos(angle) * length * t;
            const ly = rootY + Math.sin(angle) * length * t;
            const side = leaflet % 2 ? 1 : -1;
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(lx + side * (2.6 - leaflet * 0.3) * s, ly - (1.6 + leaflet * 0.2) * s);
            ctx.stroke();
        }
    }
    ctx.restore();
}

function drawRareBloom(ctx, px, py, s, s1, s2) {
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(190, 245, 167, 0.18)';
    ctx.beginPath();
    ctx.arc(px, py - 3 * s, 6 * s, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3 + s1 * 2;
        leaf(ctx, px + Math.cos(angle) * 2.2 * s, py - 3 * s + Math.sin(angle) * 2.2 * s,
            1.7 * s, 0.7 * s, angle, '#c6f68d', 0.9);
    }
    ctx.fillStyle = '#fef3c7';
    ctx.beginPath();
    ctx.arc(px + (s2 - 0.5) * s, py - 3 * s, 1.2 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawClearing(ctx, px, py, cellPx, s, s1, s2, viewpoint, hidden = false) {
    ctx.save();
    ctx.fillStyle = hidden ? 'rgba(24, 54, 37, 0.38)' : 'rgba(184, 186, 108, 0.22)';
    ctx.beginPath();
    ctx.ellipse(px, py + 2 * s, cellPx * 0.42, cellPx * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(193, 197, 125, 0.62)';
    ctx.lineWidth = Math.max(0.45, 0.7 * s);
    for (let i = 0; i < 5; i++) {
        const x = px + (i - 2) * cellPx * 0.11 + (s1 - 0.5) * cellPx * 0.05;
        ctx.beginPath();
        ctx.moveTo(x, py + 3 * s);
        ctx.lineTo(x + (i % 2 ? 1.8 : -1.4) * s, py - (2 + i % 3) * s);
        ctx.stroke();
    }
    if (hidden) {
        drawRareBloom(ctx, px - cellPx * 0.16, py + 2 * s, s, s1, s2);
        drawRareBloom(ctx, px + cellPx * 0.19, py - 1 * s, s, s2, s1);
    }
    if (viewpoint) {
        ctx.strokeStyle = 'rgba(225, 218, 160, 0.7)';
        ctx.lineWidth = Math.max(0.5, 0.75 * s);
        ctx.beginPath();
        ctx.moveTo(px - 3 * s, py - 8 * s);
        ctx.lineTo(px + 4 * s, py - 13 * s);
        ctx.lineTo(px + 1.5 * s, py - 7 * s);
        ctx.stroke();
    }
    ctx.restore();
}

function drawGameTrail(ctx, px, py, cellPx, s, s1, s2) {
    ctx.save();
    ctx.strokeStyle = 'rgba(122, 101, 68, 0.58)';
    ctx.lineWidth = Math.max(1, 1.7 * s);
    ctx.setLineDash([2.4 * s, 2.2 * s]);
    ctx.beginPath();
    ctx.moveTo(px - cellPx * 0.35, py + 6 * s);
    ctx.quadraticCurveTo(px - cellPx * 0.05, py + 2 * s, px + cellPx * 0.1, py + 4 * s);
    ctx.quadraticCurveTo(px + cellPx * 0.3, py + 5 * s, px + cellPx * 0.42, py - 1 * s);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

function drawVegetationWall(ctx, px, py, cellPx, s, s1, s2) {
    ctx.save();
    ctx.fillStyle = 'rgba(22, 53, 28, 0.42)';
    for (let i = 0; i < 4; i++) {
        const x = px + (i - 1.5) * cellPx * 0.18;
        ctx.beginPath();
        ctx.ellipse(x, py - (6 + i * 2) * s, cellPx * 0.15, (6 + i * 2) * s, 0.12 * i, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// Draw the landscape/understory signature for one tile. Returns true when a
// strong feature owned the tile; false lets the existing tropical understory
// pass add its ferns, palms and orchids.
export function drawJungleUnderstory(ctx, px, py, cellPx, stand, s1, s2, s3) {
    const jungle = stand?.jungle;
    if (!jungle) return false;
    const s = cellPx / 48;
    const f = jungle.features;
    const l = jungle.landscape;
    if (l.waterfall && (f['1.2.5.28'] || 0) > 0.5 && s2 < 0.35) {
        drawHiddenStream(ctx, px, py, cellPx, s, s1, true);
        return true;
    }
    if (l.ravine && (f['1.2.5.26'] || 0) > 0.6 && s3 < 0.55) {
        drawRavine(ctx, px, py, cellPx, s);
        return true;
    }
    // A hidden glade is still a clearing in the undergrowth. Drawing the rock
    // outcrop first hid the glade and its rare plants on mixed tiles.
    if ((l.clearing || l.hiddenGlade)
        && ((f['1.2.5.31'] || 0) > 0.5 || (f['1.2.5.12'] || 0) > 0.6)
        && s1 < (l.hiddenGlade ? 0.4 : 0.48)) {
        drawClearing(ctx, px, py, cellPx, s, s1, s2, l.viewpoint, Boolean(l.hiddenGlade));
        return true;
    }
    if (l.rockOutcrop && (f['1.2.5.27'] || 0) > 0.55 && s2 < 0.36) {
        drawRockOutcrop(ctx, px, py, cellPx, s, s1, s2);
        return true;
    }
    if (l.animalTrail && (f['1.2.5.13'] || 0) > 0.5 && s3 > 0.55) {
        drawGameTrail(ctx, px, py, cellPx, s, s1, s2);
        return true;
    }
    if ((f['1.2.5.16'] || 0) > 0.5 && s2 < 0.4) {
        drawBambooBrake(ctx, px, py, cellPx, s, s1, s2);
        return true;
    }
    if ((f['1.2.5.17'] || 0) > 0.58 && s2 > 0.16 && s2 < 0.44) {
        drawGiantFern(ctx, px, py, cellPx, s, s1, s2);
        return true;
    }
    if ((f['1.2.5.6'] || 0) > 0.32 && s3 < 0.38) {
        drawThornScrub(ctx, px, py, cellPx, s, s1, s2);
        return true;
    }
    if ((f['1.2.5.18'] || 0) > 0.42 && s1 > 0.66) {
        drawVineCurtain(ctx, px, py, cellPx, s, s1, s2);
        return true;
    }
    if ((f['1.2.5.23'] || 0) > 0.34 && s3 < 0.12) {
        drawRareBloom(ctx, px + (s1 - 0.5) * cellPx * 0.2, py + 2 * s, s, s2, s3);
        return true;
    }
    if ((f['1.2.5.14'] || 0) > 0.52 && s2 > 0.62) {
        drawVegetationWall(ctx, px, py, cellPx, s, s1, s2);
        return true;
    }
    if ((f['1.2.5.1'] || 0) > 0.42 && s3 < 0.34) {
        drawThicket(ctx, px, py, cellPx, s, s1, s2, jungle.features['1.2.5.10'] || 0);
        return true;
    }
    return false;
}

export function drawJungleFloor(ctx, px, py, cellPx, stand, s1, s2, s3) {
    const jungle = stand?.jungle;
    if (!jungle) return false;
    const f = jungle.features;
    const l = jungle.landscape;
    const s = cellPx / 48;
    let drew = false;
    if (l.flooded && (f['1.2.5.29'] || 0) > 0.5 && s1 < 0.3) {
        ctx.save();
        ctx.fillStyle = 'rgba(60, 107, 105, 0.3)';
        ctx.beginPath();
        ctx.ellipse(px, py + 3 * s, cellPx * 0.4, cellPx * 0.17, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        drew = true;
    }
    if (l.hiddenStream && (f['1.2.5.15'] || 0) > 0.55 && s2 < 0.4) {
        drawHiddenStream(ctx, px, py, cellPx, s, s1, l.waterfall);
        drew = true;
    }
    if (drew) return true;
    return false;
}
