// Canvas2D art for the tropical rainforest (1.2.4).
//
// Kept separate from terrain.js so the dense canopy, buttresses, epiphytes,
// lianas, palms and land-use details have one home. Every function is pure
// drawing: it reads the derived tropical stand profile and never mutates game
// state or caches a second ecology.

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

function rgb(hex) {
    const raw = String(hex || '#60704e').replace('#', '');
    const value = parseInt(raw.length === 3 ? raw.split('').map(char => char + char).join('') : raw, 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixHex(a, b, amount) {
    const x = rgb(a);
    const y = rgb(b);
    const t = clamp01(amount);
    return '#' + [0, 1, 2].map(i => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0')).join('');
}

function drawLeaf(ctx, x, y, rx, ry, angle, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(196, 222, 160, 0.28)';
    ctx.lineWidth = Math.max(0.35, ry * 0.14);
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(angle) * rx * 0.7, y - Math.sin(angle) * rx * 0.7);
    ctx.lineTo(x + Math.cos(angle) * rx * 0.7, y + Math.sin(angle) * rx * 0.7);
    ctx.stroke();
}

function drawTropicalTree(ctx, px, py, s, sway, seed, ageScale, definition, stand, treeForm = null) {
    const heightScale = treeForm?.heightScale || 1;
    const trunkScale = treeForm?.trunkScale || 1;
    const crownScale = treeForm?.crownScale || 1;
    const baseY = py + 8 * s;
    // Rainforest giants must read as a storey above the undergrowth. The
    // previous silhouette was only a few pixels taller than a temperate tree;
    // this profile gives emergents a real skyline and broad lower crowns.
    const sizeScale = definition.emergent ? 2.18 : 1.78;
    const height = (15 + definition.height * 6) * s * ageScale * heightScale * sizeScale;
    const trunkW = Math.max(1.8, 5.3 * definition.trunk * s * (0.72 + ageScale * 0.3) * trunkScale * (definition.emergent ? 1.12 : 1));
    const crownY = py - height * 0.9;
    const radius = (12.5 + seed * 4.2) * s * definition.crown * ageScale * crownScale * (definition.emergent ? 1.52 : 1.34);
    const bark = definition.bark || '#6c5138';
    const barkLight = definition.barkLight || '#9b7957';
    const crown = mixHex(definition.summer[0], definition.summer[1], 0.74);
    const sunlit = mixHex(definition.summer[1], '#d7e7a5', 0.46);
    const buttress = Math.max(0, Number(definition.buttress) || 0);
    const tropical = stand?.tropical;

    // Buttress fins flare from the base before the bole starts. They are the
    // signature silhouette of the giant lowland trees.
    if (buttress > 0.12) {
        ctx.save();
        ctx.fillStyle = mixHex(bark, '#2c221a', 0.18);
        ctx.strokeStyle = mixHex(bark, '#3a2b20', 0.24);
        ctx.lineWidth = Math.max(0.65, 0.75 * s);
        const fins = 3 + Math.round(buttress * 4);
        for (let i = 0; i < fins; i++) {
            const side = i % 2 === 0 ? -1 : 1;
            const spread = (5 + (i % 3) * 2.2 + buttress * 5.5) * s;
            const top = baseY - (4 + (i % 2) * 2.2) * s;
            ctx.beginPath();
            ctx.moveTo(px - trunkW * 0.34, top);
            ctx.quadraticCurveTo(px + side * spread * 0.56, baseY - 2 * s, px + side * spread, baseY + 1.2 * s);
            ctx.lineTo(px + side * spread * 0.62, baseY + 3.4 * s);
            ctx.quadraticCurveTo(px + side * trunkW * 0.15, baseY + 0.4 * s, px + trunkW * 0.32, top);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }

    // Tapered bole, vertical fissures and a lit edge. Each species supplies its
    // own bark colour, so a stand never looks like one recoloured trunk.
    ctx.save();
    ctx.fillStyle = bark;
    ctx.beginPath();
    ctx.moveTo(px - trunkW * 0.56, baseY);
    ctx.quadraticCurveTo(px - trunkW * 0.42 + sway * 0.2, py - height * 0.42, px - trunkW * 0.32 + sway * 0.6, crownY + 4 * s);
    ctx.lineTo(px + trunkW * 0.32 + sway * 0.6, crownY + 4 * s);
    ctx.quadraticCurveTo(px + trunkW * 0.46 + sway * 0.2, py - height * 0.42, px + trunkW * 0.56, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = barkLight;
    ctx.fillRect(px - trunkW * 0.38 + sway * 0.4, py - height * 0.7, Math.max(0.8, trunkW * 0.18), height * 0.66);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = mixHex(bark, '#2e241b', 0.42);
    ctx.lineWidth = Math.max(0.5, 0.6 * s);
    for (let i = 0; i < 5; i++) {
        const ox = (i - 2) * trunkW * 0.13;
        ctx.beginPath();
        ctx.moveTo(px + ox, py - height * 0.12);
        ctx.quadraticCurveTo(px + ox + (i % 2 ? 1.2 : -1) * s, py - height * 0.42, px + ox * 0.55, py - height * 0.7);
        ctx.stroke();
    }
    ctx.restore();

    // Lianas climb the bole and disappear into the crown.
    if (seed > 0.3) {
        ctx.save();
        ctx.strokeStyle = 'rgba(79, 107, 55, 0.78)';
        ctx.lineWidth = Math.max(0.55, 0.72 * s);
        ctx.beginPath();
        ctx.moveTo(px + trunkW * 0.34, baseY - 1 * s);
        ctx.bezierCurveTo(px + trunkW * 1.9, py - height * 0.22, px - trunkW * 1.7, py - height * 0.6, px + radius * 0.36, crownY + 3 * s);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(112, 140, 69, 0.56)';
        ctx.beginPath();
        ctx.moveTo(px - trunkW * 0.4, baseY - 3 * s);
        ctx.bezierCurveTo(px - trunkW * 1.4, py - height * 0.3, px + trunkW * 1.2, py - height * 0.55, px - radius * 0.2, crownY - 1 * s);
        ctx.stroke();
        ctx.restore();
    }

    // Aerial roots of strangler figs and old kapoks.
    if (definition.aerialRoots || (definition.emergent && seed > 0.7)) {
        ctx.save();
        ctx.strokeStyle = 'rgba(92, 80, 62, 0.66)';
        ctx.lineWidth = Math.max(0.45, 0.5 * s);
        for (let i = 0; i < 4; i++) {
            const ox = (i - 1.5) * radius * 0.18;
            ctx.beginPath();
            ctx.moveTo(px + ox + sway, crownY + radius * 0.18);
            ctx.quadraticCurveTo(px + ox + 2 * s, py - height * 0.34, px + ox - 2 * s, baseY - 3 * s);
            ctx.stroke();
        }
        ctx.restore();
    }

    // Branches carry the broad crown.
    ctx.save();
    ctx.strokeStyle = mixHex(bark, '#33271c', 0.35);
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(0.9, 1.2 * s);
    for (let i = 0; i < 4; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(px + sway * 0.5, crownY + 9 * s);
        ctx.quadraticCurveTo(px + side * radius * 0.4, crownY + radius * 0.12,
            px + side * radius * (0.7 + i * 0.06), crownY - radius * 0.06);
        ctx.stroke();
    }
    ctx.restore();

    // Dark undercrown first: a wide, soft layer gives the canopy depth and
    // stops overlapping trees from reading as isolated lollipops.
    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = mixHex(crown, '#1b3a24', 0.36);
    ctx.beginPath();
    ctx.ellipse(px + sway, crownY + radius * 0.16, radius * 1.18, radius * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = crown;
    ctx.beginPath();
    ctx.ellipse(px + sway, crownY, radius * 1.08, radius * (definition.emergent ? 0.5 : 0.62), 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 8; i++) {
        const angle = i * 2.399 + seed * 5;
        const ox = Math.cos(angle) * radius * 0.66;
        const oy = Math.sin(angle) * radius * 0.3;
        ctx.fillStyle = i % 3 === 0 ? sunlit : i % 2 ? crown : mixHex(crown, definition.summer[1], 0.3);
        ctx.beginPath();
        ctx.ellipse(px + sway + ox, crownY + oy, radius * (0.34 + (i % 4) * 0.045),
            radius * (0.2 + (i % 3) * 0.04), angle * 0.15, 0, Math.PI * 2);
        ctx.fill();
    }
    if (definition.leafSize === 'large' || definition.leafSize === 'giant') {
        ctx.globalAlpha = 0.68;
        for (let i = 0; i < 6; i++) {
            const angle = i * 1.47 + seed * 3;
            drawLeaf(ctx, px + Math.cos(angle) * radius * (1.02 + (i % 2) * 0.08) + sway,
                crownY + Math.sin(angle) * radius * 0.45, radius * 0.13, radius * 0.055, angle, sunlit);
        }
    }
    if (definition.emergent) {
        ctx.globalAlpha = 0.84;
        ctx.fillStyle = mixHex(crown, definition.summer[0], 0.22);
        ctx.beginPath();
        ctx.ellipse(px + sway * 0.7, crownY - radius * 0.38, radius * 0.62, radius * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // Epiphytes, orchids and bromeliads live on trunks and lower branches.
    if (seed > 0.35) {
        ctx.save();
        for (let i = 0; i < 2; i++) {
            const ex = px + (i === 0 ? -1 : 1) * radius * 0.4;
            const ey = crownY + radius * (0.2 + i * 0.1);
            for (let j = 0; j < 4; j++) {
                drawLeaf(ctx, ex, ey, 1.5 * s, 0.55 * s, j * 0.7, '#557f48');
            }
        }
        ctx.fillStyle = '#d56b93';
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(px - radius * 0.22 + i * 2.2 * s, crownY + radius * 0.22, 0.8 * s, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // Flowers and fruit make the canopy seasonal and useful.
    if (definition.flowering && seed > 0.5) {
        ctx.save();
        ctx.fillStyle = definition.flowering === 'pink' ? '#e68bb0'
            : definition.flowering === 'violet' ? '#b390d0'
                : definition.flowering === 'red' ? '#d96958' : '#efe2b0';
        for (let i = 0; i < 5; i++) {
            const angle = i * 2.2 + seed * 4;
            ctx.beginPath();
            ctx.arc(px + Math.cos(angle) * radius * 0.72 + sway, crownY + Math.sin(angle) * radius * 0.3,
                1.15 * s, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
    if (definition.fruit && seed > 0.6 && (tropical?.features?.['1.2.4.45'] || 0) > 0.45) {
        ctx.save();
        ctx.fillStyle = '#c79b45';
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(px + radius * 0.3 + i * 2.4 * s, crownY + radius * 0.32 + (i % 2) * 1.5 * s, 1.1 * s, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

function drawTropicalPalm(ctx, px, py, s, sway, seed, ageScale, definition) {
    const baseY = py + 8 * s;
    const height = (14 + seed * 5) * s * ageScale;
    const topX = px + sway * 0.9 + (seed - 0.5) * 3 * s;
    const topY = py - height;
    ctx.save();
    ctx.strokeStyle = definition.bark || '#806c4d';
    ctx.lineWidth = Math.max(1.2, 2.1 * s);
    ctx.beginPath();
    ctx.moveTo(px, baseY);
    ctx.quadraticCurveTo(px + sway * 0.2, py - height * 0.36, topX, topY);
    ctx.stroke();
    ctx.strokeStyle = definition.barkLight || '#ad956c';
    ctx.lineWidth = Math.max(0.45, 0.5 * s);
    for (let i = 0; i < 5; i++) {
        const t = 0.18 + i * 0.13;
        const rx = px + (topX - px) * t + Math.sin(t * 7) * s;
        const ry = baseY + (topY - baseY) * t;
        ctx.beginPath();
        ctx.moveTo(rx - 1.6 * s, ry);
        ctx.lineTo(rx + 1.6 * s, ry - 0.35 * s);
        ctx.stroke();
    }
    const fronds = 7;
    for (let i = 0; i < fronds; i++) {
        const angle = -Math.PI * 0.92 + (i / (fronds - 1)) * Math.PI * 1.84;
        const length = (10 + seed * 5) * s * (i % 2 ? 0.84 : 1);
        const tipX = topX + Math.cos(angle) * length;
        const tipY = topY + Math.sin(angle) * length * 0.66 + 1.2 * s;
        ctx.fillStyle = i % 2 === 0 ? '#3e8245' : '#5b9e4b';
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.quadraticCurveTo(topX + Math.cos(angle) * length * 0.52, topY + Math.sin(angle) * length * 0.2 - 2.5 * s, tipX, tipY);
        ctx.quadraticCurveTo(topX + Math.cos(angle) * length * 0.55, topY + Math.sin(angle) * length * 0.4 + 1.2 * s, topX, topY);
        ctx.fill();
    }
    ctx.fillStyle = '#85a949';
    ctx.beginPath();
    ctx.arc(topX, topY, 1.5 * s, 0, Math.PI * 2);
    ctx.fill();
    if (seed > 0.55) {
        ctx.fillStyle = '#8c5a2e';
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(topX + (i - 1) * 1.7 * s, topY + 2.2 * s + (i % 2) * 1.2 * s, 0.8 * s, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

function drawTropicalBamboo(ctx, px, py, s, sway, seed, ageScale) {
    const baseY = py + 8 * s;
    const height = (9 + seed * 7) * s * ageScale;
    ctx.save();
    for (let i = 0; i < 5; i++) {
        const ox = (i - 2) * 2.1 * s;
        ctx.strokeStyle = i % 2 ? '#7d9a50' : '#93af5e';
        ctx.lineWidth = Math.max(0.65, 0.9 * s);
        ctx.beginPath();
        ctx.moveTo(px + ox, baseY);
        ctx.quadraticCurveTo(px + ox + sway * 0.2, py - height * 0.5, px + ox + (seed - 0.5) * 2 * s, py - height * (0.72 + i * 0.05));
        ctx.stroke();
    }
    for (let i = 0; i < 8; i++) {
        const a = i * 1.7 + seed * 4;
        drawLeaf(ctx, px + Math.cos(a) * 4 * s + sway, py - height * 0.65 + Math.sin(a) * 4 * s,
            2.3 * s, 0.65 * s, a, '#8cb65a');
    }
    ctx.restore();
}

function drawGiantFern(ctx, px, py, s, seed) {
    ctx.save();
    ctx.translate(px, py + 5 * s);
    ctx.strokeStyle = '#55723d';
    ctx.lineWidth = Math.max(0.8, 1.1 * s);
    for (let i = 0; i < 7; i++) {
        const angle = -Math.PI * 0.9 + i * Math.PI * 0.3;
        const len = (7 + seed * 4) * s;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(Math.cos(angle) * len * 0.5, -len * 0.7, Math.cos(angle) * len, -len * 0.2);
        ctx.stroke();
        for (let j = 1; j < 4; j++) {
            const t = j / 4;
            drawLeaf(ctx, Math.cos(angle) * len * t, -len * (0.42 + t * 0.3),
                len * 0.14, len * 0.05, angle, i % 2 ? '#4f8d46' : '#6ca553');
        }
    }
    ctx.restore();
}

function drawBigLeafPlant(ctx, px, py, s, seed) {
    ctx.save();
    ctx.translate(px, py + 5 * s);
    ctx.strokeStyle = '#6c8d4d';
    ctx.lineWidth = Math.max(0.6, 0.7 * s);
    for (let i = 0; i < 3; i++) {
        const angle = -1.8 + i * 1.1 + seed * 0.3;
        const x = Math.cos(angle) * 5 * s;
        const y = -4 * s + Math.sin(angle) * 3 * s;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(x * 0.5, y - 3 * s, x, y);
        ctx.stroke();
        drawLeaf(ctx, x, y, 4.6 * s, 2.2 * s, angle, i % 2 ? '#3f8448' : '#5b9b4f');
    }
    ctx.restore();
}

function drawOrchidSpray(ctx, px, py, s, seed) {
    ctx.save();
    ctx.strokeStyle = '#66894b';
    ctx.lineWidth = Math.max(0.45, 0.55 * s);
    ctx.beginPath();
    ctx.moveTo(px, py + 4 * s);
    ctx.quadraticCurveTo(px + 2 * s, py - 5 * s, px + (seed - 0.5) * 4 * s, py - 9 * s);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
        drawLeaf(ctx, px + (i - 1.2) * 1.5 * s, py - 4 * s - i * 1.5 * s,
            1.25 * s, 0.7 * s, i * 0.6, i % 2 ? '#d983a5' : '#f0c1cf');
    }
    ctx.restore();
}

function drawBromeliad(ctx, px, py, s, seed) {
    ctx.save();
    ctx.translate(px, py + 4 * s);
    for (let i = 0; i < 6; i++) {
        const angle = i * 1.05 + seed;
        drawLeaf(ctx, Math.cos(angle) * 2.8 * s, -2 * s + Math.sin(angle) * 1.5 * s,
            3.3 * s, 0.75 * s, angle, i % 2 ? '#5f914b' : '#a05742');
    }
    ctx.fillStyle = '#d16a58';
    ctx.beginPath();
    ctx.arc(0, -2 * s, 1.1 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawPitcherPlant(ctx, px, py, s, seed) {
    ctx.save();
    ctx.strokeStyle = '#648843';
    ctx.lineWidth = Math.max(0.45, 0.5 * s);
    for (let i = 0; i < 3; i++) {
        const x = px + (i - 1) * 3 * s;
        const tx = x + (seed - 0.5) * 2 * s;
        ctx.beginPath();
        ctx.moveTo(x, py + 4 * s);
        ctx.quadraticCurveTo(x + 1 * s, py - 1 * s, tx, py - 4 * s);
        ctx.stroke();
        ctx.fillStyle = '#b45f47';
        ctx.beginPath();
        ctx.ellipse(tx, py - 4 * s, 1.3 * s, 2.1 * s, 0.12, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawSimpleFern(ctx, px, py, s, seed) {
    ctx.save();
    ctx.strokeStyle = '#527f43';
    ctx.lineWidth = Math.max(0.55, 0.7 * s);
    for (let i = 0; i < 5; i++) {
        const a = -Math.PI * 0.8 + i * 0.45;
        const len = (4 + seed * 3) * s;
        ctx.beginPath();
        ctx.moveTo(px, py + 3 * s);
        ctx.quadraticCurveTo(px + Math.cos(a) * len * 0.5, py - len, px + Math.cos(a) * len, py - len * 0.2);
        ctx.stroke();
        drawLeaf(ctx, px + Math.cos(a) * len * 0.6, py - len * 0.55, len * 0.34, len * 0.11, a, i % 2 ? '#4f8d46' : '#6ca553');
    }
    ctx.restore();
}

function drawTropicalShrub(ctx, px, py, cellPx, s1, s2) {
    const s = cellPx / 48;
    ctx.save();
    ctx.fillStyle = s1 > 0.5 ? '#3f7c40' : '#4c8744';
    ctx.beginPath();
    ctx.ellipse(px, py - 2 * s, (6 + s2 * 3) * s, (4.2 + s1 * 2) * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6fa456';
    ctx.beginPath();
    ctx.ellipse(px - 2 * s, py - 4 * s, 2.6 * s, 1.8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    if (s2 > 0.48) {
        ctx.fillStyle = '#bd624b';
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(px + (i - 1) * 2.3 * s, py - 1.5 * s + (i % 2) * 1.6 * s, 0.85 * s, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

function drawTropicalHut(ctx, px, py, s, seed) {
    ctx.save();
    ctx.translate(px, py + 3 * s);
    ctx.fillStyle = '#71583a';
    ctx.fillRect(-3 * s, -1.5 * s, 6 * s, 2.2 * s);
    ctx.fillStyle = '#c5a45e';
    ctx.beginPath();
    ctx.moveTo(-4.6 * s, -1.3 * s);
    ctx.lineTo(0, -6 * s);
    ctx.lineTo(4.6 * s, -1.3 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6d5734';
    ctx.lineWidth = Math.max(0.4, 0.45 * s);
    ctx.stroke();
    ctx.fillStyle = '#3f6f42';
    for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.ellipse((i ? 1 : -1) * 3 * s, -2 * s, 1.2 * s, 2.1 * s, i ? 0.4 : -0.4, 0, Math.PI * 2);
        ctx.fill();
    }
    if (seed > 0.5) {
        ctx.strokeStyle = '#77694f';
        ctx.beginPath();
        ctx.moveTo(3 * s, 0);
        ctx.lineTo(5 * s, -3 * s);
        ctx.stroke();
    }
    ctx.restore();
}

function drawTropicalPool(ctx, px, py, cellPx, stand, s1, s2) {
    const s = cellPx / 48;
    const wet = clamp01(stand?.wetness || 0.7);
    const cx = px + (s1 - 0.5) * 7 * s;
    const cy = py + 4 * s + (s2 - 0.5) * 4 * s;
    ctx.save();
    ctx.fillStyle = '#3f3a25';
    ctx.globalAlpha = 0.42;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 9.5 * s, 3.8 * s, 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#123238';
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 8.2 * s, 3.1 * s, 0.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a7c8c0';
    ctx.globalAlpha = 0.25 + wet * 0.2;
    ctx.beginPath();
    ctx.ellipse(cx - 1.2 * s, cy - 0.9 * s, 3.6 * s, 0.7 * s, 0.03, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#79975a';
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = Math.max(0.5, 0.65 * s);
    for (let i = 0; i < 4; i++) {
        const rx = cx + (i - 1.5) * 2.3 * s;
        ctx.beginPath();
        ctx.moveTo(rx, cy + 0.5 * s);
        ctx.lineTo(rx - 0.8 * s, cy - 3 * s);
        ctx.stroke();
    }
    ctx.restore();
}

function drawTropicalStump(ctx, px, py, s, seed) {
    ctx.save();
    ctx.fillStyle = '#6d5136';
    ctx.beginPath();
    ctx.moveTo(px - 3.2 * s, py + 4 * s);
    ctx.lineTo(px - 2.4 * s, py - 1.5 * s);
    ctx.quadraticCurveTo(px, py - 2.8 * s, px + 2.4 * s, py - 1.5 * s);
    ctx.lineTo(px + 3.2 * s, py + 4 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9b7a54';
    ctx.beginPath();
    ctx.ellipse(px, py - 1.8 * s, 2.5 * s, 0.9 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    if (seed > 0.5) {
        ctx.fillStyle = '#5f8c4c';
        ctx.beginPath();
        ctx.ellipse(px + 1.8 * s, py - 2.6 * s, 1.5 * s, 0.7 * s, -0.4, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

export function drawTropicalUnderstory(ctx, px, py, cellPx, stand, s1, s2, s3, dayOfYear, climateKey) {
    const s = cellPx / 48;
    const t = stand?.tropical;
    if (!t) return false;
    const f = t.features;
    const roll = s1;
    if (f['1.2.4.20'] > 0.18 && s2 > 0.76) { drawPitcherPlant(ctx, px, py, s, s2); return true; }
    if (f['1.2.4.15'] > 0.35 && roll < 0.22) { drawGiantFern(ctx, px, py, s, s2); return true; }
    if (f['1.2.4.16'] > 0.4 && s3 > 0.7) { drawOrchidSpray(ctx, px, py, s, s2); return true; }
    if (f['1.2.4.16'] > 0.4 && s2 > 0.78) { drawBromeliad(ctx, px, py, s, s1); return true; }
    if (f['1.2.4.17'] > 0.4 && roll < 0.48) { drawBigLeafPlant(ctx, px, py, s, s2); return true; }
    if (f['1.2.4.18'] > 0.35 && s2 > 0.62) {
        drawTropicalPalm(ctx, px, py, s * 0.38, s1 * 2, s2, 0.42, { bark: '#806c4d', barkLight: '#ad956c' });
        return true;
    }
    if (f['1.2.4.10'] > 0.4 && roll < 0.78) {
        drawTropicalShrub(ctx, px, py, cellPx, s1, s2);
        return true;
    }
    drawSimpleFern(ctx, px, py, s, s2);
    return true;
}

export function drawTropicalFloor(ctx, px, py, cellPx, stand, s1, s2, dayOfYear, climateKey) {
    const s = cellPx / 48;
    const t = stand?.tropical;
    if (!t) return;
    if (t.water.pools > 0.32 && s1 < 0.16 + t.water.pools * 0.2) {
        drawTropicalPool(ctx, px + (s2 - 0.5) * cellPx * 0.2, py + 2 * s, cellPx, stand, s1, s2);
    }
    if (t.features['1.2.4.17'] > 0.4 && s2 < 0.22) {
        drawBigLeafPlant(ctx, px + (s1 - 0.5) * cellPx * 0.3, py, s * 0.8, s2);
    }
    if (t.landUse.settlement && s1 < 0.28) {
        drawTropicalHut(ctx, px + (s2 - 0.5) * cellPx * 0.3, py, s * 0.8, s1);
        if (s2 > 0.42) drawTropicalHut(ctx, px + cellPx * 0.22, py, s * 0.58, s2);
    }
    if (t.landUse.agriculture && !t.landUse.settlement && s2 > 0.72) {
        ctx.save();
        ctx.strokeStyle = 'rgba(190, 174, 106, 0.38)';
        ctx.lineWidth = Math.max(0.5, 0.55 * s);
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(px - 5 * s, py + (i - 1) * 1.2 * s);
            ctx.lineTo(px + 5 * s, py + (i - 1) * 1.2 * s - 1.4 * s);
            ctx.stroke();
        }
        ctx.restore();
    }
    if (t.landUse.plantation && s2 > 0.68) {
        ctx.save();
        ctx.strokeStyle = 'rgba(151, 125, 74, 0.5)';
        ctx.lineWidth = Math.max(0.45, 0.5 * s);
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(px - 5 * s, py + i * 1.4 * s);
            ctx.lineTo(px + 5 * s, py + i * 1.4 * s);
            ctx.stroke();
        }
        ctx.restore();
    }
    if (t.landUse.riverTrade && t.water.largeRivers > 0.55 && s1 > 0.8) {
        ctx.save();
        ctx.fillStyle = '#5b4730';
        ctx.beginPath();
        ctx.ellipse(px + 3 * s, py + 3 * s, 4.2 * s, 1.1 * s, 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    if (t.clearance > 0.55 && t.regrowth < 0.5 && s2 > 0.7) {
        drawTropicalStump(ctx, px - 2 * s, py, s, s1);
    }
}

export { drawTropicalTree, drawTropicalPalm, drawTropicalBamboo };
