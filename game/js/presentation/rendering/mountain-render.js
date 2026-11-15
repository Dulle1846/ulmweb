// Mountain detail layer (spec 1.2.12.1–1.2.12.77).
//
// The baked terrain carries the broad height colour. This layer supplies the
// readable mountain: rock strata and scree, snow and ice, springs and tarns,
// krummholz, alpine flowers, animals and the works built by the realm. Every
// loop is capped and every roll is deterministic, so a low-end frame pays for
// the visible slope only.

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

function colour(value, fallback) {
    return typeof value === "string" && value.startsWith("#") ? value : fallback;
}

function hash(value, seed) {
    return ((Math.imul((value | 0) + 1, 0x9e3779b1) ^ Math.imul((seed | 0) + 1, 0x85ebca6b)) >>> 0) / 0x100000000;
}

// The same slope must read as granite, limestone or slate. These palettes are
// deliberately separated in value as well as hue so the rock type survives a
// small screen, low contrast and the snow wash above the tree line.
const ROCK_PALETTES = Object.freeze({
    granite: Object.freeze({ dark: "#6b6259", deeper: "#403a36", lit: "#c9beaa", mid: "#8d8174", seam: "#514840" }),
    limestone: Object.freeze({ dark: "#8b8676", deeper: "#565449", lit: "#ded6bf", mid: "#aca48f", seam: "#6b6759" }),
    slate: Object.freeze({ dark: "#565f60", deeper: "#323b3f", lit: "#b8c0b7", mid: "#747d7b", seam: "#3f4a4d" }),
    marble: Object.freeze({ dark: "#9a948b", deeper: "#625f5a", lit: "#eee6d4", mid: "#bdb5a7", seam: "#7c756b" }),
});

function rockPalette(profile) {
    return ROCK_PALETTES[profile?.landform?.rockType] || ROCK_PALETTES.granite;
}


// The broad terrain colour only knows height and moisture; it cannot tell a
// jagged arête from a rounded dome. These ten small, capped silhouettes give
// each formation a readable profile at play zoom without adding a terrain
// mesh. They deliberately use a hard rock face and a sunlit crest: the baked
// highland is pale enough that a low-alpha overlay would vanish in snow.
function drawFormationRelief(ctx, px, py, cellPx, s, profile, roll) {
    if (cellPx < 20) return;
    const formation = profile.formation;
    const land = profile.landform || {};
    const visual = profile.visual || {};
    const snow = clamp01(visual.snow);
    const snowHex = colour(visual.snowHex, "#f4f6ef");
    // Profile coordinates are world tiles. Screen coordinates would make the
    // silhouette gate and width change whenever the camera pans.
    const tileX = Number.isFinite(Number(profile.x)) ? Number(profile.x) : Math.floor(px / cellPx);
    const tileY = Number.isFinite(Number(profile.y)) ? Number(profile.y) : Math.floor(py / cellPx);
    const shift = (hash(tileX + tileY * 37, 91) - 0.5) * cellPx * 0.16;
    // Skipping a deterministic minority of cells breaks the carpet of
    // identical peaks without thinning the range into isolated icons.
    if (hash(tileX + tileY * 97, 7) < 0.16) return;
    const width = 0.78 + hash(tileX + tileY * 113, 43) * 0.28;
    const L = px - cellPx * 0.47 * width + shift;
    const R = px + cellPx * 0.47 * width + shift;
    const mid = (L + R) / 2;
    // Keep the whole silhouette inside its tile. Neighbouring rows paint in
    // ascending order, so a peak rising above py would be covered by the next
    // row and every formation would collapse to the same little tent.
    const peak = py + cellPx * (0.025 + hash(tileX + tileY * 53, 23) * 0.035);
    const foot = py + cellPx * (0.43 + hash(tileX + tileY * 71, 37) * 0.035);
    const palette = rockPalette(profile);
    const dark = palette.dark;
    const deeper = palette.deeper;
    const lit = palette.lit;
    const seam = palette.seam;
    const poly = (points, fill, alpha) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let index = 1; index < points.length; index++) ctx.lineTo(points[index][0], points[index][1]);
        ctx.closePath();
        ctx.fill();
    };
    const line = (points, stroke, width, alpha = 0.72) => {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = Math.max(0.5, width * s);
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let index = 1; index < points.length; index++) ctx.lineTo(points[index][0], points[index][1]);
        ctx.stroke();
    };
    const snowCap = (points, alpha = 0.9) => {
        if (snow < 0.2) return;
        poly(points, snowHex, clamp01(alpha * (0.45 + snow * 0.6)));
        // A shaded lower lip turns a white roof into a real snow line.
        line(points, "#8f9995", 0.55, 0.32);
    };
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (formation === "foothills") {
        const hill = [[L, foot], [L + cellPx * 0.04, foot - cellPx * 0.02],
            [L + cellPx * 0.16, foot - cellPx * 0.105], [mid - cellPx * 0.04, foot - cellPx * 0.13],
            [mid + cellPx * 0.13, foot - cellPx * 0.085], [R - cellPx * 0.08, foot - cellPx * 0.12],
            [R, foot]];
        poly(hill, "#6f7c64", 0.42);
        line(hill.slice(1, -1), "#4e5b45", 0.7, 0.55);
    } else if (formation === "high-chain") {
        const ridge = [[L, foot], [L + cellPx * 0.09, py + cellPx * 0.1],
            [L + cellPx * 0.18, peak + cellPx * 0.03], [L + cellPx * 0.27, py + cellPx * 0.12],
            [mid, peak - cellPx * 0.015], [mid + cellPx * 0.1, py + cellPx * 0.1],
            [R - cellPx * 0.08, peak + cellPx * 0.035], [R, foot]];
        poly(ridge, dark, 0.82);
        line([[L + cellPx * 0.09, py + cellPx * 0.1], [L + cellPx * 0.18, peak + cellPx * 0.03],
            [L + cellPx * 0.27, py + cellPx * 0.12], [mid, peak - cellPx * 0.015],
            [mid + cellPx * 0.1, py + cellPx * 0.1], [R - cellPx * 0.08, peak + cellPx * 0.035]], lit, 0.9);
        snowCap([[mid, peak - cellPx * 0.015], [mid + cellPx * 0.07, py + cellPx * 0.035], [mid - cellPx * 0.05, py + cellPx * 0.04]], 0.85);
        snowCap([[L + cellPx * 0.18, peak + cellPx * 0.03], [L + cellPx * 0.23, py + cellPx * 0.045], [L + cellPx * 0.14, py + cellPx * 0.05]], 0.62);
        snowCap([[R - cellPx * 0.08, peak + cellPx * 0.035], [R - cellPx * 0.14, py + cellPx * 0.05], [R - cellPx * 0.03, py + cellPx * 0.055]], 0.62);
    } else if (formation === "jagged-peaks") {
        const teeth = [[L, foot], [L + cellPx * 0.12, py + cellPx * 0.01],
            [L + cellPx * 0.2, peak + cellPx * 0.06], [L + cellPx * 0.26, py + cellPx * 0.02],
            [mid, peak - cellPx * 0.035], [mid + cellPx * 0.06, py + cellPx * 0.055],
            [mid + cellPx * 0.2, peak + cellPx * 0.015], [R - cellPx * 0.1, py + cellPx * 0.03],
            [R, foot]];
        poly(teeth, dark, 0.84);
        line([[L + cellPx * 0.12, py + cellPx * 0.01], [L + cellPx * 0.2, peak + cellPx * 0.06],
            [L + cellPx * 0.26, py + cellPx * 0.02], [mid, peak - cellPx * 0.035],
            [mid + cellPx * 0.06, py + cellPx * 0.055], [mid + cellPx * 0.2, peak + cellPx * 0.015]], lit, 0.85);
        snowCap([[mid, peak - cellPx * 0.035], [mid + cellPx * 0.05, py + cellPx * 0.045], [mid - cellPx * 0.055, py + cellPx * 0.055]]);
        snowCap([[L + cellPx * 0.2, peak + cellPx * 0.06], [L + cellPx * 0.24, py + cellPx * 0.04], [L + cellPx * 0.15, py + cellPx * 0.05]], 0.65);
        line([[mid + cellPx * 0.01, peak + cellPx * 0.05], [mid - cellPx * 0.03, foot]], deeper, 0.8, 0.55);
    } else if (formation === "rounded-summits") {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.moveTo(L, foot);
        ctx.bezierCurveTo(mid - cellPx * 0.28, py + cellPx * 0.02, mid - cellPx * 0.12, peak, mid, peak);
        ctx.bezierCurveTo(mid + cellPx * 0.18, peak + cellPx * 0.01, mid + cellPx * 0.32, py + cellPx * 0.04, R, foot);
        ctx.closePath();
        ctx.fill();
        line([[mid - cellPx * 0.25, foot - cellPx * 0.04], [mid - cellPx * 0.1, peak + cellPx * 0.015],
            [mid + cellPx * 0.08, peak + cellPx * 0.005], [mid + cellPx * 0.27, foot - cellPx * 0.03]], lit, 0.9);
        snowCap([[mid - cellPx * 0.1, peak + cellPx * 0.028], [mid, peak + cellPx * 0.005],
            [mid + cellPx * 0.11, peak + cellPx * 0.03], [mid + cellPx * 0.03, peak + cellPx * 0.07],
            [mid - cellPx * 0.06, peak + cellPx * 0.07]]);
    } else if (formation === "sheer-walls") {
        const wall = [[L, foot], [L + cellPx * 0.035, py - cellPx * 0.005], [R - cellPx * 0.02, py],
            [R, foot]];
        poly(wall, dark, 0.84);
        poly([[mid, py], [R, foot], [mid + cellPx * 0.08, foot], [mid + cellPx * 0.02, py]], deeper, 0.5);
        line([[L + cellPx * 0.04, py], [R - cellPx * 0.02, py + cellPx * 0.005]], lit, 1.0);
        for (let index = 0; index < 3; index++) {
            const y = py + cellPx * (0.035 + index * 0.05);
            line([[L + cellPx * 0.04, y], [R - cellPx * 0.01, y + cellPx * 0.008]], "#394345", 0.55, 0.45);
        }
        snowCap([[L + cellPx * 0.05, py - cellPx * 0.002], [R - cellPx * 0.03, py], [R - cellPx * 0.06, py + cellPx * 0.035], [L + cellPx * 0.1, py + cellPx * 0.03]]);
    } else if (formation === "ridges") {
        for (let index = 0; index < 3; index++) {
            const lift = index * cellPx * 0.065;
            const band = [[L, foot - lift], [R, foot - lift - cellPx * 0.12],
                [R, foot - lift - cellPx * 0.075], [L, foot - lift + cellPx * 0.055]];
            poly(band, index === 1 ? dark : "#626a63", index === 1 ? 0.72 : 0.46);
            line([[L, foot - lift], [R, foot - lift - cellPx * 0.12]], lit, 0.65, index === 1 ? 0.72 : 0.4);
        }
        snowCap([[mid - cellPx * 0.24, foot - cellPx * 0.2], [mid + cellPx * 0.22, foot - cellPx * 0.31],
            [mid + cellPx * 0.28, foot - cellPx * 0.275], [mid - cellPx * 0.18, foot - cellPx * 0.165]], 0.7);
    } else if (formation === "deep-valleys") {
        const left = [[L, foot], [L + cellPx * 0.1, py + cellPx * 0.03],
            [mid - cellPx * 0.1, peak], [mid - cellPx * 0.015, foot - cellPx * 0.02]];
        const right = [[R, foot], [R - cellPx * 0.1, py + cellPx * 0.03],
            [mid + cellPx * 0.1, peak - cellPx * 0.005], [mid + cellPx * 0.015, foot - cellPx * 0.02]];
        poly(left, dark, 0.78);
        poly(right, dark, 0.78);
        line(left.slice(1), lit, 0.8);
        line(right.slice(1), lit, 0.8);
        poly([[mid - cellPx * 0.12, py + cellPx * 0.03], [mid, foot], [mid + cellPx * 0.12, py + cellPx * 0.03]], deeper, 0.55);
        snowCap([[mid - cellPx * 0.1, peak], [mid - cellPx * 0.035, py + cellPx * 0.035], [mid - cellPx * 0.12, py + cellPx * 0.045]], 0.75);
        snowCap([[mid + cellPx * 0.1, peak - cellPx * 0.005], [mid + cellPx * 0.04, py + cellPx * 0.035], [mid + cellPx * 0.13, py + cellPx * 0.04]], 0.75);
    } else if (formation === "gorge") {
        const leftWall = [[L, foot], [L + cellPx * 0.03, py], [mid - cellPx * 0.085, py + cellPx * 0.005],
            [mid - cellPx * 0.045, foot]];
        const rightWall = [[R, foot], [R - cellPx * 0.03, py],
            [mid + cellPx * 0.085, py + cellPx * 0.005], [mid + cellPx * 0.045, foot]];
        poly(leftWall, "#59625f", 0.82);
        poly(rightWall, "#495250", 0.86);
        line([[L + cellPx * 0.04, py], [mid - cellPx * 0.085, py + cellPx * 0.005]], lit, 0.9);
        line([[R - cellPx * 0.04, py], [mid + cellPx * 0.085, py + cellPx * 0.005]], lit, 0.9);
        poly([[mid - cellPx * 0.06, py + cellPx * 0.01], [mid, foot], [mid + cellPx * 0.06, py + cellPx * 0.01]], "#293537", 0.62);
        snowCap([[mid - cellPx * 0.1, py + cellPx * 0.008], [mid - cellPx * 0.035, py + cellPx * 0.008], [mid - cellPx * 0.05, py + cellPx * 0.03]], 0.55);
        snowCap([[mid + cellPx * 0.1, py + cellPx * 0.008], [mid + cellPx * 0.035, py + cellPx * 0.008], [mid + cellPx * 0.05, py + cellPx * 0.03]], 0.55);
    } else if (formation === "plateau") {
        const mesa = [[L + cellPx * 0.02, py + cellPx * 0.005], [R - cellPx * 0.02, py - cellPx * 0.005],
            [R - cellPx * 0.035, foot], [L + cellPx * 0.04, foot]];
        poly(mesa, "#5b635f", 0.82);
        poly([[mid, py], [R - cellPx * 0.02, py - cellPx * 0.005], [R - cellPx * 0.035, foot], [mid + cellPx * 0.06, foot]], deeper, 0.42);
        line([[L + cellPx * 0.04, py + cellPx * 0.003], [R - cellPx * 0.03, py - cellPx * 0.003]], lit, 1.1);
        for (let index = 0; index < 2; index++) {
            line([[L + cellPx * 0.08 + index * cellPx * 0.2, py + cellPx * 0.035], [L + cellPx * 0.11 + index * cellPx * 0.2, foot - cellPx * 0.02]], "#3e4747", 0.55, 0.45);
        }
        snowCap([[L + cellPx * 0.06, py], [R - cellPx * 0.03, py - cellPx * 0.004], [R - cellPx * 0.1, py + cellPx * 0.025], [L + cellPx * 0.12, py + cellPx * 0.025]]);
    } else {
        // Isolated massif: one compact asymmetric peak with two shoulders,
        // distinct from both the long high chain and the sharp multi-peak row.
        const massif = [[L, foot], [mid - cellPx * 0.2, py + cellPx * 0.12], [mid - cellPx * 0.08, py + cellPx * 0.035],
            [mid, peak], [mid + cellPx * 0.07, py + cellPx * 0.07],
            [mid + cellPx * 0.22, py + cellPx * 0.13], [R, foot]];
        poly(massif, dark, 0.82);
        line([[mid - cellPx * 0.2, py + cellPx * 0.12], [mid, peak], [mid + cellPx * 0.22, py + cellPx * 0.13]], lit, 0.95);
        poly([[mid, peak], [mid + cellPx * 0.07, py + cellPx * 0.055], [mid + cellPx * 0.015, foot]], deeper, 0.32);
        snowCap([[mid, peak], [mid + cellPx * 0.055, py + cellPx * 0.035], [mid + cellPx * 0.02, py + cellPx * 0.06],
            [mid - cellPx * 0.045, py + cellPx * 0.055], [mid - cellPx * 0.06, py + cellPx * 0.1]], 0.8);
    }
    // A hard cast shadow under the south-east flank sells the relief even
    // where the baked hillshade is gentle.
    if (land.cliff > 0.28 || land.ridge > 0.34) {
        poly([[mid + cellPx * 0.04, foot - cellPx * 0.02], [R, foot],
            [mid + cellPx * 0.14, foot + cellPx * 0.02]], "#283438", 0.3);
    }
    ctx.restore();
}

function drawRockGround(ctx, px, py, cellPx, s, profile, roll) {
    const land = profile.landform || {};
    const visual = profile.visual || {};
    const rock = clamp01(land.rock);
    const snow = clamp01(visual.snow);
    const scree = clamp01(land.scree);
    const palette = rockPalette(profile);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = colour(visual.groundHex, palette.mid);
    ctx.beginPath();
    ctx.ellipse(px + cellPx * 0.03, py + cellPx * 0.09, cellPx * 0.27, cellPx * 0.12, roll * 0.3, 0, Math.PI * 2);
    ctx.fill();
    if (rock > 0.18) {
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = palette.mid;
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.2, py + cellPx * 0.16);
        ctx.lineTo(px - cellPx * 0.06, py + cellPx * (0.02 + roll * 0.04));
        ctx.lineTo(px + cellPx * 0.12, py + cellPx * 0.06);
        ctx.lineTo(px + cellPx * 0.23, py + cellPx * 0.16);
        ctx.closePath();
        ctx.fill();
        // Bedding planes and cracks are what separate a rock face from a grey
        // polygon. Keep the lines long and sparse enough to read at 24 px.
        ctx.globalAlpha = 0.38;
        ctx.strokeStyle = palette.seam;
        ctx.lineWidth = Math.max(0.4, 0.55 * s);
        const planes = Math.min(3, 1 + Math.floor(rock * 3));
        for (let index = 0; index < planes; index++) {
            const y = py + cellPx * (0.05 + index * 0.045);
            ctx.beginPath();
            ctx.moveTo(px - cellPx * 0.17, y + 1.4 * s);
            ctx.quadraticCurveTo(px, y - 1.2 * s, px + cellPx * 0.2, y + 0.6 * s);
            ctx.stroke();
        }
        // Surface identity: granite speckles, slate cleavage, marble veins.
        // Limestone keeps the long bedding planes above.
        if (land.rockType === "granite") {
            ctx.globalAlpha = 0.34;
            ctx.fillStyle = palette.deeper;
            for (let index = 0; index < 4; index++) {
                const gx = px + (hash(index + 3, Math.floor(px * 0.25 + py)) - 0.5) * cellPx * 0.34;
                const gy = py + cellPx * (0.035 + index * 0.03);
                ctx.fillRect(gx, gy, 1.1 * s, 0.8 * s);
            }
        } else if (land.rockType === "slate") {
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = palette.lit;
            for (let index = 0; index < 3; index++) {
                const x = px - cellPx * 0.14 + index * cellPx * 0.1;
                ctx.beginPath();
                ctx.moveTo(x, py + cellPx * 0.04);
                ctx.lineTo(x + cellPx * 0.07, py + cellPx * 0.14);
                ctx.stroke();
            }
        } else if (land.rockType === "marble") {
            ctx.globalAlpha = 0.25;
            ctx.strokeStyle = palette.lit;
            ctx.beginPath();
            ctx.moveTo(px - cellPx * 0.12, py + cellPx * 0.12);
            ctx.quadraticCurveTo(px, py + cellPx * 0.06, px + cellPx * 0.14, py + cellPx * 0.075);
            ctx.stroke();
        }
        if (land.cliff > 0.44) {
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = palette.seam;
            ctx.lineWidth = Math.max(0.45, 0.7 * s);
            ctx.beginPath();
            ctx.moveTo(px + cellPx * (0.1 - roll * 0.06), py + cellPx * 0.02);
            ctx.lineTo(px + cellPx * (0.15 + roll * 0.05), py + cellPx * 0.17);
            ctx.stroke();
        }
        // A crevice is a dark, offset fracture, not another bedding plane.
        if (clamp01(land.crevice) > 0.34) {
            ctx.globalAlpha = 0.42;
            ctx.strokeStyle = palette.deeper;
            ctx.lineWidth = Math.max(0.45, 0.75 * s);
            const cx = px + (roll - 0.5) * cellPx * 0.2;
            ctx.beginPath();
            ctx.moveTo(cx - cellPx * 0.02, py + cellPx * 0.015);
            ctx.lineTo(cx + cellPx * 0.015, py + cellPx * 0.06);
            ctx.lineTo(cx - cellPx * 0.012, py + cellPx * 0.105);
            ctx.lineTo(cx + cellPx * 0.02, py + cellPx * 0.155);
            ctx.stroke();
        }
        // Cave mouths and overhangs are real dark openings under a lit lip.
        if (land.cave) {
            const caveX = px + (roll - 0.5) * cellPx * 0.24;
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = "#252b2b";
            ctx.beginPath();
            ctx.ellipse(caveX, py + cellPx * 0.11, cellPx * 0.055, cellPx * 0.043, 0, Math.PI, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.34;
            ctx.strokeStyle = palette.lit;
            ctx.lineWidth = Math.max(0.4, 0.55 * s);
            ctx.beginPath();
            ctx.ellipse(caveX, py + cellPx * 0.11, cellPx * 0.06, cellPx * 0.048, 0, Math.PI, Math.PI * 2);
            ctx.stroke();
            if (land.overhang) {
                ctx.globalAlpha = 0.36;
                ctx.fillStyle = palette.dark;
                ctx.beginPath();
                ctx.moveTo(caveX - cellPx * 0.09, py + cellPx * 0.1);
                ctx.lineTo(caveX + cellPx * 0.08, py + cellPx * 0.095);
                ctx.lineTo(caveX + cellPx * 0.04, py + cellPx * 0.13);
                ctx.closePath();
                ctx.fill();
            }
        }
    }
    if (scree > 0.22 && cellPx >= 18) {
        const stones = Math.min(5, 2 + Math.floor(scree * 4));
        ctx.fillStyle = palette.dark;
        for (let index = 0; index < stones; index++) {
            const x = px + (hash(index + 5, Math.floor(px + py)) - 0.5) * cellPx * 0.44;
            const y = py + cellPx * (0.08 + (index % 3) * 0.035);
            ctx.globalAlpha = 0.28;
            ctx.beginPath();
            ctx.ellipse(x, y, (1 + (index % 2)) * s, 0.7 * s, index * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (clamp01(land.boulders) > 0.42 && cellPx >= 20) {
        // Boulder fields are larger and fewer than scree: a walker sees the
        // blocks before the gravel, which is the point of 1.2.12.22.
        const count = Math.min(4, 1 + Math.floor(land.boulders * 4));
        for (let index = 0; index < count; index++) {
            const x = px + (hash(index + 19, Math.floor(px + py * 0.5)) - 0.5) * cellPx * 0.4;
            const y = py + cellPx * (0.07 + (index % 2) * 0.045);
            ctx.globalAlpha = 0.38;
            ctx.fillStyle = palette.dark;
            ctx.beginPath();
            ctx.ellipse(x, y, (2.1 + (index % 2)) * s, 1.45 * s, index * 0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.24;
            ctx.fillStyle = palette.lit;
            ctx.beginPath();
            ctx.ellipse(x - 0.4 * s, y - 0.4 * s, 1.2 * s, 0.5 * s, index * 0.7, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    // Snow on the detail layer lives on the formation caps. A broad white
    // band here would sit above the silhouette and flatten every ridge into
    // the same plateau, so only a small wind drift survives at the tile edge.
    if (snow > 0.7) {
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = colour(visual.snowHex, "#e4e7e2");
        ctx.beginPath();
        ctx.ellipse(px - cellPx * 0.3, py + cellPx * 0.04, cellPx * 0.09, cellPx * 0.022, roll * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }
    if (clamp01(visual.ice) > 0.28) {
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = colour(visual.iceHex, "#b9d2d5");
        ctx.beginPath();
        ctx.ellipse(px + cellPx * 0.05, py + cellPx * 0.12, cellPx * 0.16, cellPx * 0.055, roll * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawWater(ctx, px, py, cellPx, s, profile, roll, tick) {
    const water = profile.water || {};
    const visual = profile.visual || {};
    // A spring is a source, not a small lake: a dark eye, a pale rim and a
    // single outflow line distinguish it from a tarn at play zoom.
    if (water.spring > 0.26 && cellPx >= 18) {
        const sx = px - cellPx * 0.12 + roll * cellPx * 0.06;
        const sy = py + cellPx * 0.1;
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = colour(visual.waterHex, "#55777a");
        ctx.beginPath();
        ctx.ellipse(sx, sy, 1.8 * s, 1.2 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = "#c3d3c9";
        ctx.lineWidth = Math.max(0.35, 0.45 * s);
        ctx.beginPath();
        ctx.arc(sx, sy, 2.6 * s, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = colour(visual.waterHex, "#55777a");
        ctx.beginPath();
        ctx.moveTo(sx + 2.2 * s, sy);
        ctx.quadraticCurveTo(sx + cellPx * 0.08, sy + 1.2 * s, sx + cellPx * 0.14, sy + 0.4 * s);
        ctx.stroke();
    }
    if (water.lake > 0.42) {
        const width = cellPx * (0.12 + water.lake * 0.1);
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = colour(visual.waterHex, "#55777a");
        ctx.beginPath();
        ctx.ellipse(px, py + cellPx * 0.11, width, width * 0.38, roll * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.24;
        ctx.strokeStyle = "#b9c9bd";
        ctx.lineWidth = Math.max(0.4, 0.45 * s);
        ctx.beginPath();
        ctx.ellipse(px, py + cellPx * 0.1, width * 0.68, width * 0.16, roll * 0.2, Math.PI * 0.1, Math.PI * 0.9);
        ctx.stroke();
    }
    if (water.stream > 0.3 || water.meltwater > 0.24) {
        ctx.globalAlpha = 0.32;
        ctx.strokeStyle = water.glacier > 0.4 ? "#a9c8c7" : "#6f8c87";
        ctx.lineWidth = Math.max(0.5, 0.8 * s);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.22, py + cellPx * (0.04 + roll * 0.06));
        ctx.bezierCurveTo(px - cellPx * 0.08, py + cellPx * 0.1, px + cellPx * 0.06, py + cellPx * 0.02, px + cellPx * 0.22, py + cellPx * 0.12);
        ctx.stroke();
    }
    if (water.waterfall > 0.4 && cellPx >= 20) {
        ctx.globalAlpha = 0.34;
        ctx.strokeStyle = "#d6e3df";
        ctx.lineWidth = Math.max(0.6, 1.1 * s);
        const fall = Math.sin((Number(tick) || 0) * 0.002 + roll * 5) * 0.8 * s;
        ctx.beginPath();
        ctx.moveTo(px + cellPx * 0.06, py + cellPx * 0.01);
        ctx.lineTo(px + cellPx * 0.04 + fall, py + cellPx * 0.16);
        ctx.stroke();
    }
    if (water.frozenFalls > 0.5) {
        // A frozen fall keeps the vertical shape: pale icicles under a blue
        // lip, rather than a flat white puddle on the slope.
        ctx.globalAlpha = 0.34;
        ctx.strokeStyle = "#c9e0e2";
        ctx.lineWidth = Math.max(0.5, 0.7 * s);
        const fx = px + cellPx * 0.05;
        for (let index = 0; index < 3; index++) {
            ctx.beginPath();
            ctx.moveTo(fx + (index - 1) * 1.5 * s, py + cellPx * 0.065);
            ctx.lineTo(fx + (index - 1) * 1.3 * s, py + cellPx * (0.1 + index * 0.012));
            ctx.stroke();
        }
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = "#a9c8c7";
        ctx.beginPath();
        ctx.ellipse(fx, py + cellPx * 0.062, 3.2 * s, 1.1 * s, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    if (water.iceCave > 0.36) {
        // Ice caves read as a cold blue mouth beside the rock cave/crevice.
        const ix = px + cellPx * (0.06 + roll * 0.08);
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = "#6f9ca3";
        ctx.beginPath();
        ctx.ellipse(ix, py + cellPx * 0.105, cellPx * 0.045, cellPx * 0.034, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = "#d6e8e7";
        ctx.lineWidth = Math.max(0.35, 0.5 * s);
        ctx.beginPath();
        ctx.ellipse(ix, py + cellPx * 0.105, cellPx * 0.05, cellPx * 0.038, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
    }
    if (water.snowfield > 0.4 && cellPx >= 18) {
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = colour(visual.snowHex, "#e4e7e2");
        ctx.beginPath();
        ctx.ellipse(px + cellPx * 0.16, py + cellPx * 0.125, cellPx * 0.1, cellPx * 0.028, roll * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = "#aebbb4";
        ctx.beginPath();
        ctx.ellipse(px + cellPx * 0.16, py + cellPx * 0.128, cellPx * 0.09, cellPx * 0.018, roll * 0.3, 0, Math.PI);
        ctx.stroke();
    }
    if (water.glacier > 0.46) {
        // A short ice tongue, not a full-width white band: the band used to
        // sit on top of every summit and flatten all ten silhouettes.
        ctx.globalAlpha = 0.17;
        ctx.strokeStyle = "#cce1e2";
        ctx.lineWidth = Math.max(0.5, 0.7 * s);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.1, py + cellPx * 0.07);
        ctx.quadraticCurveTo(px - cellPx * 0.02, py + cellPx * 0.1, px + cellPx * 0.09, py + cellPx * 0.055);
        ctx.stroke();
    }
}

function drawAlpineFlora(ctx, px, py, cellPx, s, profile, roll) {
    const vegetation = profile.vegetation || {};
    const fine = cellPx >= 24;
    if (vegetation.krummholz > 0.22) {
        ctx.globalAlpha = 0.32;
        ctx.strokeStyle = "#4e684c";
        ctx.lineWidth = Math.max(0.4, 0.55 * s);
        const count = fine ? Math.min(4, 1 + Math.floor(vegetation.krummholz * 3)) : 1;
        for (let index = 0; index < count; index++) {
            const x = px + (hash(index + 17, Math.floor(px + py)) - 0.5) * cellPx * 0.38;
            const y = py + cellPx * (0.09 + index * 0.018);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - 2 * s, y - 4 * s);
            ctx.moveTo(x, y);
            ctx.lineTo(x + 2.2 * s, y - 3.4 * s);
            ctx.stroke();
        }
    }
    if (fine && vegetation.grasses?.length) {
        ctx.globalAlpha = 0.32;
        ctx.strokeStyle = colour(profile.visual?.grassHex, "#7d8a63");
        ctx.lineWidth = Math.max(0.35, 0.45 * s);
        for (let index = 0; index < 3; index++) {
            const x = px + (index - 1) * cellPx * 0.06 + (roll - 0.5) * cellPx * 0.05;
            const y = py + cellPx * 0.14;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + (roll - 0.5) * 2 * s, y - 4 * s);
            ctx.stroke();
        }
    }
    if (fine && vegetation.flowers?.length && vegetation.bloom > 0.18) {
        for (let index = 0; index < Math.min(3, vegetation.flowers.length); index++) {
            const flower = vegetation.flowers[index];
            const x = px + (hash(index + 31, Math.floor(px + py)) - 0.5) * cellPx * 0.4;
            const y = py + cellPx * (0.08 + index * 0.026);
            const petal = colour(flower.colours?.[0], "#d4c77d");
            ctx.globalAlpha = 0.36;
            ctx.fillStyle = petal;
            if (flower.rare) {
                // A rare high flower gets a small pale halo so it is findable
                // without turning the slope into a field of white dots.
                ctx.globalAlpha = 0.16;
                ctx.beginPath();
                ctx.arc(x, y, 3.2 * s, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 0.5;
            }
            if (flower.id === "gentian") {
                ctx.beginPath();
                ctx.moveTo(x - 1.3 * s, y);
                ctx.lineTo(x + 1.3 * s, y);
                ctx.lineTo(x, y - 2.2 * s);
                ctx.closePath();
                ctx.fill();
            } else if (flower.id === "alpine-aster") {
                for (let p = 0; p < 5; p++) {
                    const a = (p / 5) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.ellipse(x + Math.cos(a) * 1.1 * s, y + Math.sin(a) * 1.1 * s, 0.55 * s, 1.1 * s, a, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else {
                // Edelweiss and glacier buttercup: five short star rays.
                ctx.strokeStyle = petal;
                ctx.lineWidth = Math.max(0.4, 0.55 * s);
                for (let p = 0; p < 5; p++) {
                    const a = (p / 5) * Math.PI * 2 + 0.2;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + Math.cos(a) * 2 * s, y + Math.sin(a) * 2 * s);
                    ctx.stroke();
                }
                ctx.globalAlpha = 0.55;
                ctx.beginPath();
                ctx.arc(x, y, 0.7 * s, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    if (fine && vegetation.mosses?.length) {
        const moss = vegetation.mosses[0];
        const mossColour = colour(moss.colours?.[0], "#89906d");
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = mossColour;
        ctx.beginPath();
        ctx.ellipse(px - cellPx * 0.1, py + cellPx * 0.13, cellPx * 0.1, cellPx * 0.04, 0.2, 0, Math.PI * 2);
        ctx.fill();
        if (moss.id === "crustose-lichen" || moss.id === "reindeer-lichen") {
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = colour(moss.colours?.[1], "#b7b79a");
            for (let index = 0; index < 3; index++) {
                const lx = px + (hash(index + 53, Math.floor(px - py)) - 0.5) * cellPx * 0.34;
                const ly = py + cellPx * (0.1 + index * 0.018);
                ctx.fillRect(lx, ly, 1.3 * s, 0.8 * s);
            }
        }
    }
}

function drawWorks(ctx, px, py, cellPx, s, profile, roll) {
    const use = profile.use || {};
    if (use.road) {
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = "#a99369";
        ctx.lineWidth = Math.max(0.6, 1.2 * s);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.2, py + cellPx * 0.15);
        ctx.bezierCurveTo(px - cellPx * 0.05, py + cellPx * 0.08, px + cellPx * 0.04, py + cellPx * 0.13, px + cellPx * 0.2, py + cellPx * 0.05);
        ctx.stroke();
    }
    if (use.bridge && profile.landform?.gorge > 0.4) {
        ctx.globalAlpha = 0.38;
        ctx.strokeStyle = "#8b6b45";
        ctx.lineWidth = Math.max(0.8, 1.4 * s);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.16, py + cellPx * 0.1);
        ctx.quadraticCurveTo(px, py + cellPx * 0.04, px + cellPx * 0.16, py + cellPx * 0.1);
        ctx.stroke();
        ctx.strokeStyle = "#59452f";
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.14, py + cellPx * 0.12);
        ctx.lineTo(px - cellPx * 0.14, py + cellPx * 0.16);
        ctx.moveTo(px + cellPx * 0.14, py + cellPx * 0.12);
        ctx.lineTo(px + cellPx * 0.14, py + cellPx * 0.16);
        ctx.stroke();
    }
    if (use.terraced) {
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = "#a59b7f";
        ctx.lineWidth = Math.max(0.4, 0.55 * s);
        for (let index = 0; index < 3; index++) {
            const y = py + cellPx * (0.06 + index * 0.03);
            ctx.beginPath();
            ctx.moveTo(px - cellPx * 0.2, y);
            ctx.lineTo(px + cellPx * 0.16, y + 1.2 * s);
            ctx.stroke();
        }
    }
    if (use.fortress || use.valleySettlement) {
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = use.fortress ? "#766d5e" : "#8c7d63";
        const width = cellPx * (use.fortress ? 0.1 : 0.07);
        ctx.fillRect(px + cellPx * 0.03, py + cellPx * 0.05, width, width * 0.9);
        ctx.fillStyle = "#5e564a";
        ctx.fillRect(px + cellPx * 0.03 + width * 0.25, py + cellPx * 0.02, width * 0.5, width * 0.35);
    }
    if (use.fortifiedPass) {
        ctx.globalAlpha = 0.38;
        ctx.strokeStyle = "#8d8370";
        ctx.lineWidth = Math.max(0.7, 1 * s);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.12, py + cellPx * 0.08);
        ctx.lineTo(px - cellPx * 0.12, py + cellPx * 0.17);
        ctx.moveTo(px + cellPx * 0.12, py + cellPx * 0.08);
        ctx.lineTo(px + cellPx * 0.12, py + cellPx * 0.17);
        ctx.stroke();
    }
    if (use.mine) {
        ctx.globalAlpha = 0.44;
        ctx.fillStyle = "#3f3b33";
        ctx.beginPath();
        ctx.ellipse(px + cellPx * 0.04, py + cellPx * 0.1, cellPx * 0.055, cellPx * 0.065, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#6d5a3e";
        ctx.fillRect(px + cellPx * 0.02, py + cellPx * 0.09, cellPx * 0.006, cellPx * 0.06);
    }
    if (use.quarry) {
        ctx.globalAlpha = 0.38;
        ctx.fillStyle = "#ada38f";
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.06, py + cellPx * 0.16);
        ctx.lineTo(px - cellPx * 0.01, py + cellPx * 0.08);
        ctx.lineTo(px + cellPx * 0.1, py + cellPx * 0.1);
        ctx.lineTo(px + cellPx * 0.07, py + cellPx * 0.16);
        ctx.closePath();
        ctx.fill();
    }
    if (use.aqueduct) {
        ctx.globalAlpha = 0.32;
        ctx.strokeStyle = "#9aa39a";
        ctx.lineWidth = Math.max(0.5, 0.7 * s);
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.18, py + cellPx * 0.12);
        ctx.lineTo(px + cellPx * 0.18, py + cellPx * 0.08);
        ctx.stroke();
    }
}

function drawFauna(ctx, px, py, cellPx, s, profile, tick) {
    const fauna = profile.fauna || [];
    if (!fauna.length || cellPx < 18) return;
    const time = Number(tick) || 0;
    ctx.globalAlpha = 0.36;
    for (let index = 0; index < Math.min(3, fauna.length); index++) {
        const entry = fauna[index];
        const x = px + (hash(index + 41, Math.floor(px + py)) - 0.5) * cellPx * 0.52;
        const y = py + cellPx * (0.06 + index * 0.028);
        const kind = entry.kind || entry.id;
        if (kind === "eagle" || kind === "vulture") {
            const flap = Math.sin(time * 0.003 + index) * 2.2 * s;
            ctx.strokeStyle = entry.id === "vulture" ? "#8a8273" : "#d8ddd2";
            ctx.lineWidth = Math.max(0.5, 0.65 * s);
            ctx.beginPath();
            ctx.moveTo(x - 4 * s, y);
            ctx.quadraticCurveTo(x - s, y - flap, x, y);
            ctx.quadraticCurveTo(x + s, y - flap, x + 4 * s, y);
            ctx.stroke();
        } else if (kind === "ptarmigan") {
            ctx.fillStyle = "#c8c1ad";
            ctx.beginPath();
            ctx.ellipse(x, y, 1.7 * s, 1.2 * s, 0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x + 1.3 * s, y - 0.9 * s, 0.7 * s, 0, Math.PI * 2);
            ctx.fill();
        } else if (entry.group === "goat") {
            // Ibex and chamois: low body, raised neck, back-swept horns.
            ctx.fillStyle = kind === "ibex" ? "#756b57" : "#5e5647";
            ctx.beginPath();
            ctx.ellipse(x, y, 2.1 * s, 0.85 * s, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(x + 1.8 * s, y - 1.1 * s, 0.65 * s, 0.9 * s, 0.25, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#d7cfb8";
            ctx.lineWidth = Math.max(0.35, 0.5 * s);
            ctx.beginPath();
            ctx.moveTo(x + 1.8 * s, y - 1.8 * s);
            ctx.quadraticCurveTo(x + 1.1 * s, y - 3 * s, x + 2.6 * s, y - 3.2 * s);
            ctx.moveTo(x + 1.8 * s, y - 1.8 * s);
            ctx.quadraticCurveTo(x + 2.5 * s, y - 2.8 * s, x + 1.2 * s, y - 3.2 * s);
            ctx.stroke();
            ctx.fillStyle = "#514b3f";
            ctx.fillRect(x - 1.4 * s, y + 0.4 * s, 0.5 * s, 1.3 * s);
            ctx.fillRect(x + 1 * s, y + 0.4 * s, 0.5 * s, 1.3 * s);
        } else if (kind === "marmot") {
            ctx.fillStyle = "#7c684d";
            ctx.beginPath();
            ctx.ellipse(x, y, 1.2 * s, 1.5 * s, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x + 0.5 * s, y - 1.3 * s, 0.62 * s, 0, Math.PI * 2);
            ctx.fill();
        } else if (entry.group === "predator") {
            const wolf = kind === "wolf";
            ctx.fillStyle = kind === "fox" ? "#a56d42" : wolf ? "#5b5b55" : "#7b6c50";
            ctx.beginPath();
            ctx.ellipse(x, y, 2.2 * s, 0.72 * s, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(x + 2 * s, y - 0.35 * s, 0.62 * s, 0.55 * s, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = Math.max(0.4, 0.55 * s);
            ctx.beginPath();
            ctx.moveTo(x - 2 * s, y);
            ctx.quadraticCurveTo(x - 3.2 * s, y - 0.7 * s, x - 2.8 * s, y - 1.6 * s);
            ctx.stroke();
            ctx.fillStyle = "#3f3d36";
            ctx.fillRect(x - 1.2 * s, y + 0.4 * s, 0.4 * s, 1.1 * s);
            ctx.fillRect(x + 1 * s, y + 0.4 * s, 0.4 * s, 1.1 * s);
        } else {
            // Voles and hares: small body, visible ears, no predator tail.
            ctx.fillStyle = kind === "hare" ? "#b7ab96" : "#8a8171";
            ctx.beginPath();
            ctx.ellipse(x, y, 0.9 * s, 0.65 * s, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(x + 0.5 * s, y - 0.8 * s, 0.28 * s, (kind === "hare" ? 1.1 : 0.55) * s, 0.2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

/** Ground and landform alone: safe on rock, snow and forest mountain tiles. */
export function drawMountainGround(ctx, px, py, cellPx, profile, s1 = 0.5, s2 = 0.5, s3 = 0.5) {
    if (!ctx || !profile?.mountain || !(cellPx > 0)) return;
    const s = cellPx / 48;
    const roll = clamp01((Number(s1) || 0) * 0.55 + (Number(s2) || 0) * 0.3 + (Number(s3) || 0) * 0.15);
    ctx.save();
    drawRockGround(ctx, px, py, cellPx, s, profile, roll);
    drawFormationRelief(ctx, px, py, cellPx, s, profile, roll);
    ctx.restore();
}

/** Works, water, alpine flora and fauna: open mountain pasture only. */
export function drawMountainDetails(ctx, px, py, cellPx, profile, s1 = 0.5, s2 = 0.5, s3 = 0.5, tick = 0, zoom = 1) {
    if (!ctx || !profile?.mountain || !(cellPx > 0)) return;
    const s = cellPx / 48;
    const roll = clamp01((Number(s1) || 0) * 0.55 + (Number(s2) || 0) * 0.3 + (Number(s3) || 0) * 0.15);
    const fineDetail = cellPx >= 24 && Number(zoom) >= 0.62;
    ctx.save();
    drawWorks(ctx, px, py, cellPx, s, profile, roll);
    drawWater(ctx, px, py, cellPx, s, profile, roll, tick);
    if (fineDetail) drawAlpineFlora(ctx, px, py, cellPx, s, profile, roll);
    if (fineDetail) drawFauna(ctx, px, py, cellPx, s, profile, tick);
    // A cold, bright snowfield reads differently from a shaded cliff; this is
    // a tiny local wash, not a second lighting pass.
    if (profile.visual?.lightMood === "snow-bright") {
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = "#f2f3e9";
        ctx.fillRect(px - cellPx * 0.2, py - cellPx * 0.04, cellPx * 0.4, cellPx * 0.2);
    } else if (profile.visual?.lightMood === "stone-shadow") {
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = "#384248";
        ctx.fillRect(px - cellPx * 0.2, py + cellPx * 0.02, cellPx * 0.4, cellPx * 0.14);
    }
    ctx.restore();
}

/** Draw one complete mountain tile with capped, deterministic detail. */
export function drawMountain(ctx, px, py, cellPx, profile, s1 = 0.5, s2 = 0.5, s3 = 0.5, tick = 0, zoom = 1) {
    drawMountainGround(ctx, px, py, cellPx, profile, s1, s2, s3);
    drawMountainDetails(ctx, px, py, cellPx, profile, s1, s2, s3, tick, zoom);
}

/** Draw one mountain tree: conifer spire or small broadleaf, capped. */
export function drawMountainTree(ctx, px, py, cellPx, tree, profile, roll = 0.5) {
    if (!ctx || !tree || !(cellPx > 0)) return;
    const s = cellPx / 48;
    const leaf = colour(tree.seasonColour, colour(profile?.visual?.grassHex, "#54704d"));
    const x = px + (Number(tree.offsetX) || 0) * cellPx;
    const y = py + (Number(tree.offsetY) || 0) * cellPx + 3 * s;
    const height = cellPx * (0.22 + (Number(tree.scale) || 0.8) * 0.15);
    const width = height * (tree.kind === "conifer" ? 0.32 : 0.4);
    ctx.save();
    ctx.globalAlpha = 0.74;
    ctx.strokeStyle = "#4a3d2d";
    ctx.lineWidth = Math.max(0.5, 0.8 * s);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - height * 0.62);
    ctx.stroke();
    ctx.fillStyle = leaf;
    if (tree.kind === "conifer") {
        const tiers = 4;
        for (let tier = 0; tier < tiers; tier++) {
            const t = tier / tiers;
            const tierY = y - height * (0.25 + t * 0.62);
            const tierWidth = width * (1 - t * 0.5);
            ctx.beginPath();
            ctx.moveTo(x - tierWidth, tierY);
            ctx.lineTo(x, tierY - height * 0.22);
            ctx.lineTo(x + tierWidth, tierY);
            ctx.closePath();
            ctx.fill();
        }
    } else {
        ctx.beginPath();
        ctx.ellipse(x, y - height * 0.66, width * 0.8, height * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    if (tree.snowy) {
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = "#e5e9e2";
        ctx.beginPath();
        ctx.ellipse(x, y - height * 0.8, width * 0.62, height * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
