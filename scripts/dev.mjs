#!/usr/bin/env node
/**
 * dev.mjs — 同时启动数据服务器(:5178)与 Vite 开发服务器(:5173)
 * 数据端口是唯一约定值：这里注入 PORT=5178，vite.config.ts 的代理指向同一个端口。
 * 用法: cd ui && npm run dev   （或根目录 npm run dev）
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_PORT = process.env.WXQ_DATA_PORT || '5178';
const VITE_PORT = process.env.WXQ_VITE_PORT || '5173';

// 等数据服务器就绪再起 Vite，避免代理 ECONNREFUSED
async function waitReady(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const data = spawn('node', [path.join(ROOT, 'scripts/serve.mjs')], {
  stdio: 'inherit',
  env: { ...process.env, PORT: DATA_PORT, WXQ_MODE: 'dev' },
});

const ready = await waitReady(`http://localhost:${DATA_PORT}/data/heroes.json`);
if (!ready) {
  console.error(`\n[x] 数据服务器未能在 :${DATA_PORT} 就绪（端口被占用？）— Vite 不启动\n`);
  data.kill();
  process.exit(1);
}
console.log(`\n  wxq-lab dev\n  ➜ 前端     http://localhost:${VITE_PORT}\n  ➜ 数据服务  http://localhost:${DATA_PORT}\n`);

const vite = spawn('npx', ['vite', '--port', VITE_PORT], {
  cwd: path.join(ROOT, 'ui'),
  stdio: 'inherit',
  env: { ...process.env, WXQ_DATA_PORT: DATA_PORT },
});

const stop = () => { data.kill(); vite.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
vite.on('exit', stop);
