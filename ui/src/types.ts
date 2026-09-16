// types.ts — 领域类型（与 data/ 下 JSON 及 api.datatft.com 响应对应）

export interface HeroProperties {
  HP: number;
  phyAttack: number;
  magAttack: number;
  phyDefense: number;
  magDefense: number;
  moveSpeed?: number;
  attackSpeed: number;          // 千分之一为1单位，6000 = 1.0/s
  criticalRate?: number;
  criticalEffect?: number;
  attackDistance: number;
  initEnergy: number;
  energy: number;
  initLevel?: number;
}

export interface SkillBlock {
  id?: number;
  name?: string;
  description?: string;
  level?: number;
  upgradeSkills?: SkillBlock[];
}

export interface Hero {
  id: string;
  name: string;
  faction: string;              // 阵营名，「无阵营」表示无
  quality: 1 | 2 | 3 | 4 | 5;   // 品阶
  price: number;                // 购买能量
  skill?: SkillBlock;
  awakening?: SkillBlock;
  description?: string;
  properties?: HeroProperties;
  tags?: string[];
  image?: string;
  source?: string;
  verified?: boolean;
  updatedAt?: string;
}

export interface CommanderSectionEntry {
  id: number;
  name: string;
  description: string;
}
export interface CommanderSection {
  type: string;                 // 技能 / 秘技 / 专属
  level?: number;
  entries: CommanderSectionEntry[];
}
export interface CommanderSkill {
  type: string;
  name: string;
  text: string;
  icon?: string;
}
export interface Commander {
  id: string;                   // commander-r1 …
  name: string;
  avatar: string;
  artwork?: string;
  quote?: string;
  summary?: string;
  skillName?: string;
  skillText?: string;
  sections?: CommanderSection[];
  skills?: CommanderSkill[];
  note?: string | null;
}

export interface EquipPreview {
  id: number;
  name: string;
  type: number;
  quality: number;
  description: string;
  image: string;
  cardImage?: string;
}
export interface Equipment {
  id: string;
  name: string;
  type?: string;                // 物理装备 / 法术装备 / 通用装备
  category?: string;            // 物理 / 法术 / 通用
  subType?: string;             // 基础装备 / 成装
  description?: string;
  image: string;
  previewCards?: EquipPreview[];
  sourceCards?: EquipPreview[];
}

export interface Talent {
  id: string;
  name: string;
  quality?: number;
  description?: string;
  group?: string;               // 初始天赋 / …
  image?: string;
  icon?: string;
  cardImage?: string;
}

export interface Faction {
  name: string;
  heroes: string[];
  bonus: string | null;
  note?: string | null;
}

// ---------- 每日统计（api.datatft.com/wzwxq/*） ----------

export interface RankingRow {
  id: string;
  name?: string;
  count: number;
  firstRate: number;
  top3Rate: number;
  avgPlacement: number;
  avgLevel?: number;
}

export interface RankingResponse {
  code: number;
  message: string;
  data: {
    base?: { count: number; avgPlacement: number; firstRate: number; top3Rate: number };
    rows: RankingRow[];
  };
}

export interface TrendUnit {
  avgPlacements: (number | null)[];
  appearanceCounts: number[];
  appearanceRates: number[];
}
export interface TrendResponse {
  code: number;
  data: {
    bucketHours: number;
    timestamps: number[];
    units: Record<string, TrendUnit>;
  };
}

export interface LineupUnit {
  heroId: string;
  heroName: string;
  itemIds: string[];
  itemNames: string[];
  appearanceRate: number;
  awakenedRate: number;
  threeItemRate?: number;
  recommendationType?: string;
  count?: number;
}
export interface Lineup {
  lineupCode?: string;
  lineupKey?: string;
  lineupSize?: number;
  commanders: { name: string; avatar?: string }[];
  coreHeroes: (string | { name: string; id: string })[];
  heroes?: string[];
  recommendedUnits: LineupUnit[];
  count: number;
  firstRate: number;
  top3Rate: number;
  avgPlacement: number;
  appearanceRate?: number;
  variantCount?: number;
}
export interface LineupsResponse {
  code: number;
  data: { sampleCount: number; total: number; page: number; pageSize: number; lineups: Lineup[] };
}

export interface MetaSnapshot {
  date: string;
  heroes: RankingResponse;
  commanders: RankingResponse;
  equipment: RankingResponse;
  lineups: LineupsResponse;
  trendHero: TrendResponse | null;
}

// ---------- 装备搭配（POST /wzwxq/equipment-fit） ----------

export interface EquipmentFitHero {
  heroId: string;
  count: number;
  winRate: number;           // 登顶率
  baselineWinRate: number;   // 该英雄全体基线登顶率
  winRateLift: number;       // 提升量 = winRate - baseline
  avgPlacement: number;
}
export interface EquipmentFitItem {
  itemId: string;
  count: number;
  heroes: EquipmentFitHero[];
}
export interface EquipmentFitResponse {
  code: number;
  message: string;
  data: { sampleCount: number; items: EquipmentFitItem[] };
}

// ---------- 对局检索（POST /wzwxq/explore，2026-09-14 逆向确认） ----------

export type ExploreFilterType = 'hero' | 'commander' | 'item' | 'faction' | 'talent';
export interface ExploreFilter {
  type: ExploreFilterType;
  id: string;
  switchVal: boolean;     // 条件开关（站点恒为 true）
  conditionVal: boolean;  // true = 包含
}
export interface ExploreBody {
  time: number;                 // 统计窗口天数（站点用 7）
  operator: 'AND' | 'OR';
  advancedMode: boolean;
  filters: ExploreFilter[];
  exclusions: ExploreFilter[];
  page: number;
  pageSize: number;
  version: string;
}

export interface ExploreAggRow {
  id: string;
  name?: string;
  count: number;
  firstRate: number;
  top3Rate: number;
  avgPlacement: number;
  avgLevel?: number;
  cardType?: string;
  commanderId?: string;
}

export interface ExploreUnit {
  hero_id: string;
  hero_name: string;
  faction: string;
  cost: number;
  level: number;
  is_awakened: boolean;
  is_mvp: boolean;
  kills: number;
  damage: number;
  damage_taken: number;
  healing: number;
  item_ids: string[];
  item_names: string[];
  items_count: number;
}

export interface ExploreMatch {
  placement: number;
  commander_name: string;
  player_name: string;
  hero_names: string[];
  hero_ids: string[];
  faction_ids: string[];
  talent_names: string[];
  item_names: string[];
  team_damage: number;
  max_win_streak: number;
  total_hero_level: number;
  awakened_count: number;
  survival_duration_sec: number;
  game_time: number;
  lineup_size: number;
  units?: ExploreUnit[];
}

export interface ExploreResponse {
  code: number;
  message: string;
  data: {
    total: number;
    page: number;
    pageSize: number;
    base: { count: number; avgPlacement: number; firstRate: number; top3Rate: number };
    matches: ExploreMatch[];
    heroes: ExploreAggRow[];
    items: ExploreAggRow[];
    talents: ExploreAggRow[];
    commanders: ExploreAggRow[];
    factions: ExploreAggRow[];
  };
}

// ---------- 本机数据（localStorage） ----------

export interface SlotEntry {
  heroId: string;
  level: string;
  equips: (string | null)[];    // 3 件装备 id
}

export interface SavedLineup {
  name: string;
  date: string;
  commanderId: string | null;
  commanderName: string | null;
  slots: (SlotEntry | null)[];
}

export interface MatchRecord {
  id: number;
  date: string;
  rank: number;                 // 1-6
  commander: string;
  lineupName: string | null;
  slots: SlotEntry[];
  note?: string;
  takeaway?: string;
}
