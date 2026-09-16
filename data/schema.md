# 数据结构说明

所有 JSON 为数组或对象，条目通用字段：

- `id`：游戏内 ID（英雄/装备为数字 ID，与 datawxq 静态资源路径一致）
- `name`：名称
- `source`：数据来源（URL 或 "user-screenshot" / "community"）
- `verified`：true=官方或实测确认；false=社区资料待验证
- `updatedAt`：录入日期

## heroes.json（英雄牌）
```json
{
  "id": 5141, "name": "亚连", "faction": "日落海", "tier": 2,
  "skill": {},            // 技能描述：{base, lv10, lv40, lv100, awakened}
  "stats": null,          // 基础面板 {hp, attack, attackSpeed...}——wiki 不展示，需游戏截图转录
  "source": "datawxq.com", "verified": false, "updatedAt": "2026-09-14"
}
```

## commanders.json（棋手）
```json
{
  "id": "r8", "name": "白歌",
  "skill": {},            // 专属技能
  "secretQuest": {},      // 秘技任务 → 秘技牌
  "coreTalent": {},       // 6 级专属天赋
  "source": "wxq.qq.com", "verified": true, "updatedAt": "2026-09-14"
}
```

## equipment.json（装备牌）
```json
{
  "id": 643602, "name": "极寒风暴", "kind": "completed",  // component=小件 | completed=成品
  "effects": {}, "source": "datawxq.com", "verified": false, "updatedAt": "2026-09-14"
}
```

## talents.json（天赋牌）
升级 3 选 1：1 阶铜 / 2 阶银 / 3 阶金；白银段位起每局 1 次刷新；同级玩家品阶相同。

## meta/&lt;日期&gt;/（每日统计快照）
`raw/*.json` 为 datawxq 截获的原始接口数据；`capture-report.md` 为接口清单。
`raw/page-*.txt` 为渲染后页面文本兜底。

## matches/（复盘记录）
```json
{
  "date": "2026-09-14", "rank": 2, "commander": "白歌",
  "finalLineup": [{"hero": "曹操", "level": 100, "equip": ["名刀·司命"]}],
  "keyTalents": [], "keyMoments": [], "opponents": [],
  "conclusions": [], "actions": []
}
```
