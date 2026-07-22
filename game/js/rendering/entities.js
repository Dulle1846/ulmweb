// ── Entity Drawing ─────────────────────────────────────────────

import { TILE_SIZE } from '../config.js';
import { TYPE } from '../types.js';

// ── helpers ──

function outlinedRect(ctx, x, y, w, h, fill, outline = "#1a1208") {
    ctx.fillStyle = outline;
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
}

function outlinedCircle(ctx, x, y, r, fill, outline = "#1a1208") {
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
}

function drawFace(ctx, x, y, skin = "#f0c8a0", eyeColor = "#1a1208") {
    outlinedCircle(ctx, x, y, 8, skin);
    ctx.fillStyle = eyeColor;
    ctx.fillRect(x - 4, y - 2, 2.5, 3.5);
    ctx.fillRect(x + 2, y - 2, 2.5, 3.5);
    ctx.fillStyle = "rgba(230,120,110,0.4)";
    ctx.beginPath();
    ctx.arc(x - 5, y + 3, 2, 0, Math.PI * 2);
    ctx.arc(x + 5, y + 3, 2, 0, Math.PI * 2);
    ctx.fill();
}

// ── main draw function ──

export function drawEntity(ctx, e, tick) {
    if (e.dead) return;

    const px = e.x * TILE_SIZE + TILE_SIZE / 2;
    const py = e.y * TILE_SIZE + TILE_SIZE / 2;
    const bob = Math.sin(tick * 0.1 + e.anim) * 2.5;
    e.anim += 0.08;

    // shadow
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.ellipse(px + 3, py + 18 + bob * 0.3, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    switch (e.type) {
        case TYPE.KEEP:
            drawKeep(ctx, px, py, tick);
            break;
        case TYPE.HOUSE:
            drawHouse(ctx, px, py, tick);
            break;
        case TYPE.FARM:
            drawFarm(ctx, px, py, tick, e);
            break;
        case TYPE.LUMBER:
            drawLumber(ctx, px, py);
            break;
        case TYPE.QUARRY:
            drawQuarry(ctx, px, py);
            break;
        case TYPE.TOWER:
            drawTower(ctx, px, py);
            break;
        case TYPE.WALL:
            drawWall(ctx, px, py);
            break;
        case TYPE.TAVERN:
            drawTavern(ctx, px, py, tick);
            break;
        case TYPE.TEMPLE:
            drawTemple(ctx, px, py, tick);
            break;
        case TYPE.BARRACKS:
            drawBarracks(ctx, px, py);
            break;
        case TYPE.MILL:
            drawMill(ctx, px, py, tick);
            break;
        case TYPE.STABLE:
            drawStable(ctx, px, py);
            break;
        case TYPE.VILLAGER:
            drawVillager(ctx, px, py, bob, tick, e);
            break;
        case TYPE.GUARD:
            drawGuard(ctx, px, py);
            break;
        case TYPE.ARCHER:
            drawArcher(ctx, px, py);
            break;
        case TYPE.KNIGHT:
            drawKnight(ctx, px, py);
            break;
        case TYPE.PRIEST:
            drawPriest(ctx, px, py, tick);
            break;
        case TYPE.GOBLIN:
            drawGoblin(ctx, px, py, tick, e);
            break;
        case TYPE.ORC:
            drawOrc(ctx, px, py, tick, e);
            break;
        case TYPE.TROLL:
            drawTroll(ctx, px, py, tick, e);
            break;
        case TYPE.DEER:
            drawDeer(ctx, px, py, tick, e);
            break;
    }

    // health bar
    if (e.hp < e.maxHp && e.hp > 0) {
        const pct = e.hp / e.maxHp;
        ctx.fillStyle = "black";
        ctx.fillRect(px - 18, py - 32, 36, 5);
        ctx.fillStyle = pct > 0.4 ? "#22cc44" : "#ee2222";
        ctx.fillRect(px - 17, py - 31, 34 * pct, 3);
    }
}

// ── individual draw functions ──

function drawKeep(ctx, px, py, tick) {
    outlinedRect(ctx, px - 34, py - 36, 68, 52, "#8a8578");
    ctx.fillStyle = "#767162";
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
            if ((r + c) % 2 === 0) ctx.fillRect(px - 30 + c * 16, py - 30 + r * 15, 13, 11);
        }
    }
    ctx.fillStyle = "#6e695c";
    for (let i = 0; i < 5; i++) {
        ctx.fillRect(px - 34 + i * 15, py - 46, 10, 12);
    }
    outlinedRect(ctx, px - 12, py - 62, 24, 28, "#9a9587");
    ctx.fillStyle = "#6e695c";
    ctx.fillRect(px - 12, py - 68, 7, 8);
    ctx.fillRect(px + 5, py - 68, 7, 8);
    ctx.fillStyle = "#2a1f14";
    ctx.beginPath();
    ctx.arc(px, py + 6, 11, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(px - 11, py + 6, 22, 10);
    ctx.strokeStyle = "#4a3826";
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(px + i * 6, py - 2);
        ctx.lineTo(px + i * 6, py + 16);
        ctx.stroke();
    }
    const flagWave = Math.sin(tick * 0.15) * 3;
    ctx.fillStyle = "#8a7a6a";
    ctx.fillRect(px - 1, py - 84, 3, 24);
    ctx.fillStyle = "#d92626";
    ctx.beginPath();
    ctx.moveTo(px + 2, py - 84);
    ctx.lineTo(px + 24, py - 80 + flagWave);
    ctx.lineTo(px + 2, py - 72);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(px + 9, py - 78 + flagWave * 0.4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffdf80";
    ctx.fillRect(px - 6, py - 54, 5, 7);
    ctx.fillRect(px + 2, py - 54, 5, 7);
}

function drawHouse(ctx, px, py, tick) {
    outlinedRect(ctx, px - 19, py - 12, 38, 28, "#e8d5b0");
    ctx.fillStyle = "#6b4a2e";
    ctx.fillRect(px - 19, py - 12, 38, 3);
    ctx.fillRect(px - 19, py + 13, 38, 3);
    ctx.fillRect(px - 2, py - 12, 4, 28);
    ctx.fillStyle = "#1a1208";
    ctx.beginPath();
    ctx.moveTo(px - 27, py - 10);
    ctx.lineTo(px, py - 38);
    ctx.lineTo(px + 27, py - 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#b5432e";
    ctx.beginPath();
    ctx.moveTo(px - 23, py - 12);
    ctx.lineTo(px, py - 34);
    ctx.lineTo(px + 23, py - 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d15a42";
    ctx.beginPath();
    ctx.moveTo(px - 16, py - 14);
    ctx.lineTo(px - 2, py - 29);
    ctx.lineTo(px + 4, py - 26);
    ctx.lineTo(px - 10, py - 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#5d4028";
    ctx.fillRect(px - 14, py + 2, 9, 14);
    ctx.fillStyle = "#f2c744";
    ctx.beginPath();
    ctx.arc(px - 7.5, py + 9, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a3826";
    ctx.fillRect(px + 4, py - 4, 11, 10);
    ctx.fillStyle = "#ffd77a";
    ctx.fillRect(px + 5.5, py - 2.5, 8, 7);
    ctx.strokeStyle = "#4a3826";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + 9.5, py - 3);
    ctx.lineTo(px + 9.5, py + 5);
    ctx.stroke();
    ctx.fillStyle = "#7d7264";
    ctx.fillRect(px + 10, py - 32, 7, 12);
    const puff = (tick * 0.5) % 30;
    ctx.fillStyle = `rgba(220,220,220,${0.5 - puff / 70})`;
    ctx.beginPath();
    ctx.arc(px + 13 + puff * 0.15, py - 36 - puff * 0.6, 3.5 + puff * 0.12, 0, Math.PI * 2);
    ctx.fill();
}

function drawFarm(ctx, px, py, tick, e) {
    outlinedRect(ctx, px - 23, py - 14, 46, 32, "#6e4f30");
    ctx.fillStyle = "#5a3f25";
    for (let i = 0; i < 4; i++) {
        ctx.fillRect(px - 21, py - 10 + i * 7, 42, 3);
    }
    const wheatSway = Math.sin(tick * 0.06 + e.anim) * 1.5;
    for (let i = -2; i <= 2; i++) {
        ctx.strokeStyle = "#c9a83c";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(px + i * 9, py + 14);
        ctx.quadraticCurveTo(px + i * 9 + wheatSway, py - 2, px + i * 9 + wheatSway * 1.6, py - 16);
        ctx.stroke();
        ctx.fillStyle = "#f2d264";
        ctx.beginPath();
        ctx.ellipse(px + i * 9 + wheatSway * 1.6, py - 19, 3, 6, wheatSway * 0.1, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = "#5d4028";
    ctx.fillRect(px + 17, py - 22, 2.5, 20);
    ctx.fillRect(px + 11, py - 17, 15, 2.5);
    ctx.fillStyle = "#e0a33c";
    ctx.beginPath();
    ctx.arc(px + 18, py - 25, 4, 0, Math.PI * 2);
    ctx.fill();
}

function drawLumber(ctx, px, py) {
    outlinedRect(ctx, px - 18, py - 8, 36, 26, "#7a5230");
    ctx.strokeStyle = "#5d4028";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(px - 18, py - 2 + i * 8);
        ctx.lineTo(px + 18, py - 2 + i * 8);
        ctx.stroke();
    }
    ctx.fillStyle = "#4a5d3a";
    ctx.beginPath();
    ctx.moveTo(px - 22, py - 6);
    ctx.lineTo(px, py - 22);
    ctx.lineTo(px + 22, py - 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#8a6238";
    ctx.beginPath();
    ctx.arc(px - 26, py + 12, 5, 0, Math.PI * 2);
    ctx.arc(px - 26, py + 3, 5, 0, Math.PI * 2);
    ctx.arc(px - 32, py + 8, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d9b380";
    ctx.beginPath();
    ctx.arc(px - 26, py + 12, 2.5, 0, Math.PI * 2);
    ctx.arc(px - 26, py + 3, 2.5, 0, Math.PI * 2);
    ctx.arc(px - 32, py + 8, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6e4f30";
    ctx.fillRect(px + 22, py + 6, 10, 10);
    ctx.strokeStyle = "#8a8578";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px + 27, py + 8);
    ctx.lineTo(px + 33, py - 2);
    ctx.stroke();
}

function drawQuarry(ctx, px, py) {
    outlinedRect(ctx, px - 22, py - 10, 44, 28, "#5f5b52");
    ctx.fillStyle = "#4a463e";
    ctx.beginPath();
    ctx.ellipse(px, py + 4, 16, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2e2b26";
    ctx.beginPath();
    ctx.ellipse(px, py + 4, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#5d4028";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px - 14, py - 8);
    ctx.lineTo(px - 4, py - 26);
    ctx.lineTo(px + 10, py - 20);
    ctx.stroke();
    ctx.strokeStyle = "#8a7a5a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + 10, py - 20);
    ctx.lineTo(px + 10, py - 4);
    ctx.stroke();
    ctx.fillStyle = "#6e5a3a";
    ctx.fillRect(px + 6, py - 4, 8, 6);
    ctx.fillStyle = "#8a867c";
    ctx.beginPath();
    ctx.arc(px - 16, py + 12, 4, 0, Math.PI * 2);
    ctx.arc(px - 10, py + 14, 3.5, 0, Math.PI * 2);
    ctx.fill();
}

function drawTower(ctx, px, py) {
    ctx.fillStyle = "#1a1208";
    ctx.fillRect(px - 15, py - 44, 30, 60);
    ctx.fillStyle = "#8a8578";
    ctx.fillRect(px - 13, py - 42, 26, 56);
    ctx.fillStyle = "#767162";
    for (let r = 0; r < 5; r++) {
        ctx.fillRect(px - 13 + (r % 2) * 7, py - 38 + r * 10, 12, 7);
    }
    outlinedRect(ctx, px - 19, py - 52, 38, 12, "#6e695c");
    ctx.fillStyle = "#6e695c";
    ctx.fillRect(px - 19, py - 58, 8, 8);
    ctx.fillRect(px - 4, py - 58, 8, 8);
    ctx.fillRect(px + 11, py - 58, 8, 8);
    ctx.fillStyle = "#1a1208";
    ctx.fillRect(px - 2, py - 30, 4, 12);
    ctx.fillStyle = "#3a4a2e";
    ctx.fillRect(px - 4, py - 66, 8, 9);
    ctx.beginPath();
    ctx.arc(px, py - 68, 3.5, 0, Math.PI * 2);
    ctx.fill();
}

function drawWall(ctx, px, py) {
    outlinedRect(ctx, px - 22, py - 16, 44, 34, "#8a8578");
    ctx.strokeStyle = "#6e695c";
    ctx.lineWidth = 2;
    for (let r = 0; r < 3; r++) {
        ctx.beginPath();
        ctx.moveTo(px - 22, py - 6 + r * 10);
        ctx.lineTo(px + 22, py - 6 + r * 10);
        ctx.stroke();
        for (let c = 0; c < 3; c++) {
            ctx.beginPath();
            ctx.moveTo(px - 14 + c * 14 + (r % 2) * 7, py - 16 + r * 10);
            ctx.lineTo(px - 14 + c * 14 + (r % 2) * 7, py - 6 + r * 10);
            ctx.stroke();
        }
    }
    ctx.fillStyle = "#6e695c";
    for (let i = 0; i < 4; i++) {
        ctx.fillRect(px - 22 + i * 12, py - 24, 8, 9);
    }
}

function drawTavern(ctx, px, py, tick) {
    outlinedRect(ctx, px - 21, py - 16, 42, 32, "#a3764a");
    ctx.fillStyle = "#8a5f38";
    ctx.fillRect(px - 21, py - 16, 42, 14);
    ctx.fillStyle = "#1a1208";
    ctx.beginPath();
    ctx.moveTo(px - 28, py - 14);
    ctx.lineTo(px, py - 40);
    ctx.lineTo(px + 28, py - 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#5a4632";
    ctx.beginPath();
    ctx.moveTo(px - 24, py - 16);
    ctx.lineTo(px, py - 36);
    ctx.lineTo(px + 24, py - 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffd77a";
    ctx.fillRect(px - 15, py - 12, 8, 7);
    ctx.fillRect(px + 7, py - 12, 8, 7);
    ctx.fillRect(px - 15, py + 2, 8, 8);
    ctx.fillStyle = "#3d2c1a";
    ctx.fillRect(px + 4, py + 2, 11, 14);
    ctx.strokeStyle = "#4a3826";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + 21, py - 18);
    ctx.lineTo(px + 30, py - 18);
    ctx.stroke();
    const signSway = Math.sin(tick * 0.1) * 2;
    ctx.fillStyle = "#e0a33c";
    ctx.fillRect(px + 26 + signSway, py - 16, 8, 9);
    ctx.fillStyle = "#fff";
    ctx.fillRect(px + 27 + signSway, py - 15, 6, 2.5);
}

function drawTemple(ctx, px, py, tick) {
    outlinedRect(ctx, px - 22, py - 14, 44, 30, "#e8e2d2");
    ctx.fillStyle = "#c9c2b0";
    for (let i = 0; i < 4; i++) {
        ctx.fillRect(px - 18 + i * 11, py - 12, 5, 26);
    }
    ctx.fillStyle = "#1a1208";
    ctx.beginPath();
    ctx.moveTo(px - 28, py - 12);
    ctx.lineTo(px, py - 34);
    ctx.lineTo(px + 28, py - 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d9d2c0";
    ctx.beginPath();
    ctx.moveTo(px - 24, py - 14);
    ctx.lineTo(px, py - 31);
    ctx.lineTo(px + 24, py - 14);
    ctx.closePath();
    ctx.fill();
    const glow = 0.5 + Math.sin(tick * 0.08) * 0.3;
    ctx.fillStyle = `rgba(250, 204, 21, ${glow})`;
    ctx.beginPath();
    ctx.arc(px, py - 22, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2c744";
    ctx.beginPath();
    ctx.arc(px, py - 22, 4, 0, Math.PI * 2);
    ctx.fill();
}

function drawBarracks(ctx, px, py) {
    outlinedRect(ctx, px - 24, py - 12, 48, 30, "#6e5a48");
    ctx.fillStyle = "#5a4a3c";
    ctx.fillRect(px - 24, py - 12, 48, 6);
    ctx.fillStyle = "#4a3e32";
    for (let i = 0; i < 5; i++) {
        ctx.fillRect(px - 24 + i * 11, py - 19, 7, 8);
    }
    ctx.fillStyle = "#8a2e2e";
    ctx.fillRect(px - 4, py - 10, 8, 16);
    ctx.fillStyle = "#f2c744";
    ctx.beginPath();
    ctx.arc(px, py - 4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#b8b2a4";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(px - 16, py + 2);
    ctx.lineTo(px - 8, py + 12);
    ctx.moveTo(px - 8, py + 2);
    ctx.lineTo(px - 16, py + 12);
    ctx.stroke();
    ctx.fillStyle = "#2e2318";
    ctx.fillRect(px + 8, py + 2, 12, 16);
}

function drawMill(ctx, px, py, tick) {
    outlinedRect(ctx, px - 14, py - 16, 28, 32, "#c9b28a");
    ctx.fillStyle = "#a8916c";
    ctx.fillRect(px - 14, py - 16, 28, 8);
    ctx.fillStyle = "#8a5f38";
    ctx.beginPath();
    ctx.moveTo(px - 18, py - 14);
    ctx.lineTo(px, py - 30);
    ctx.lineTo(px + 18, py - 14);
    ctx.closePath();
    ctx.fill();
    const angle = tick * 0.04;
    ctx.save();
    ctx.translate(px, py - 18);
    ctx.rotate(angle);
    ctx.fillStyle = "#e8dcc0";
    ctx.strokeStyle = "#5d4028";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.fillRect(-3, 0, 6, 26);
        ctx.strokeRect(-3, 0, 6, 26);
    }
    ctx.restore();
    outlinedCircle(ctx, px, py - 18, 4, "#5d4028");
    ctx.fillStyle = "#4a3826";
    ctx.fillRect(px - 5, py + 4, 10, 12);
}

function drawStable(ctx, px, py) {
    outlinedRect(ctx, px - 22, py - 10, 44, 26, "#9c2e2e");
    ctx.strokeStyle = "#e8e2d2";
    ctx.lineWidth = 3;
    ctx.strokeRect(px - 18, py - 6, 16, 18);
    ctx.beginPath();
    ctx.moveTo(px - 18, py - 6);
    ctx.lineTo(px - 2, py + 12);
    ctx.moveTo(px - 2, py - 6);
    ctx.lineTo(px - 18, py + 12);
    ctx.stroke();
    ctx.fillStyle = "#5a4632";
    ctx.beginPath();
    ctx.moveTo(px - 27, py - 8);
    ctx.lineTo(px, py - 28);
    ctx.lineTo(px + 27, py - 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#7a5a3a";
    ctx.beginPath();
    ctx.ellipse(px + 11, py + 2, 6, 8, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5a4028";
    ctx.beginPath();
    ctx.moveTo(px + 7, py - 5);
    ctx.lineTo(px + 9, py - 10);
    ctx.lineTo(px + 11, py - 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#1a1208";
    ctx.beginPath();
    ctx.arc(px + 13, py, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e0c050";
    ctx.fillRect(px + 20, py + 8, 10, 8);
    ctx.strokeStyle = "#b89a30";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 21.5, py + 9.5, 7, 5);
}

function drawVillager(ctx, px, py, bob, tick, e) {
    const shirtColors = ["#3b6db3", "#c23c2c", "#d4a23c", "#6a9948"];
    const shirt = shirtColors[e.tint % shirtColors.length];
    const step = Math.sin(tick * 0.18 + e.anim) * (e.state === "walk" ? 3 : 0);

    ctx.fillStyle = "#4a3826";
    ctx.fillRect(px - 6, py + 8 + bob, 4.5, 9 + step * 0.5);
    ctx.fillRect(px + 2, py + 8 + bob, 4.5, 9 - step * 0.5);
    outlinedRect(ctx, px - 8, py - 4 + bob, 16, 15, shirt);
    ctx.fillStyle = "#5d4028";
    ctx.fillRect(px - 8, py + 7 + bob, 16, 3);
    ctx.fillStyle = shirt;
    ctx.fillRect(px - 12, py - 2 + bob, 4, 10);
    ctx.fillRect(px + 8, py - 2 + bob, 4, 10);
    drawFace(ctx, px, py - 14 + bob);
    ctx.fillStyle = ["#4a3220", "#2a2a2a", "#8a5a2a", "#6e4f30"][e.tint % 4];
    ctx.beginPath();
    ctx.arc(px, py - 17 + bob, 8, Math.PI, 0);
    ctx.fill();
}

function drawGuard(ctx, px, py) {
    ctx.fillStyle = "#2a2a3a";
    ctx.fillRect(px - 6, py + 10, 5, 8);
    ctx.fillRect(px + 2, py + 10, 5, 8);
    outlinedRect(ctx, px - 10, py - 6, 20, 18, "#5a6a8a");
    ctx.fillStyle = "#7a8aaa";
    ctx.fillRect(px - 7, py - 3, 6, 10);
    drawFace(ctx, px, py - 16);
    ctx.fillStyle = "#1a1208";
    ctx.beginPath();
    ctx.arc(px, py - 18, 10.5, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#8a95a8";
    ctx.beginPath();
    ctx.arc(px, py - 18, 8.5, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(px - 8.5, py - 18, 17, 3.5);
    ctx.fillStyle = "#c23c2c";
    ctx.fillRect(px - 1.5, py - 30, 3, 6);
    ctx.strokeStyle = "#6e4f30";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(px + 13, py + 12);
    ctx.lineTo(px + 13, py - 26);
    ctx.stroke();
    ctx.fillStyle = "#b8b2a4";
    ctx.beginPath();
    ctx.moveTo(px + 10, py - 25);
    ctx.lineTo(px + 13, py - 34);
    ctx.lineTo(px + 16, py - 25);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#8a5f38";
    ctx.beginPath();
    ctx.arc(px - 13, py + 2, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#b8934a";
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawArcher(ctx, px, py) {
    ctx.fillStyle = "#3d2c1a";
    ctx.fillRect(px - 6, py + 8, 5, 9);
    ctx.fillRect(px + 2, py + 8, 5, 9);
    outlinedRect(ctx, px - 9, py - 5, 18, 15, "#4a7a3a");
    ctx.strokeStyle = "#5d4028";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(px - 8, py - 4);
    ctx.lineTo(px + 8, py + 8);
    ctx.stroke();
    drawFace(ctx, px, py - 15);
    ctx.fillStyle = "#3a5f2e";
    ctx.beginPath();
    ctx.arc(px, py - 17, 9, Math.PI * 0.9, Math.PI * 0.1);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px - 9, py - 16);
    ctx.lineTo(px, py - 30);
    ctx.lineTo(px + 9, py - 16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#8a5f38";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(px + 13, py - 4, 11, -Math.PI * 0.45, Math.PI * 0.45);
    ctx.stroke();
    ctx.strokeStyle = "#d9d2c0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 13, py - 14);
    ctx.lineTo(px + 13, py + 6);
    ctx.stroke();
    ctx.fillStyle = "#6e4f30";
    ctx.fillRect(px - 15, py - 10, 6, 14);
    ctx.strokeStyle = "#e0c050";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px - 13, py - 10);
    ctx.lineTo(px - 11, py - 15);
    ctx.moveTo(px - 10, py - 10);
    ctx.lineTo(px - 9, py - 14);
    ctx.stroke();
}

function drawKnight(ctx, px, py) {
    ctx.fillStyle = "#5a6578";
    ctx.fillRect(px - 7, py + 10, 6, 9);
    ctx.fillRect(px + 2, py + 10, 6, 9);
    outlinedRect(ctx, px - 12, py - 8, 24, 20, "#7a8598");
    ctx.fillStyle = "#c9a83c";
    ctx.fillRect(px - 12, py - 8, 24, 3);
    ctx.fillRect(px - 2, py - 8, 4, 20);
    outlinedCircle(ctx, px - 13, py - 6, 5, "#8a95a8");
    outlinedCircle(ctx, px + 13, py - 6, 5, "#8a95a8");
    ctx.fillStyle = "#1a1208";
    ctx.fillRect(px - 9, py - 30, 18, 18);
    ctx.fillStyle = "#95a0b5";
    ctx.fillRect(px - 7.5, py - 28.5, 15, 15);
    ctx.fillStyle = "#1a1208";
    ctx.fillRect(px - 6, py - 23, 12, 2.5);
    ctx.fillStyle = "#f2c744";
    ctx.beginPath();
    ctx.moveTo(px - 8, py - 30);
    ctx.lineTo(px - 8, py - 36);
    ctx.lineTo(px - 4, py - 31);
    ctx.lineTo(px, py - 37);
    ctx.lineTo(px + 4, py - 31);
    ctx.lineTo(px + 8, py - 36);
    ctx.lineTo(px + 8, py - 30);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#d9d2c0";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(px + 16, py + 6);
    ctx.lineTo(px + 24, py - 18);
    ctx.stroke();
    ctx.strokeStyle = "#c9a83c";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(px + 14, py + 1);
    ctx.lineTo(px + 22, py + 5);
    ctx.stroke();
    ctx.fillStyle = "#a82828";
    ctx.beginPath();
    ctx.moveTo(px - 12, py - 6);
    ctx.quadraticCurveTo(px - 22, py + 4, px - 16, py + 14);
    ctx.lineTo(px - 12, py + 10);
    ctx.closePath();
    ctx.fill();
}

function drawPriest(ctx, px, py, tick) {
    ctx.fillStyle = "#1a1208";
    ctx.beginPath();
    ctx.moveTo(px - 12, py + 18);
    ctx.lineTo(px - 9, py - 10);
    ctx.lineTo(px + 9, py - 10);
    ctx.lineTo(px + 12, py + 18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#e8e2d2";
    ctx.beginPath();
    ctx.moveTo(px - 10, py + 16);
    ctx.lineTo(px - 7.5, py - 8);
    ctx.lineTo(px + 7.5, py - 8);
    ctx.lineTo(px + 10, py + 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#c9a83c";
    ctx.fillRect(px - 6, py - 8, 3, 20);
    ctx.fillRect(px + 3, py - 8, 3, 20);
    drawFace(ctx, px, py - 16);
    ctx.strokeStyle = "#8a7a5a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px, py - 17, 8, Math.PI * 0.85, Math.PI * 0.15);
    ctx.stroke();
    ctx.strokeStyle = "#8a6238";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(px + 13, py + 14);
    ctx.lineTo(px + 13, py - 22);
    ctx.stroke();
    const holyGlow = 0.4 + Math.sin(tick * 0.1) * 0.25;
    ctx.fillStyle = `rgba(250, 220, 100, ${holyGlow})`;
    ctx.beginPath();
    ctx.arc(px + 13, py - 25, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2c744";
    ctx.beginPath();
    ctx.arc(px + 13, py - 25, 3.5, 0, Math.PI * 2);
    ctx.fill();
}

function drawGoblin(ctx, px, py, tick, e) {
    const hop = Math.abs(Math.sin(tick * 0.25 + e.anim)) * 4;
    outlinedRect(ctx, px - 9, py - 2 - hop, 18, 14, "#5a8a3a");
    ctx.fillStyle = "#6e5a3a";
    ctx.beginPath();
    ctx.moveTo(px - 8, py + 10 - hop);
    ctx.lineTo(px - 4, py + 15 - hop);
    ctx.lineTo(px, py + 10 - hop);
    ctx.lineTo(px + 4, py + 15 - hop);
    ctx.lineTo(px + 8, py + 10 - hop);
    ctx.closePath();
    ctx.fill();
    outlinedCircle(ctx, px, py - 13 - hop, 10, "#6ea847");
    ctx.fillStyle = "#1a1208";
    ctx.beginPath();
    ctx.moveTo(px - 9, py - 15 - hop);
    ctx.lineTo(px - 20, py - 22 - hop);
    ctx.lineTo(px - 8, py - 10 - hop);
    ctx.closePath();
    ctx.moveTo(px + 9, py - 15 - hop);
    ctx.lineTo(px + 20, py - 22 - hop);
    ctx.lineTo(px + 8, py - 10 - hop);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#6ea847";
    ctx.beginPath();
    ctx.moveTo(px - 8, py - 15 - hop);
    ctx.lineTo(px - 17, py - 20 - hop);
    ctx.lineTo(px - 7, py - 11 - hop);
    ctx.closePath();
    ctx.moveTo(px + 8, py - 15 - hop);
    ctx.lineTo(px + 17, py - 20 - hop);
    ctx.lineTo(px + 7, py - 11 - hop);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(px - 4, py - 14 - hop, 3, 0, Math.PI * 2);
    ctx.arc(px + 4, py - 14 - hop, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d92626";
    ctx.beginPath();
    ctx.arc(px - 4, py - 14 - hop, 1.5, 0, Math.PI * 2);
    ctx.arc(px + 4, py - 14 - hop, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1208";
    ctx.fillRect(px - 5, py - 8 - hop, 10, 3);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(px - 4, py - 8 - hop);
    ctx.lineTo(px - 2.5, py - 5.5 - hop);
    ctx.lineTo(px - 1, py - 8 - hop);
    ctx.moveTo(px + 1, py - 8 - hop);
    ctx.lineTo(px + 2.5, py - 5.5 - hop);
    ctx.lineTo(px + 4, py - 8 - hop);
    ctx.fill();
    ctx.strokeStyle = "#8a867c";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(px + 11, py + 2 - hop);
    ctx.lineTo(px + 18, py - 8 - hop);
    ctx.stroke();
}

function drawOrc(ctx, px, py, tick, e) {
    const stomp = Math.abs(Math.sin(tick * 0.15 + e.anim)) * 2;
    outlinedRect(ctx, px - 15, py - 10 - stomp, 30, 26, "#4a6b35");
    ctx.fillStyle = "#3d5a2c";
    ctx.fillRect(px - 2, py - 10 - stomp, 4, 26);
    ctx.fillRect(px - 12, py - 4 - stomp, 8, 5);
    ctx.fillRect(px + 4, py - 4 - stomp, 8, 5);
    ctx.fillStyle = "#4a4038";
    ctx.beginPath();
    ctx.moveTo(px - 18, py - 10 - stomp);
    ctx.lineTo(px - 14, py - 20 - stomp);
    ctx.lineTo(px - 8, py - 10 - stomp);
    ctx.closePath();
    ctx.fill();
    outlinedCircle(ctx, px, py - 20 - stomp, 11, "#5a7a42");
    ctx.fillStyle = "#3d5a2c";
    ctx.fillRect(px - 9, py - 27 - stomp, 18, 4);
    ctx.fillStyle = "#f2d264";
    ctx.beginPath();
    ctx.arc(px - 5, py - 21 - stomp, 2.5, 0, Math.PI * 2);
    ctx.arc(px + 5, py - 21 - stomp, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1208";
    ctx.beginPath();
    ctx.arc(px - 5, py - 21 - stomp, 1, 0, Math.PI * 2);
    ctx.arc(px + 5, py - 21 - stomp, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8e2d2";
    ctx.beginPath();
    ctx.moveTo(px - 7, py - 13 - stomp);
    ctx.lineTo(px - 6, py - 19 - stomp);
    ctx.lineTo(px - 3, py - 13 - stomp);
    ctx.closePath();
    ctx.moveTo(px + 7, py - 13 - stomp);
    ctx.lineTo(px + 6, py - 19 - stomp);
    ctx.lineTo(px + 3, py - 13 - stomp);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#5d4028";
    ctx.save();
    ctx.translate(px + 17, py - 4 - stomp);
    ctx.rotate(-0.5);
    ctx.fillRect(-3, -22, 6, 26);
    ctx.beginPath();
    ctx.arc(0, -22, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8a867c";
    ctx.beginPath();
    ctx.arc(-5, -25, 2, 0, Math.PI * 2);
    ctx.arc(4, -27, 2, 0, Math.PI * 2);
    ctx.arc(2, -17, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawTroll(ctx, px, py, tick, e) {
    const breathe = Math.sin(tick * 0.08 + e.anim) * 2;
    outlinedRect(ctx, px - 24, py - 18 - breathe, 48, 36, "#5a6b4a");
    ctx.fillStyle = "#6e8058";
    ctx.beginPath();
    ctx.ellipse(px, py + 2 - breathe, 16, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    outlinedCircle(ctx, px, py - 28 - breathe, 12, "#6a7d55");
    ctx.fillStyle = "#1a1208";
    ctx.fillRect(px - 8, py - 33 - breathe, 6, 3);
    ctx.fillRect(px + 2, py - 33 - breathe, 6, 3);
    ctx.fillStyle = "#f2d264";
    ctx.beginPath();
    ctx.arc(px - 5, py - 29 - breathe, 2, 0, Math.PI * 2);
    ctx.arc(px + 5, py - 29 - breathe, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#55684a";
    ctx.fillRect(px - 9, py - 22 - breathe, 18, 6);
    ctx.fillStyle = "#e8e2d2";
    ctx.beginPath();
    ctx.moveTo(px - 7, py - 22 - breathe);
    ctx.lineTo(px - 5, py - 27 - breathe);
    ctx.lineTo(px - 3, py - 22 - breathe);
    ctx.moveTo(px + 3, py - 22 - breathe);
    ctx.lineTo(px + 5, py - 27 - breathe);
    ctx.lineTo(px + 7, py - 22 - breathe);
    ctx.fill();
    ctx.fillStyle = "#5a6b4a";
    ctx.fillRect(px - 32, py - 14 - breathe, 9, 28);
    ctx.fillRect(px + 23, py - 14 - breathe, 9, 28);
    outlinedCircle(ctx, px - 28, py + 15, 6, "#6a7d55");
    outlinedCircle(ctx, px + 28, py + 15, 6, "#6a7d55");
    ctx.fillStyle = "#3f6b3f";
    ctx.beginPath();
    ctx.arc(px - 18, py - 18 - breathe, 4, 0, Math.PI * 2);
    ctx.arc(px + 14, py - 19 - breathe, 3, 0, Math.PI * 2);
    ctx.fill();
}

function drawDeer(ctx, px, py, tick, e) {
    const graze = Math.sin(tick * 0.05 + e.anim) > 0.6;

    outlinedRect(ctx, px - 13, py - 6, 26, 13, "#9c7a4e");
    ctx.fillStyle = "#d9c9a8";
    ctx.fillRect(px - 10, py + 3, 20, 4);
    ctx.fillStyle = "#7a5f3c";
    ctx.fillRect(px - 11, py + 7, 3, 10);
    ctx.fillRect(px - 4, py + 7, 3, 10);
    ctx.fillRect(px + 3, py + 7, 3, 10);
    ctx.fillRect(px + 9, py + 7, 3, 10);

    const headY = graze ? py + 2 : py - 16;
    ctx.fillStyle = "#9c7a4e";
    ctx.beginPath();
    ctx.moveTo(px + 9, py - 4);
    ctx.lineTo(px + 16, headY);
    ctx.lineTo(px + 20, headY + 2);
    ctx.lineTo(px + 13, py - 1);
    ctx.closePath();
    ctx.fill();
    outlinedCircle(ctx, px + 18, headY, 5, "#a8865a");
    ctx.fillStyle = "#1a1208";
    ctx.beginPath();
    ctx.arc(px + 19, headY - 1, 1.3, 0, Math.PI * 2);
    ctx.fill();
    if (!graze) {
        ctx.strokeStyle = "#6e5a3a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px + 16, headY - 4);
        ctx.lineTo(px + 13, headY - 12);
        ctx.moveTo(px + 14.5, headY - 8);
        ctx.lineTo(px + 11, headY - 11);
        ctx.moveTo(px + 20, headY - 4);
        ctx.lineTo(px + 22, headY - 12);
        ctx.stroke();
    }
    ctx.fillStyle = "#e8e2d2";
    ctx.beginPath();
    ctx.arc(px - 13, py - 3, 3, 0, Math.PI * 2);
    ctx.fill();
}
