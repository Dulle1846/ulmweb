// ── Terrain Drawing ────────────────────────────────────────────

import { TILE_SIZE } from '../config.js';

export function drawTerrain(ctx, x, y, tile, tick) {
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;

    // deterministic per-tile seed
    const seed = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    const s1 = (seed % 100) / 100;
    const s2 = ((seed >> 4) % 100) / 100;

    if (tile.terrain === "water") {
        ctx.fillStyle = "#1a5276";
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        const waveOff = Math.sin(tick * 0.08 + x * 1.3 + y * 0.7) * 4;
        ctx.fillStyle = "#2980b9";
        ctx.fillRect(px + 4, py + 12 + waveOff, TILE_SIZE - 12, 4);
        ctx.fillStyle = "rgba(174, 214, 241, 0.35)";
        ctx.fillRect(px + 10, py + 28 - waveOff, TILE_SIZE - 22, 3);
        return;
    }

    // grass base
    const grassShades = ["#3e7c3e", "#478a47", "#3a743a"];
    ctx.fillStyle = grassShades[(x + y * 3) % 3];
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

    if ((x + y) % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.03)";
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }

    if (tile.terrain === "forest") {
        const tx2 = px + TILE_SIZE / 2;
        const ty2 = py + TILE_SIZE / 2;
        const sway = Math.sin(tick * 0.05 + x * 0.9 + y * 1.4) * 1.5;

        ctx.fillStyle = "#5d4028";
        ctx.fillRect(tx2 - 4, ty2 + 2, 8, 16);
        ctx.fillStyle = "#4a3220";
        ctx.fillRect(tx2 - 4, ty2 + 2, 3, 16);

        ctx.fillStyle = "#1e4620";
        ctx.beginPath();
        ctx.arc(tx2 + sway, ty2 - 4, 19, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#2d6b30";
        ctx.beginPath();
        ctx.arc(tx2 + sway, ty2 - 4, 16, 0, Math.PI * 2);
        ctx.arc(tx2 - 9 + sway, ty2 + 2, 11, 0, Math.PI * 2);
        ctx.arc(tx2 + 9 + sway, ty2 + 2, 11, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#4a9e4e";
        ctx.beginPath();
        ctx.arc(tx2 - 5 + sway, ty2 - 10, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#65c46a";
        ctx.beginPath();
        ctx.arc(tx2 - 7 + sway, ty2 - 12, 4, 0, Math.PI * 2);
        ctx.fill();
    } else if (tile.terrain === "rock") {
        const rx = px + TILE_SIZE / 2;
        const ry = py + TILE_SIZE / 2;

        ctx.fillStyle = "#3d3d3d";
        ctx.beginPath();
        ctx.moveTo(rx - 16, ry + 14);
        ctx.lineTo(rx - 12, ry - 6);
        ctx.lineTo(rx - 2, ry - 14);
        ctx.lineTo(rx + 12, ry - 8);
        ctx.lineTo(rx + 16, ry + 14);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#6e6e6e";
        ctx.beginPath();
        ctx.moveTo(rx - 12, ry + 12);
        ctx.lineTo(rx - 9, ry - 4);
        ctx.lineTo(rx - 1, ry - 11);
        ctx.lineTo(rx + 9, ry - 6);
        ctx.lineTo(rx + 12, ry + 12);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#9a9a9a";
        ctx.beginPath();
        ctx.moveTo(rx - 8, ry - 2);
        ctx.lineTo(rx - 2, ry - 9);
        ctx.lineTo(rx + 3, ry - 5);
        ctx.lineTo(rx - 4, ry + 1);
        ctx.closePath();
        ctx.fill();

        if (s1 > 0.5) {
            ctx.fillStyle = "#5a5a5a";
            ctx.beginPath();
            ctx.arc(px + 10 + s2 * 8, py + TILE_SIZE - 8, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (tile.terrain === "ruins") {
        ctx.fillStyle = "#2a2a2a";
        ctx.fillRect(px + 10, py + 26, TILE_SIZE - 18, 10);
        ctx.fillStyle = "#8a8577";
        ctx.fillRect(px + 16, py + 8, 10, 22);
        ctx.fillStyle = "#a29b8a";
        ctx.fillRect(px + 16, py + 8, 4, 22);
        ctx.fillStyle = "#6e695e";
        ctx.fillRect(px + 14, py + 5, 14, 5);
        ctx.fillStyle = "#7d7869";
        ctx.beginPath();
        ctx.arc(px + 32, py + 30, 4, 0, Math.PI * 2);
        ctx.arc(px + 12, py + 34, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3f6b3f";
        ctx.fillRect(px + 16, py + 24, 10, 4);
    }

    // grass decorations
    if (tile.terrain === "grass") {
        if (s1 > 0.72) {
            ctx.strokeStyle = "#2c5a2c";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px + 8 + s2 * 24, py + TILE_SIZE - 6);
            ctx.lineTo(px + 6 + s2 * 24, py + TILE_SIZE - 15);
            ctx.moveTo(px + 12 + s2 * 24, py + TILE_SIZE - 6);
            ctx.lineTo(px + 14 + s2 * 24, py + TILE_SIZE - 14);
            ctx.stroke();
        }
        if (s2 > 0.9) {
            const fx = px + 10 + s1 * 26;
            const fy = py + 10 + s2 * 20;
            ctx.fillStyle = s1 > 0.85 ? "#e8638c" : "#f5f1d0";
            ctx.beginPath();
            ctx.arc(fx, fy, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#f2c744";
            ctx.beginPath();
            ctx.arc(fx, fy, 1.4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
