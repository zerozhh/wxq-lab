// board.ts — 分享图绘制（一图流 / 强度表）
// 图片一律走 /api/img 同源代理：直接引第三方域会污染 canvas，toDataURL 抛安全异常。

const FONT = `-apple-system, 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif`;

// 量宽用的屏外 ctx（不渲染）
const ctx0 = document.createElement('canvas').getContext('2d')!;

const ALLOWED = ['static.datatft.com', 'game.gtimg.cn'];

/** 第三方资源域换成同源代理地址；其余（相对路径/data:）原样返回 */
export function proxiedImg(src?: string | null): string {
  if (!src) return '';
  try {
    const u = new URL(src, location.origin);
    if (ALLOWED.includes(u.host)) return `/api/img?u=${encodeURIComponent(src)}`;
  } catch { /* 相对路径等 */ }
  return src;
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // 单图失败不阻塞整张分享图
    img.src = src;
  });
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 夜空底：靛蓝渐变 + 左上薰衣草辉光（与站点 .hero-night 同构） */
function nightBg(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(w * 0.15, 0, w * 0.85, h);
  g.addColorStop(0, '#2a3168');
  g.addColorStop(0.55, '#1e2450');
  g.addColorStop(1, '#171b3d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(140, -40, 0, 140, -40, 560);
  glow.addColorStop(0, 'rgba(166,204,255,0.16)');
  glow.addColorStop(1, 'rgba(166,204,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

function gradTitle(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, maxW: number,
) {
  let fs = size;
  ctx.font = `italic 900 ${fs}px ${FONT}`;
  while (ctx.measureText(text).width > maxW && fs > 20) {
    fs -= 2;
    ctx.font = `italic 900 ${fs}px ${FONT}`;
  }
  const g = ctx.createLinearGradient(x, y - fs, x + Math.min(ctx.measureText(text).width, maxW), y);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.6, '#c9d8ff');
  g.addColorStop(1, '#70b7ff');
  ctx.fillStyle = g;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
  return fs;
}

function footer(ctx: CanvasRenderingContext2D, w: number, h: number, metaDate?: string) {
  const y = h - 30;
  ctx.textBaseline = 'middle';
  ctx.font = `600 13px ${FONT}`;
  ctx.fillStyle = 'rgba(202,210,245,0.85)';
  ctx.fillText('万象棋房 · wxq-lab', 48, y);
  ctx.font = `400 12px ${FONT}`;
  ctx.fillStyle = 'rgba(202,210,245,0.5)';
  const right = metaDate ? `数据快照 ${metaDate} · 万象棋大数据` : '万象棋大数据';
  ctx.fillText(right, w - 48 - ctx.measureText(right).width, y);
}

export interface LineupBoardSlot {
  heroId: string;
  name: string;
  faction: string;
  quality: number;
  level: string;
  equips: { id: string; name: string; image?: string }[];
}
export interface LineupBoardData {
  name: string;
  date: string;
  metaDate?: string;
  commander?: { name: string; avatar?: string } | null;
  slots: LineupBoardSlot[];
  factionCounts: [string, number][];
}

/** 一图流：1200×800 深靛底阵容分享图 */
export async function drawLineupBoard(d: LineupBoardData): Promise<HTMLCanvasElement> {
  const W = 1200, H = 800;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  nightBg(ctx, W, H);

  // 标题 + 副行
  gradTitle(ctx, d.name || '未命名阵容', 48, 92, 46, 760);
  ctx.textBaseline = 'middle';
  let sx = 48;
  const sy = 132;
  if (d.commander?.avatar) {
    const av = await loadImg(proxiedImg(d.commander.avatar));
    if (av) {
      ctx.save();
      rr(ctx, sx, sy - 17, 34, 34, 9);
      ctx.clip();
      ctx.drawImage(av, sx, sy - 17, 34, 34);
      ctx.restore();
      sx += 42;
    }
  }
  ctx.font = `500 15px ${FONT}`;
  ctx.fillStyle = 'rgba(202,210,245,0.92)';
  const parts = [
    d.commander ? `棋手 ${d.commander.name}` : '',
    `${d.slots.length} 名英雄 · 等级总和 ${d.slots.reduce((a, s) => a + Number(s.level || 0), 0)}`,
    d.date,
  ].filter(Boolean);
  ctx.fillText(parts.join('　'), sx, sy);
  ctx.strokeStyle = 'rgba(166,204,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(48, 162);
  ctx.lineTo(W - 48, 162);
  ctx.stroke();

  // 槽位卡（只画上阵英雄，居中排布）
  const n = Math.max(d.slots.length, 1);
  const gap = 14;
  const cw = Math.min(150, (W - 96 - gap * (n - 1)) / n);
  const ch = 286;
  const cy = 200;
  let cx = (W - (cw * n + gap * (n - 1))) / 2;
  for (const s of d.slots) {
    rr(ctx, cx, cy, cw, ch, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(166,204,255,0.22)';
    ctx.stroke();

    const portrait = await loadImg(proxiedImg(`https://static.datatft.com/wxq/wxq-database/heroes/${s.heroId}/portrait.png`));
    const pw = 88;
    const px = cx + (cw - pw) / 2;
    if (portrait) {
      ctx.save();
      rr(ctx, px, cy + 18, pw, pw, 12);
      ctx.clip();
      ctx.drawImage(portrait, px, cy + 18, pw, pw);
      ctx.restore();
    } else {
      rr(ctx, px, cy + 18, pw, pw, 12);
      ctx.fillStyle = 'rgba(166,204,255,0.1)';
      ctx.fill();
    }

    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    let ty = cy + 116;
    ctx.font = `700 15px ${FONT}`;
    ctx.fillStyle = '#f0f2ff';
    ctx.fillText(s.name, cx + cw / 2, ty, cw - 12);
    ty += 24;
    ctx.font = `400 11px ${FONT}`;
    ctx.fillStyle = 'rgba(166,204,255,0.75)';
    ctx.fillText(`${s.faction} · ${s.quality}阶`, cx + cw / 2, ty);

    // 等级徽标
    ty += 22;
    ctx.font = `700 11px ${FONT}`;
    const lv = `${s.level}级`;
    const lw = ctx.measureText(lv).width + 16;
    rr(ctx, cx + (cw - lw) / 2, ty, lw, 20, 999);
    ctx.fillStyle = 'rgba(74,121,255,0.28)';
    ctx.fill();
    ctx.fillStyle = '#a6ccff';
    ctx.fillText(lv, cx + cw / 2, ty + 10);

    // 装备
    if (s.equips.length) {
      ty += 32;
      const es = 24;
      const total = s.equips.length * es + (s.equips.length - 1) * 6;
      let ex = cx + (cw - total) / 2;
      for (const eq of s.equips) {
        const im = await loadImg(proxiedImg(eq.image));
        if (im) {
          ctx.save();
          rr(ctx, ex, ty, es, es, 6);
          ctx.clip();
          ctx.drawImage(im, ex, ty, es, es);
          ctx.restore();
        }
        ex += es + 6;
      }
    }
    ctx.textAlign = 'left';
    cx += cw + gap;
  }

  // 阵容计数
  const active = d.factionCounts.filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
  let fx = 48;
  const fy = 560;
  ctx.textBaseline = 'middle';
  for (const [name, count] of active) {
    ctx.font = `600 13px ${FONT}`;
    const label = `${name} ×${count}`;
    const w = ctx.measureText(label).width + 22;
    rr(ctx, fx, fy, w, 30, 999);
    ctx.fillStyle = 'rgba(74,121,255,0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(74,121,255,0.35)';
    ctx.stroke();
    ctx.fillStyle = '#c9d8ff';
    ctx.fillText(label, fx + 11, fy + 15);
    fx += w + 10;
  }

  footer(ctx, W, H, d.metaDate);
  return canvas;
}

export interface TierBoardTier {
  key: string;
  color: string;
  heroes: { heroId: string; name: string }[];
}
export interface TierBoardData {
  title: string;
  date: string;
  metaDate?: string;
  tiers: TierBoardTier[];
}

export const TIER_STYLE: { key: string; color: string }[] = [
  { key: 'S', color: '#f5c451' },
  { key: 'A', color: '#e0663c' },
  { key: 'B', color: '#5b8dff' },
  { key: 'C', color: '#38b474' },
  { key: 'D', color: '#9aa0c8' },
];

/** 强度表分享图：宽度固定 1200，高度按内容自适应 */
export async function drawTierBoard(d: TierBoardData): Promise<HTMLCanvasElement> {
  const W = 1200;
  const PAD = 48;
  const chipH = 46;
  const GAP = 8;

  // 先加载全部头像，并预排每行芯片，算出自适应高度
  interface Chip { heroId: string; name: string; img: HTMLImageElement | null; w: number }
  const tiers: { key: string; color: string; rows: Chip[][] }[] = [];
  for (const t of d.tiers) {
    ctx0.font = `650 13px ${FONT}`;
    const chips: Chip[] = [];
    for (const h of t.heroes) {
      const img = await loadImg(proxiedImg(`https://static.datatft.com/wxq/wxq-database/heroes/${h.heroId}/portrait.png`));
      chips.push({ heroId: h.heroId, name: h.name, img, w: chipH + 10 + ctx0.measureText(h.name).width + 18 });
    }
    // 贪心断行
    const rows: Chip[][] = [];
    let row: Chip[] = [];
    let x = 0;
    const maxW = W - PAD * 2 - 64;
    for (const c of chips) {
      if (row.length && x + c.w > maxW) { rows.push(row); row = []; x = 0; }
      row.push(c);
      x += c.w + GAP;
    }
    if (row.length) rows.push(row);
    tiers.push({ key: t.key, color: t.color, rows });
  }
  const rowsTotal = tiers.reduce((a, t) => a + Math.max(t.rows.length, 1), 0);
  const H = 190 + rowsTotal * (chipH + 14) + 60;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  nightBg(ctx, W, H);

  gradTitle(ctx, d.title || '强度表', PAD, 92, 46, 700);
  ctx.textBaseline = 'middle';
  ctx.font = `500 15px ${FONT}`;
  ctx.fillStyle = 'rgba(202,210,245,0.92)';
  ctx.fillText(d.date, PAD, 132);
  ctx.strokeStyle = 'rgba(166,204,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(PAD, 162);
  ctx.lineTo(W - PAD, 162);
  ctx.stroke();

  let y = 196;
  for (const t of tiers) {
    // 阶标签
    rr(ctx, PAD, y + 4, 48, 48, 12);
    ctx.fillStyle = `${t.color}2b`;
    ctx.fill();
    ctx.strokeStyle = `${t.color}88`;
    ctx.stroke();
    ctx.font = `900 24px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = t.color;
    ctx.fillText(t.key, PAD + 24, y + 29);
    ctx.textAlign = 'left';

    let cx = PAD + 64;
    let cy = y;
    for (const c of t.rows.flat()) {
      if (cx + c.w > W - PAD) { cx = PAD + 64; cy += chipH + 14; }
      rr(ctx, cx, cy, c.w, chipH, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(166,204,255,0.16)';
      ctx.stroke();
      if (c.img) {
        ctx.save();
        rr(ctx, cx + 5, cy + 5, chipH - 10, chipH - 10, 9);
        ctx.clip();
        ctx.drawImage(c.img, cx + 5, cy + 5, chipH - 10, chipH - 10);
        ctx.restore();
      }
      ctx.font = `650 13px ${FONT}`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e8ebfa';
      ctx.fillText(c.name, cx + chipH + 10, cy + chipH / 2 + 1);
      cx += c.w + GAP;
    }
    y = cy + chipH + 14;
  }

  footer(ctx, W, H, d.metaDate);
  return canvas;
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}
