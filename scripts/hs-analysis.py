#!/usr/bin/env python3
"""hs-analysis.py — 高强度对局样本分析（王者段位代理池）
用法: python3 scripts/hs-analysis.py [日期] [强度阈值]
读 data/meta/<日期>/explore-sample.json，输出强度分布、阵容原型聚类、原型胜率、棋手/天赋榜。
"""
import json, sys, itertools
from collections import Counter, defaultdict

dirs = sorted(d for d in __import__('os').listdir('data/meta') if d[:2] == '20')
date = sys.argv[1] if len(sys.argv) > 1 else dirs[-1]
data = json.load(open(f'data/meta/{date}/explore-sample.json'))
# 橱窗去重：深分页会重复返回同一局，按 gameTime 唯一化（2026-09-21 对抗性审查发现）
seen = {}
for m in data['matches']:
    # 键 = gameTime + 阵容签名：防深分页重复，也防不同对局的毫秒级时间戳碰撞误合并
    sig = m['gameTime'], tuple(sorted(u['id'] for u in m.get('units', [])))
    seen[sig] = m
ms = list(seen.values())
top_th = int(sys.argv[2]) if len(sys.argv) > 2 else data['thresholds']['top']
print(f"样本（去重后）{len(ms)} 局（{date} 采样，原始条目 {data['total']}）| 阈值 high={data['thresholds']['high']} top={top_th}")

top = [m for m in ms if m['totalLevel'] >= top_th]
print(f"顶级局（总等级≥{top_th}）: {len(top)} 局 · 登顶占比 {sum(1 for m in top if m['placement']==1)/max(1,len(top))*100:.0f}%")

# ---- 阵容原型聚类：以 heroIds 集合 Jaccard ≥0.6 归组到代表 ----
def jaccard(a, b):
    a, b = set(a), set(b)
    return len(a & b) / len(a | b)

groups = []  # [ {heroIds, members:[]} ]
for m in sorted(top, key=lambda x: -x['totalLevel']):
    placed = False
    for g in groups:
        if jaccard(m['heroIds'], g['heroIds']) >= 0.6:
            g['members'].append(m); placed = True; break
    if not placed and len(groups) < 40:
        groups.append({'heroIds': list(m['heroIds']), 'members': [m]})

rows = []
for g in groups:
    mem = g['members']
    if len(mem) < 5: continue
    hero_count = Counter(h for m in mem for h in m['heroNames']).most_common(7)
    rows.append({
        'n': len(mem),
        'first': sum(1 for m in mem if m['placement'] == 1) / len(mem),
        'top3': sum(1 for m in mem if m['placement'] <= 3) / len(mem),
        'avgPlace': sum(m['placement'] for m in mem) / len(mem),
        'heroes': hero_count,
        'core': '·'.join(h for h, _ in hero_count[:4]),
    })
rows.sort(key=lambda r: -r['n'])
print(f"\n=== 高强度局阵容原型（≥5局，按局数）===")
for r in rows[:12]:
    print(f"  {r['n']:3d}局 登顶{r['first']*100:3.0f}% 前三{r['top3']*100:3.0f}% 均次{r['avgPlace']:.2f}  {r['core']}")

# ---- 高强度局棋手榜 ----
cmd = defaultdict(lambda: [0, 0])
for m in top:
    c = cmd[m['commander']]; c[0] += 1
    if m['placement'] == 1: c[1] += 1
print(f"\n=== 高强度局棋手（≥8局，按登顶率）===")
for name, (n, f) in sorted(cmd.items(), key=lambda x: -(x[1][1] / max(1, x[1][0]))):
    if n >= 8:
        print(f"  {name:5s} {n:3d}局 登顶{f/n*100:3.0f}%")

# ---- 天赋榜（高强度局）----
tal = Counter(t for m in top for t in m['talents'])
print(f"\n=== 高强度局天赋 top10 ===")
for t, n in tal.most_common(10):
    print(f"  {t} ×{n}")
