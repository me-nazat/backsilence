/* ── ShareCard.ts ────────────────────────────────────────────────────────
 *  Coded 2D Canvas Run Share Card Generator:
 *  Renders an authentic VHS / cassette tape label with score, rank, time,
 *  noise dB, and seed. Exportable as high-res PNG via canvas.toBlob.
 *  Zero external raster assets.
 * ──────────────────────────────────────────────────────────────────────── */

export interface ShareCardData {
  tapeTitle: string;
  tapeNumber: number;
  playerName: string;
  playerTag: string;
  rankTitle: string;
  score: number;
  timeMs: number;
  noiseDb: number;
  seed: number;
  replayCode?: string;
}

export const ShareCard = {
  renderToCanvas(data: ShareCardData): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 450;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    // 1. Dark Analog Background with VHS noise texture
    ctx.fillStyle = '#0d0b06';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle CRT scanlines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    for (let y = 0; y < canvas.height; y += 4) {
      ctx.fillRect(0, y, canvas.width, 2);
    }

    // Outer tape cartridge border
    ctx.strokeStyle = '#5b4526';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

    // 2. Paper Tape Label Strip
    ctx.fillStyle = '#e9dca8';
    ctx.fillRect(40, 40, canvas.width - 80, 100);

    // Label border and header
    ctx.fillStyle = '#0d0b06';
    ctx.font = 'bold 28px monospace';
    ctx.fillText(`TAPE 0${data.tapeNumber} // ${data.tapeTitle.toUpperCase()}`, 60, 80);

    ctx.font = '14px monospace';
    ctx.fillStyle = '#5b4526';
    ctx.fillText(`OPERATOR: ${data.playerName}#${data.playerTag}  |  ARCHIVE SEED: ${data.seed}`, 60, 115);

    // 3. Two Cassette Tape Spools
    ctx.strokeStyle = 'rgba(216, 179, 106, 0.6)';
    ctx.lineWidth = 3;

    // Left spool
    ctx.beginPath();
    ctx.arc(160, 260, 50, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#14110b';
    ctx.fill();

    // Right spool
    ctx.beginPath();
    ctx.arc(canvas.width - 160, 260, 50, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#14110b';
    ctx.fill();

    // 4. Run Stats HUD Center Box
    ctx.fillStyle = 'rgba(26, 21, 14, 0.95)';
    ctx.strokeStyle = '#86cfa0';
    ctx.lineWidth = 2;
    ctx.fillRect(250, 170, 300, 180);
    ctx.strokeRect(250, 170, 300, 180);

    ctx.fillStyle = '#86cfa0';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('EXPEDITION TELEMETRY', 270, 200);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px monospace';
    ctx.fillText(`${data.score.toLocaleString()} PTS`, 270, 245);

    ctx.font = '16px monospace';
    ctx.fillStyle = '#d8b36a';
    ctx.fillText(`RANK: ${data.rankTitle}`, 270, 280);

    const timeSec = (data.timeMs / 1000).toFixed(1);
    ctx.fillText(`TIME: ${timeSec}s  |  NOISE: ${data.noiseDb.toFixed(1)} dB`, 270, 310);

    if (data.replayCode) {
      ctx.fillStyle = 'rgba(134, 207, 160, 0.7)';
      ctx.font = '11px monospace';
      ctx.fillText(`REPLAY: ${data.replayCode}`, 270, 335);
    }

    // 5. Watermark Footer
    ctx.fillStyle = '#5b4526';
    ctx.font = '12px monospace';
    ctx.fillText('BACKSILENCE // IT CANNOT SEE YOU. IT HEARS THE WATER.', 60, canvas.height - 40);

    return canvas;
  },

  async downloadShareCardPng(data: ShareCardData, filename = 'backsilence_run.png'): Promise<void> {
    const canvas = this.renderToCanvas(data);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        resolve();
      }, 'image/png');
    });
  },
};
