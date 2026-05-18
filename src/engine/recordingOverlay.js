/**
 * Burned-in titles for timeline exports (canvas capture only).
 */

function isLightBackground(hex) {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

function formatCommitDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Dominant commit author in the analyzed history (repo contributor). */
export function primaryRepoAuthor(commits) {
  if (!commits?.length) return '';
  const counts = new Map();
  for (const c of commits) {
    const name = c.author?.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  let best = '';
  let max = 0;
  for (const [name, n] of counts) {
    if (n > max) {
      max = n;
      best = name;
    }
  }
  return best;
}

/**
 * Draw export titles in screen space (call after graph, before frame ends).
 */
export function drawRecordingOverlay(ctx, { w, h, dpr }, meta, background = '#03040a') {
  if (!meta) return;

  const light = isLightBackground(background);
  const fg = light ? 'rgba(12, 14, 20, 0.94)' : 'rgba(255, 255, 255, 0.94)';
  const fgMuted = light ? 'rgba(12, 14, 20, 0.62)' : 'rgba(255, 255, 255, 0.62)';
  const panel = light ? 'rgba(255, 255, 255, 0.72)' : 'rgba(6, 8, 16, 0.55)';
  const padX = Math.max(20, w * 0.04);
  const padY = Math.max(22, h * 0.04);

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  const dateStr = formatCommitDate(meta.commitDate);
  if (dateStr) {
    ctx.font = '600 15px "JetBrains Mono", "SF Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const tw = ctx.measureText(dateStr).width + 28;
    const th = 34;
    const tx = (w - tw) / 2;
    const ty = padY;
    ctx.fillStyle = panel;
    roundRect(ctx, tx, ty, tw, th, 8);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.fillText(dateStr, w / 2, ty + 10);
  }

  const repoName = meta.repoName?.trim() || '';
  const repoAuthor = meta.repoAuthor?.trim() || '';
  if (repoName || repoAuthor) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    let blockH = 0;
    let nameW = 0;
    let authorW = 0;

    if (repoName) {
      ctx.font = '600 20px "Outfit", system-ui, sans-serif';
      nameW = ctx.measureText(repoName).width;
      blockH += 26;
    }
    if (repoAuthor) {
      ctx.font = '500 13px "JetBrains Mono", "SF Mono", ui-monospace, monospace';
      authorW = ctx.measureText(repoAuthor).width;
      blockH += repoName ? 22 : 20;
    }

    const bw = Math.max(nameW, authorW) + 32;
    const bx = (w - bw) / 2;
    const by = h - padY - blockH;

    ctx.fillStyle = panel;
    roundRect(ctx, bx, by, bw, blockH + 16, 8);
    ctx.fill();

    let y = h - padY - 8;
    if (repoAuthor) {
      ctx.font = '500 13px "JetBrains Mono", "SF Mono", ui-monospace, monospace';
      ctx.fillStyle = fgMuted;
      ctx.fillText(repoAuthor, w / 2, y);
      y -= 22;
    }
    if (repoName) {
      ctx.font = '600 20px "Outfit", system-ui, sans-serif';
      ctx.fillStyle = fg;
      ctx.fillText(repoName, w / 2, y);
    }
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}
