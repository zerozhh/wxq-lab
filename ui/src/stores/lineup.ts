// stores/lineup.ts — 阵容工坊状态（localStorage 持久化）
import { ref, computed } from 'vue';
import type { SavedLineup, SlotEntry } from '../types';

const LS_KEY = 'wxq.lineups';
export const MAX_SLOTS = 7; // 基础5 + 3本 +1 + 5本 +1
export const LEVELS = ['10', '40', '100', '150', '300'];

const read = (): SavedLineup[] => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
};
const write = (list: SavedLineup[]) => localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 50)));

export const commander = ref<{ id: string; name: string } | null>(null);
export const slots = ref<(SlotEntry | null)[]>(Array(MAX_SLOTS).fill(null));
export const lineupName = ref('');

const saved = ref<SavedLineup[]>(read());

export const filledSlots = computed(() => slots.value.filter((s): s is SlotEntry => s !== null));
export const totalLevels = computed(() => filledSlots.value.reduce((a, s) => a + Number(s.level || 0), 0));
export const equipCount = computed(() => filledSlots.value.reduce((a, s) => a + s.equips.filter(Boolean).length, 0));

export function saveLineup(): SavedLineup | null {
  if (!filledSlots.value.length) return null;
  const entry: SavedLineup = {
    name: lineupName.value || `阵容 ${saved.value.length + 1}`,
    date: new Date().toISOString().slice(0, 10),
    commanderId: commander.value?.id ?? null,
    commanderName: commander.value?.name ?? null,
    slots: JSON.parse(JSON.stringify(slots.value)),
  };
  saved.value = [entry, ...saved.value];
  write(saved.value);
  return entry;
}
export function deleteLineup(index: number) {
  saved.value.splice(index, 1);
  write(saved.value);
}
export function loadInto(lineup: SavedLineup) {
  commander.value = lineup.commanderId ? { id: lineup.commanderId, name: lineup.commanderName || '' } : null;
  slots.value = JSON.parse(JSON.stringify(lineup.slots));
  while (slots.value.length < MAX_SLOTS) slots.value.push(null);
  lineupName.value = lineup.name;
}
export function resetLineup() {
  slots.value = Array(MAX_SLOTS).fill(null);
  commander.value = null;
  lineupName.value = '';
}
export function useSavedLineups() {
  return saved;
}
