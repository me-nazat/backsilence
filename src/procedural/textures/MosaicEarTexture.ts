/* ── MosaicEarTexture.ts ──────────────────────────────────────────────────
 *  Procedural mosaic texture generator for the Ear emblem at the pool floor center.
 *  Stylized spiral ear motif composed of individual mosaic tesserae tiles.
 * ──────────────────────────────────────────────────────────────────────── */

import { CanvasTexture, ClampToEdgeWrapping, NearestFilter, LinearMipmapLinearFilter } from 'three';

export function makeMosaicEarTexture(size = 512): CanvasTexture {
  if (typeof document === 'undefined') {
    return new CanvasTexture({} as HTMLCanvasElement);
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new CanvasTexture(canvas);

  // Background deep pool mosaic tiles (cream and aqua tesserae)
  ctx.fillStyle = '#659f8c';
  ctx.fillRect(0, 0, size, size);

  const tileSize = 8;
  const numTiles = size / tileSize;

  // Render individual tesserae grid with subtle random hue shifts
  for (let y = 0; y < numTiles; y++) {
    for (let x = 0; x < numTiles; x++) {
      const px = x * tileSize;
      const py = y * tileSize;

      const seed = (x * 374761393 + y * 668265263) ^ 1013904223;
      const shift = ((seed & 0xff) / 255 - 0.5) * 16;
      const r = Math.max(0, Math.min(255, 101 + shift));
      const g = Math.max(0, Math.min(255, 159 + shift));
      const b = Math.max(0, Math.min(255, 140 + shift));

      ctx.fillStyle = `rgb(${r|0}, ${g|0}, ${b|0})`;
      ctx.fillRect(px + 1, py + 1, tileSize - 1, tileSize - 1);

      // Grout lines
      ctx.fillStyle = '#467466';
      ctx.fillRect(px, py, tileSize, 1);
      ctx.fillRect(px, py, 1, tileSize);
    }
  }

  // Draw the Ear Emblem: stylized golden/cream spiral ear in the center
  const cx = size * 0.5;
  const cy = size * 0.5;
  const rMax = size * 0.38;

  // Outer ear pinna ridge
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#f4e0a5'; // Pale gold / cream mosaic
  ctx.beginPath();
  ctx.arc(cx, cy, rMax, -Math.PI * 0.85, Math.PI * 0.65, false);
  ctx.stroke();

  // Outer helix fold
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#e2c67b';
  ctx.beginPath();
  ctx.arc(cx - 10, cy, rMax * 0.8, -Math.PI * 0.8, Math.PI * 0.5, false);
  ctx.stroke();

  // Inner concha spiral ("listening to the deep")
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#d4af37';
  ctx.beginPath();
  let angle = -Math.PI * 0.6;
  let rad = rMax * 0.65;
  ctx.moveTo(cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad);
  for (let i = 0; i < 35; i++) {
    angle += 0.18;
    rad *= 0.94;
    ctx.lineTo(cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad);
  }
  ctx.stroke();

  // Central acoustic auditory canal dot
  ctx.fillStyle = '#234338';
  ctx.beginPath();
  ctx.arc(cx + 8, cy + 12, 10, 0, Math.PI * 2);
  ctx.fill();

  // Subtle concentric acoustic ripple waves emanating from ear
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(244, 224, 165, 0.45)';
  for (let w = 1; w <= 3; w++) {
    ctx.beginPath();
    ctx.arc(cx + 8, cy + 12, rMax * 0.35 + w * 28, 0, Math.PI * 2);
    ctx.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = NearestFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}
