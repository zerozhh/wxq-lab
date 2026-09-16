// data.ts — 数据加载（fetch + 内存缓存）
import type {
  Hero, Commander, Equipment, Talent, Faction,
  RankingResponse, TrendResponse, LineupsResponse, MetaSnapshot,
  EquipmentFitResponse, ExploreBody, ExploreResponse,
} from '../types';

const cache = new Map<string, Promise<unknown>>();

function j<T>(url: string): Promise<T> {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((res) => {
      if (!res.ok) throw new Error(`${url} → ${res.status}`);
      return res.json() as Promise<T>;
    }));
  }
  return cache.get(url) as Promise<T>;
}

function post<T>(url: string, body: unknown): Promise<T> {
  if (!cache.has(url)) {
    cache.set(url, fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((res) => {
      if (!res.ok) throw new Error(`${url} → ${res.status}`);
      return res.json() as Promise<T>;
    }));
  }
  return cache.get(url) as Promise<T>;
}

export const db = {
  heroes: () => j<Hero[]>('/data/heroes.json'),
  heroDetails: () => j<Hero[]>('/data/hero-details.json'),
  commanders: () => j<Commander[]>('/data/commanders.json'),
  commanderDetails: () => j<Commander[]>('/data/commander-details.json'),
  equipment: () => j<Equipment[]>('/data/equipment.json'),
  equipmentDetails: () => j<Equipment[]>('/data/equipment-details.json'),
  talents: () => j<Talent[]>('/data/talents.json'),
  factions: () => j<Faction[]>('/data/factions.json'),
};

export async function metaDirs(): Promise<string[]> {
  return j<string[]>('/__/meta-dirs');
}

// 装备搭配：每件装备 × 携带英雄 × 胜率提升（经本地服务器代理规避 CORS）
export function equipmentFit(): Promise<EquipmentFitResponse> {
  return post<EquipmentFitResponse>('/api/datatft/equipment-fit', {});
}

// 装备搭配的快照回退：live 接口异常（如限流/42000）时，用最近一份有效的本地快照
export async function equipmentFitSnapshot(): Promise<EquipmentFitResponse | null> {
  let dirs: string[] = [];
  try { dirs = await metaDirs(); } catch { return null; }
  for (const d of dirs) {
    try {
      const r = await fetch(`/data/meta/${d}/api/equipment-fit.json`);
      if (!r.ok) continue;
      const body = await r.json() as EquipmentFitResponse;
      if (body?.data?.items?.length) return body;
    } catch { /* 试下一份 */ }
  }
  return null;
}

// 对局检索：按英雄/棋手/装备/阵营/天赋筛选真实对局（POST /wzwxq/explore，经代理）
export function explore(body: ExploreBody): Promise<ExploreResponse> {
  return post<ExploreResponse>('/api/datatft/explore', body);
}

// 装备 id → 名称映射（基础装备 + 详情里的成装预览合并）
export async function equipNameMap(): Promise<Record<string, string>> {
  const [es, details] = await Promise.all([
    j<Equipment[]>('/data/equipment.json'),
    j<Equipment[]>('/data/equipment-details.json').catch(() => [] as Equipment[]),
  ]);
  const names: Record<string, string> = {};
  for (const e of [...es, ...details]) {
    names[String(e.id)] = e.name;
    (e.previewCards || []).forEach((pc) => (names[String(pc.id)] = pc.name));
  }
  return names;
}

// 装备 id → 名称+图标（阵容卡卡格上的小装备图标用）
// 注意：equipment-details.json 的顶层条目没有 image 字段，直接合并会把图标冲成 undefined
// ——所以顶层只写真值，previewCards（带 icon）最后写
export async function equipInfoMap(): Promise<Record<string, { name: string; image?: string }>> {
  const [es, details] = await Promise.all([
    j<Equipment[]>('/data/equipment.json'),
    j<Equipment[]>('/data/equipment-details.json').catch(() => [] as Equipment[]),
  ]);
  const info: Record<string, { name: string; image?: string }> = {};
  for (const e of [...es, ...details]) {
    if (e.image) info[String(e.id)] = { name: e.name, image: e.image };
  }
  for (const e of [...es, ...details]) {
    (e.previewCards || []).forEach((pc) => {
      info[String(pc.id)] = { name: pc.name, image: pc.image };
    });
  }
  return info;
}

export async function metaSnapshot(date: string): Promise<MetaSnapshot> {
  const base = `/data/meta/${date}/api`;
  const [heroes, commanders, equipment, lineups, trendHero] = await Promise.all([
    j<RankingResponse>(`${base}/heroes.json`),
    j<RankingResponse>(`${base}/commanders.json`),
    j<RankingResponse>(`${base}/equipment.json`),
    j<LineupsResponse>(`${base}/lineups.json`),
    j<TrendResponse>(`${base}/trend-hero.json`).catch(() => null),
  ]);
  return { date, heroes, commanders, equipment, lineups, trendHero };
}
