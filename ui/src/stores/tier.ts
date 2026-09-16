// stores/tier.ts — 强度表状态（localStorage 持久化，key wxq.tier）
import { ref, computed, watch } from 'vue';

const LS_KEY = 'wxq.tier';
export const TIER_KEYS = ['S', 'A', 'B', 'C', 'D'] as const;
export type TierKey = (typeof TIER_KEYS)[number];

const read = (): Record<TierKey, string[]> => {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    return {
      S: Array.isArray(raw.S) ? raw.S : [],
      A: Array.isArray(raw.A) ? raw.A : [],
      B: Array.isArray(raw.B) ? raw.B : [],
      C: Array.isArray(raw.C) ? raw.C : [],
      D: Array.isArray(raw.D) ? raw.D : [],
    };
  } catch {
    return { S: [], A: [], B: [], C: [], D: [] };
  }
};
const write = () => localStorage.setItem(LS_KEY, JSON.stringify(placed.value));

export const placed = ref<Record<TierKey, string[]>>(read());
export const tierName = ref(localStorage.getItem('wxq.tier.name') || '');
watch(tierName, (v) => localStorage.setItem('wxq.tier.name', v));

/** 英雄当前所在阶级；未入表返回 null */
export function tierOf(heroId: string): TierKey | null {
  for (const k of TIER_KEYS) if (placed.value[k].includes(heroId)) return k;
  return null;
}

/** 把英雄移到某阶级（从原阶级移除，去重）；to 为 null 表示移出表 */
export function placeHero(heroId: string, to: TierKey | null) {
  for (const k of TIER_KEYS) {
    const at = placed.value[k].indexOf(heroId);
    if (at >= 0) placed.value[k].splice(at, 1);
  }
  if (to) placed.value[to].push(heroId);
  write();
}

export function clearTiers() {
  placed.value = { S: [], A: [], B: [], C: [], D: [] };
  write();
}

export const placedCount = computed(() =>
  TIER_KEYS.reduce((a, k) => a + placed.value[k].length, 0));
