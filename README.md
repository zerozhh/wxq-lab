# wxq-lab · 万象棋竞技研究助手

帮玩家提升《王者万象棋》竞技实力的私人研究工具。

## 三个能力

1. **复盘解析** — 对局后把结果交给 Claude（在本项目里说「复盘」+ 文字描述对局信息），结构化存档并对照版本数据给教练式改进结论
2. **组合研究** — 基于英雄/棋手/装备/天赋数据库 + 每日真实对局统计，研究棋手×天赋×棋子×装备的最优搭配
3. **每日数据** — 自动抓取[万象棋大数据](https://www.datawxq.com)（登顶率/前三率/出场率/阵容排行），积累版本环境时间线

## 快速开始

```bash
./scripts/update.sh   # 抓当日数据（首次自动 npm install）
cd ui && npm install  # 前端依赖（Vue3 + Vite + TS）
cd .. && npm run build  # 构建前端到 dist/
npm run ui            # 启动 → http://localhost:5177
```

开发模式（热更新）：`npm run dev`（数据 :5178 + Vite :5173）。

日常使用：打开 http://localhost:5177 —— **环境**看版本榜单与热门阵容，**图鉴**查 85 英雄/21 棋手/73 装备/255 天赋全量数据，**工坊**配阵容并实时对照版本数据，**复盘**赛后 30 秒记录并自动比对版本基准。

也可以在项目目录启动 `claude`，说「复盘」或「研究阵容」，协议见 CLAUDE.md。

## 目录

```
ui/                前端（Vue 3 + Vite + TypeScript）
  src/views/       四视图：环境 / 图鉴 / 工坊 / 复盘
  src/components/  头像、率条、趋势线、抽屉、模态
  src/stores/      阵容与复盘记录（localStorage）
  src/types.ts     领域类型
dist/              前端构建产物（npm run build）
data/
  heroes.json      英雄牌数据库（85，含基础面板）
  commanders.json  棋手数据库（21，含技能/秘技/专属）
  equipment.json   装备数据库（73，含合成树）
  talents.json     天赋/秘技牌库（255）
  factions.json    阵营（6）
  matches/         我的对局复盘记录
  meta/<日期>/     每日统计快照（api/*.json + summary.md）
scripts/
  fetch-meta.mjs   直连 API 每日拉取
  capture.mjs      浏览器全量抓取（接口勘察）
  extract/split    卡牌库提取与拆分入库
  serve.mjs        本地服务器（dist + /data）
  dev.mjs          开发双进程入口
  screenshot.mjs   四视图无头截图（回归检查）
  update.sh        每日更新入口
```
