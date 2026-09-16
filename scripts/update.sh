#!/usr/bin/env bash
# 每日数据更新入口
#   ./scripts/update.sh [YYYY-MM-DD]   直连 API 拉取当日统计（秒级）
#   WXQ_FULL=1 ./scripts/update.sh     浏览器全量抓取模式（页面渲染+全部JSON截获，较慢）
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d node_modules/playwright-core ]; then
  echo "[update] 安装依赖…"
  npm install --no-fund --no-audit
fi

if [ "${WXQ_FULL:-0}" = "1" ]; then
  node scripts/capture.mjs "$@"
else
  node scripts/fetch-meta.mjs "$@"
fi
