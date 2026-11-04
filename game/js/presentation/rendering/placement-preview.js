// Draws the live, validated footprint for a dragged card.

import { CELL } from '../../core/config.js';
import { state } from '../../core/state.js';

export function drawPlacementPreview(ctx) {
    const preview = state.cardPreview;
    if (!preview) return;

    const scale = CELL * state.zoom;
    const centerX = (preview.tx + 0.5) * scale - state.camera.x;
    const centerY = (preview.ty + 0.5) * scale - state.camera.y;
    const width = preview.width * scale;
    const height = preview.height * scale;
    const left = centerX - width / 2;
    const top = centerY - height / 2;
    const color = preview.valid ? "#75e0a2" : "#ff7777";

    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = preview.valid ? "rgba(66, 190, 125, 0.26)" : "rgba(224, 72, 72, 0.28)";
    ctx.fillRect(left, top, width, height);

    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, Math.min(4, scale * 0.055));
    ctx.setLineDash(preview.valid ? [] : [6, 4]);
    ctx.strokeRect(left, top, width, height);
    ctx.setLineDash([]);

    if (!preview.valid && width > 12 && height > 12) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, top, width, height);
        ctx.clip();
        ctx.strokeStyle = "rgba(255, 125, 125, 0.65)";
        ctx.lineWidth = 1;
        const span = width + height;
        for (let offset = -height; offset < width; offset += 10) {
            ctx.beginPath();
            ctx.moveTo(left + offset, top + height);
            ctx.lineTo(left + offset + height, top);
            ctx.stroke();
        }
        ctx.restore();
    }

    const label = preview.valid ? "READY TO BUILD" : preview.reason;
    const fontSize = Math.max(9, Math.min(13, scale * 0.22));
    ctx.font = `700 ${fontSize}px "Trebuchet MS", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const labelWidth = Math.max(94, Math.min(180, width + 28));
    ctx.fillStyle = "rgba(7, 13, 16, 0.9)";
    ctx.fillRect(centerX - labelWidth / 2, top - fontSize - 13, labelWidth, fontSize + 9);
    ctx.fillStyle = color;
    ctx.fillText(label, centerX, top - 5, labelWidth - 10);
    ctx.restore();
}
