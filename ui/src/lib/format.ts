// format.ts — 展示格式化与小工具
export const pct = (x: number | null | undefined, digits = 1): string =>
  x == null ? '—' : (x * 100).toFixed(digits) + '%';

export const wan = (n: number | null | undefined): string =>
  n == null ? '—' : n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(n);

export const TIER_TEXT: Record<number, string> = {
  1: '#a29c8c', 2: '#7cbf93', 3: '#8fb7dd', 4: '#b7a0dd', 5: '#f2c36b',
};
export const TIER_DOT: Record<number, string> = {
  1: '#8a8577', 2: '#5b9e6f', 3: '#5b8dbe', 4: '#9b7ec8', 5: '#e0a94e',
};

export const heroImg = (id: string | number): string =>
  `https://static.datatft.com/wxq/wxq-database/heroes/${id}/portrait.png`;
