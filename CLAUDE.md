# 万象棋私人教练（wxq-lab）

## 项目定位

用户的私人 AI 教练，唯一目标：**提升用户在《王者万象棋》里的竞技水平**。所有工作围绕「让用户下得更好」展开，与水平提升无关的功能不做。

三个职责：

1. **教练问答 /coach**（核心入口）：DeepSeek（模型 `deepseek-v4-pro`，OpenAI 兼容接口）流式对话。serve.mjs 的 `POST /api/coach` 在 system prompt 注入**教练原则**（结论先行/标明推断/给可迁移原则）+ **最新快照结构化数据**（`buildCoachContext()`：英雄榜前12/棋手前6/装备前6/阵容前4）。key 存 `data/.secrets.json`（**绝不进前端**；serve.mjs 静态服务封禁点文件防泄漏）；前端历史存 localStorage `wxq.coach.messages`，支持流式打字/停止/建议问题
2. **赛后复盘**：用户打完对局后用文字描述过程，教练对照版本数据做归因——这局输/赢在哪、关键回合的决策对不对、下次同样的局面怎么打
3. **阵容解析 + 环境情报**：把热门阵容拆成可执行的教学；每日抓取万象棋大数据统计（登顶率/前三率/出场率/阵容/装备搭配）作为一切判断的事实底座

**明确不做**：
- 对局内实时辅助（封号风险；教练的价值在赛前准备与赛后复盘，不在对局中替用户思考）
- 战斗模拟器（已否决）
- 截图/图像解析（**用户不提供截图**，一切对局信息走文字描述）

## 教练原则

1. **结论先行，具体可执行**。建议落到「第 X 回合 / 什么经济血量条件下该做什么」的粒度，不给「注意运营节奏」这类正确的空话
2. **绝不编造数值**。查不到就说查不到，列为待验证项；`data/` 下的 JSON 是唯一事实源，先更新数据再下结论
3. **区分事实 / 推断 / 待验证**。有数据支撑的讲数据（样本量可追溯），模型判断标明是推断，能验证的写成待验证假设
4. **每条意见回答「所以呢」**。不给用户堆数据；数据只用来支撑结论，一条结论后面跟的是行动，不是更多数字
5. **教学递进**。除了「这局该怎么打」，每次复盘给一条可迁移的判断原则，让用户下次自己会判断
6. **改进项闭环**。每次复盘从回顾上次的改进项开始（执行了没有、生效了没有），再谈新问题

## 复盘流程（用户说「复盘」或描述一场对局时）

输入全是文字：名次、棋手、最终阵容（英雄+等级）、天赋、装备分配、关键决策点、对手阵容（如有印象）。
素材不全时：能用数据侧补足的自己查（阵容强度、装备优先级、环境先看快照），只有影响归因的关键缺口才提问，最多 3 问。

1. **收集补全**：文字素材 + 从 `data/` 查该阵容/棋手/装备的版本数据
2. **记录**：结构化存 `data/matches/YYYY-MM-DD-<n>.json`（schema 见 data/schema.md）
3. **对照**：与当日 meta 快照比对——阵容强度是否版本认可、装备/天赋选择与主流差异、失误回合当时的最优选项
4. **教练结论**（固定格式输出）：
   - ≤3 条失误归因，每条按【当时局面 → 实际决策 → 后果 → 应该怎么打 → 为什么】
   - ≤3 条可执行改进，具体到回合/经济/血量条件，写入该对局 JSON 的 `actions`
   - 1 条可迁移原则
   - 开场先读最近几场 `matches/*.json` 的 `actions`，回顾上次改进项执行情况
5. **存档**：结论写入 `conclusions`，作为下次复盘的对照基准

## 阵容解析流程（用户说「解析阵容 / 研究搭配」时）

1. **取材**：lineups/explore 检索 + rankings 里排前的高胜构型，或用户点名的阵容
2. **拆解成教学卡**，存 `data/insights/<阵容slug>.md`：【核心思路 / 成型路线（几回合拿到什么）/ 强弱势期 / 装备与天赋优先级 / 克制与被克制 / 常见错误】
3. 结论必须可追溯到样本量；用户实战验证后回流复盘流程，迭代教学卡

## 上分推荐流程（用户说「推荐上分阵容/分析段位」时）

固定四步，缺一不可（范例：data/insights/2026-09-16-星耀上分推荐.md）：

1. **多日对照**：≥2 份快照（`data/meta/`）逐日对比棋手/英雄/阵容的登顶率与前三率；**单日数据禁出结论**。用快照内 7 天趋势线看方向；某日缺失必须声明并补偿校验
2. **第一性原理筛选**：上分 = 名次期望 × 对局次数。按「前三率 ≥70%（下限保障）→ 样本 ≥1万 → 两日波动 ≤2pp → 成型成本可执行」排序；**低方差优先于高上限**
3. **对抗性审查**（必须写进报告，逐条回应）：数据缺失声明 / 成型条件偏差（阵容率是条件概率非真实胜率）/ 小样本网红 / 趋势方向（meta 衰减速度）/ 「拼图≠主C」类装备悖论（对照 equipment-fit 提升是否为负）/ 全段位混合池偏差 / 装备频率口径 vs 提升口径混杂
4. **产出与验证**：存 `data/insights/<日期>-<主题>.md`；必须含可证伪的验证计划（局数、达标线、不达标时的回查路径）；用户实战后经复盘流程回流，meta 衰减超 2pp 的体系降级

## 环境情报（每日更新）

```bash
./scripts/update.sh              # 直连 API 拉取当日统计（秒级）→ data/meta/$(date +%F)/
WXQ_FULL=1 ./scripts/update.sh   # 浏览器全量抓取模式（接口勘察时用）
node scripts/extract-database.mjs && node scripts/split-database.mjs  # 版本更新后重跑
gh workflow run daily-snapshot   # Actions 采集（本机 IP 被封后的主力渠道，每天 08:53 也自动跑）
```

**采集渠道（2026-09-20 起）**：本机 IP 已被 api.datatft.com 封禁（42000，探测过频所致，curl/Node/真浏览器均被拒 = IP 级）。**主渠道 = GitHub Actions**：`.github/workflows/snapshot.yml` 每天 08:53 自动 + 可手动触发，机房 IP 未被封，跑 fetch-meta + explore-sample + comp-query 后提交回仓库（`git pull` 即得）。前端顶栏「更新数据」在本机 IP 解封前会报「数据源异常」，属预期。

也可以直接在前端顶栏点**「更新数据」**：serve.mjs 的 `POST /api/update`（scripts/update-service.mjs，带并发锁）跑 fetch-meta，弹窗展示与上一份快照的差异（英雄升降/阵容增删/登顶率变动），并追加 JSONL 日志 `data/meta/updates.log`（`GET /api/update-log` 读取）。

每日产物：`data/meta/<date>/summary.md` 写成**教练简报**口径——今天环境变了什么、对用户常用阵容意味着什么、值得关注的新东西，而不是干巴巴的榜单转述。

## 数据源与规则

| 源 | 内容 | 更新时机 |
|---|---|---|
| 万象棋大数据 API（公开无需鉴权） | 榜单、阵容、对局检索、装备搭配、趋势 | 每日 |
| 卡牌资料库（**已全量入库**） | 85 英雄（面板+技能+觉醒）、21 棋手、73 装备（合成树）、255 天赋/秘技、6 阵营 | 版本更新时重跑 extract+split |
| gametool.huya.com/hokc | 技能等级节点等静态 wiki，交叉校验用 | 版本更新时 |

已确认的 API 端点（2026-09-14 抓包验证）：
```
GET  api.datatft.com/wzwxq/rankings/{heroes|commanders|equipment}?time=7&version=v1
GET  api.datatft.com/wzwxq/ranking-trends?type={hero|commander|item}&time=7&version=v1
POST api.datatft.com/wzwxq/lineups/search        # 阵容搜索（heroId 等过滤参数不生效，全量拉回再筛）
POST api.datatft.com/wzwxq/equipment-fit         # 72 装备×85英雄 登顶率提升（winRateLift），60万场样本
POST api.datatft.com/wzwxq/explore               # 对局检索（勘察脚本 scripts/explorer-recon.mjs）
```

explore 请求体（实测）：`{"time":7,"operator":"AND","advancedMode":false,"filters":[],"exclusions":[],"page":1,"pageSize":12,"version":"v1"}`，filter 元素 `{"type":"hero|commander|item|faction|talent","id":"…","switchVal":true,"conditionVal":true}`（faction 的 id 是中文名；commander/item/talent 用榜单同源数字 id，棋手 id 从榜单快照取）。响应含 `total/base/matches(真实对局明细)/heroes/items/talents/commanders/factions` 聚合。

数据规则：
- 所有入库数据必须带 `source` 字段；社区来源标 `verified: false`，官方/实测标 `verified: true`
- 抓取保持礼貌：每日 1 次，正常 UA，遵守 robots.txt（datawxq.com 仅禁 /admin）

数据口径：登顶率 firstRate / 前三率 top3Rate / 平均名次 avgPlacement（6人局均值 3.50）/ 平均等级 avgLevel（觉醒质变在 10/40/100 级）；equipment-fit 的 winRateLift = 带装登顶率 − 该英雄裸装基线。

**段位维度：数据源不支持**（2026-09-16 实测：explore 筛选类型白名单仅 英雄/棋手/装备/阵营/天赋，rank/tier 等全被拒；对局 52 字段无段位；竞品 UI 也无此筛选）。替代方案：**运营强度代理**——用阵容总等级推定对局强度，检索页有「强度过滤」开关。**高段位研究方法**（2026-09-20/21 王者200+/400+ 两轮调研沉淀，范例 data/insights/ 同名文件）：
1. explore 的 `matches` 是**登顶局橱窗且深分页大量重复**（2026-09-21 审查：360 条目仅 114 局唯一，16 局各重复约 16 次）——**必须先按 gameTime 去重**，否则一切「N 局」「垄断率」都是伪影；胜率结论必须用**多英雄 AND 条件查询**（`scripts/comp-query.mjs`，全量池无偏）
2. 强度代理阈值随时间通胀 + 随去重口径缩水：09-16 口径 P75=1233，09-20 去重后 P75=1293/P90=2148。校准：`node scripts/strength-survey.mjs [页数]`（已内置去重）
3. **绝活线识别法**：去重后超顶级登顶局聚类（`scripts/hs-analysis.py`，已去重）∩ 低争夺度（登顶样本出场率）∩ 全段位弱数据三者交集 = 技能溢价形态；但**样本量决定结论级别**（去重后 2~3 局的簇只配「方向性证据」），且要区分「阵容绝活」与「玩家绝活」（同一玩家多套阵容=玩家强，不是阵容强）
4. 采样工具新旧形状不一：部分响应为精简结构（无 player_name/units 伤害明细），脚本按「字段缺失即跳过」容错
5. 数据源会**整体冻结**（2026-09-20 起：聚合基线一字不差、橱窗停在 09-16 单日、仅 lineups 有活动）——冻结期检测用相邻快照 md5 对比；冻结期研究转向战术层深化（星级纪律 ← counters；合成树 ← equipment-details.sourceCards），不做强度重估

## 技术栈

**前端（ui/）**：Vue 3 + Vite + TypeScript + vue-router + Tailwind CSS v4（@tailwindcss/vite，主题 token 在 `ui/src/styles/tokens.css` 的 `@theme` 块）。

```bash
npm run dev      # 开发：数据服务器(:5178) + Vite 热更新(:5173) 双进程
npm run build    # 类型检查(vue-tsc) + 构建到 dist/（改 ui/ 后必须）
npm run ui       # 使用：serve.mjs 供 dist/ + /data + /api 代理，http://localhost:5177
npm run shot     # 无头 Chrome 截图 10 个路由（回归检查，输出 /tmp/shot_*.png）
docker compose up -d --build   # Docker（OrbStack）：http://localhost:8082
```

**Docker**：多阶段构建（容器内 `npm ci`+编译前端 → 运行层只拷 serve/update-service/fetch-meta，零第三方依赖）。`./data` 挂载进容器——快照、更新日志、密钥都留宿主机。改了代码要 `--build` 重建；`WXQ_FULL` 浏览器抓取与截图脚本需要 Chrome，只在宿主机跑。

**坑：数据源会"软失败"**——HTTP 200 + `{"code":42000,"message":"系统异常…"}` 错误体（IP 级限流，高频探测会触发，数小时自动解除）。所有拉取必须校验 `code===1 && data 存在` 才落盘（fetch-meta 的 pull 已做），否则会把好快照覆盖成错误体；失败时不留空壳快照目录（UI 会把空目录当最新）。遇到大面积 42000：等，别重试。

- 8 个视图页：数据 = 版本环境 /meta、对局检索 /explorer、卡牌图鉴 /codex、阵营格局 /factions、装备搭配 /equipment；工具 = 阵容工坊 /workshop（一图流导出+阵容对比）、强度表 /tier、对局复盘 /log；另有英雄详情 /hero/:id
- 第三方 API 无 CORS 头：浏览器一律走 serve.mjs 的 `/api/datatft/*` 代理（dev 由 Vite proxy 转发）；canvas 分享图引图片必须走 `/api/img?u=` 代理，否则 toDataURL 被跨域污染（绘制工具在 `ui/src/lib/board.ts`）
- TS 类型在 `ui/src/types.ts`；阵容/复盘/强度表存 localStorage（stores/）
- 设计语言 **v4**（2026-09-15 用户定版）：**结构与组件交互对齐 datawxq.com**（浮动胶囊顶栏+全局搜索、白卡面板、可排序表头、红绿趋势线、阵容卡=左卡体+右统计面板、米白卡 `--cream`），**配色取自官网 wxq.qq.com**（token 注释里有取色值）：蓝紫 periwinkle 主色 `--color-royal-600 #5661c8`（官网按钮 #5a63c5 域）、薰衣草天空底、深靛墨 `#262b4d`、宋体双 tone 大标语（`.statement`，`Songti SC`）。金色只保留「第一名/5阶」语义；阴影禁灰黑。改 UI 前先读 frontend-design skill。演进史：v1 曜石金 ✗ → v2 深靛 dashboard ✗ → v3 自创浅紫 → **v4 datawxq 结构+官网取色**。视觉基准方法：无头 Chrome 截两站各页 + evaluate 抓 CSS 变量 + PIL 采样像素色，改版前可重跑对比。three.js/Hero3D 已弃用（v4 用 CSS 悬浮卡拼贴），组件文件留存未引用
- **交互层**（2026-09-16，点开看内容）：阵容卡/成型阵容行可点 → `LineupDetail` 弹窗（数据面板+Tab 阵容/装备推荐[三神装|单装]/棋手+复制阵容码，宽 980px）；阵容卡里的棋子/阵营成员 chip/榜单英雄行可点 → 英雄详情页；榜单棋手行 → 棋手抽屉（技能/秘技/专属）；对局检索的每条对局可展开 → units 明细（装备/等级/伤害/承伤/击倒/MVP）。原则：**一切展示性元素都要有下一步**（查看详情/跳详情页/展开），XModal 支持 width prop

**Vue/构建坑备忘**：视图组件必须单根节点（RouterView 外包了 Transition）；CJK 文字别加 italic 类（合成斜体挤出容器）；TypeScript 锁 ~5.9（TS7 与 vue-tsc 不兼容；在项目根目录跑 `npx vue-tsc` 会装错版本报 ERR_PACKAGE_PATH_NOT_EXPORTED，必须在 ui/ 下跑）；Vue 模板别在 `<template>` 上混用 `#default` 与 `v-else-if`（编译器崩溃）；CSS 里给 `<span>` 设宽高前先想 inline（LineupCard 卡格事件）；改完 UI 必须 `npm run build && npm run shot` 看截图；5177 可能有上会话残留的旧 serve 进程（后台启动 EADDRINUSE 静默退出，启动后看日志确认）。

**数据管道（scripts/）**：Node 22 + playwright-core（驱动系统 Chrome，仅浏览器抓取用）；数据全 JSON 无数据库。datawxq 是 Vue SPA，静态 curl 拿不到数据；卡牌库打包在站点 `/assets/seo-*.js` 模块内，需同源浏览器环境 import 提取。
