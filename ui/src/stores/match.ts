// stores/match.ts — 复盘记录（localStorage 持久化）
import { ref } from 'vue';
import type { MatchRecord } from '../types';

const LS_KEY = 'wxq.matches';

const read = (): MatchRecord[] => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
};
const write = (list: MatchRecord[]) => localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 200)));

export const matches = ref<MatchRecord[]>(read());

export function addMatch(m: Omit<MatchRecord, 'id'>): void {
  matches.value = [{ ...m, id: Date.now() }, ...matches.value];
  write(matches.value);
}
export function deleteMatch(id: number): void {
  matches.value = matches.value.filter((m) => m.id !== id);
  write(matches.value);
}
