#!/usr/bin/env python3
"""meta-evolution.py — 跨快照 meta 演变对照（英雄/棋手/阵容 多日）
用法: python3 scripts/meta-evolution.py 2026-09-14 2026-09-15 2026-09-20
"""
import json, sys
from collections import defaultdict

days = sys.argv[1:] or sorted(d for d in __import__('os').listdir('data/meta') if d[:2] == '20')
names = {str(h['id']): h['name'] for h in json.load(open('data/heroes.json'))}

hero_rows, cmd_rows, lu_rows = {}, {}, {}
for d in days:
    base = f'data/meta/{d}/api'
    try:
        hero_rows[d] = json.load(open(f'{base}/heroes.json'))['data']['rows']
        cmd_rows[d] = json.load(open(f'{base}/commanders.json'))['data']['rows']
        lu_rows[d] = json.load(open(f'{base}/lineups.json'))['data']['lineups']
    except FileNotFoundError:
        print(f"(跳过 {d}: 无快照)")

print(f"=== 涵盖日期: {list(hero_rows.keys())} ===\n")

# 英雄：每日登顶率
print("=== 英雄登顶率多日演变（取 09-{last} top12）===", )
last = list(hero_rows.keys())[-1]
top = sorted(hero_rows[last], key=lambda x: -x['firstRate'])[:12]
print(f"{'英雄':8s}" + ''.join(f"{d[5:]:>10s}" for d in hero_rows))
for r in top:
    hid = str(r['id'])
    line = f"{names.get(hid, hid):8s}"
    for d in hero_rows:
        m = next((x for x in hero_rows[d] if str(x['id']) == hid), None)
        line += f"{m['firstRate']*100:9.1f}%" if m else f"{'—':>10s}"
    print(line)

# 棋手
print(f"\n=== 棋手登顶率多日演变 ===")
lastc = sorted(cmd_rows[last], key=lambda x: -x['firstRate'])
print(f"{'棋手':8s}" + ''.join(f"{d[5:]:>10s}" for d in cmd_rows))
for r in lastc:
    line = f"{r['name'] or '?':8s}"
    for d in cmd_rows:
        m = next((x for x in cmd_rows[d] if x['name'] == r['name']), None)
        line += f"{m['firstRate']*100:9.1f}%" if m else f"{'—':>10s}"
    print(line)

# 阵容：按 coreHeroes 首英雄+样本量近似匹配
print(f"\n=== 热门阵容登顶率多日演变（{last} 前8，按 coreHeroes[0] 匹配）===")
def core(l): return [x['name'] if isinstance(x, dict) else x for x in (l.get('coreHeroes') or [])]
for l in sorted(lu_rows[last], key=lambda x: -x['firstRate'])[:8]:
    c = core(l)
    line = f"{'·'.join(c)[:26]:28s}"
    for d in lu_rows:
        m = next((x for x in lu_rows[d] if core(x)[:1] == c[:1] and abs(x['count'] - l['count']) < x['count'] * 0.5), None)
        line += f"{m['firstRate']*100:9.1f}%" if m else f"{'—':>10s}"
    print(line)
