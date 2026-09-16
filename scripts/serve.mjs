#!/usr/bin/env node
/**
 * serve.mjs — wxq-lab 本地开发/使用服务器（零依赖）
 * /          → app/（前端）
 * /data/     → data/（JSON 数据）
 * /__/meta-dirs → 可用数据快照日期列表
 */
import http from 'node:http';
import { createReadStream, existsSync, statSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runUpdate, readUpdateLog, isUpdating, buildCoachContext } from './update-service.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const APP = path.join(ROOT, 'app');   // 旧版原型回退
const DATA = path.join(ROOT, 'data');
const PORT = process.env.PORT || 5177;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8', '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = decodeURIComponent(url.pathname);

  if (p === '/__/meta-dirs') {
    const dirs = existsSync(DATA) && existsSync(path.join(DATA, 'meta'))
      ? readdirSync(path.join(DATA, 'meta'), { withFileTypes: true })
          .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
          .map((d) => d.name).sort().reverse()
      : [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(dirs));
  }

  // 图片代理：canvas 绘图需要同源图片，否则 toDataURL 被跨域污染。仅放行资源域名白名单。
  if (p === '/api/img') {
    const target = url.searchParams.get('u') || '';
    let host = '';
    try { host = new URL(target).host; } catch { /* 非法 url */ }
    if (!['static.datatft.com', 'game.gtimg.cn'].includes(host)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('domain not allowed');
    }
    try {
      const r = await fetch(target, { headers: { 'User-Agent': 'wxq-lab/0.2' } });
      if (!r.ok) { res.writeHead(502); return res.end('upstream ' + r.status); }
      res.writeHead(200, {
        'Content-Type': r.headers.get('content-type') || 'image/png',
        'Cache-Control': 'public, max-age=86400',
      });
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(String(err));
    }
    return;
  }

  // 手动数据更新：跑 fetch-meta 拉当日快照（并发锁 + 120s 上限在 update-service 内）
  if (p === '/api/update' && req.method === 'POST') {
    try {
      const result = await runUpdate();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(err.code === 'BUSY' ? 409 : 500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: String(err.message || err) }));
    }
    return;
  }
  if (p === '/api/update-log') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(await readUpdateLog(30)));
    return;
  }
  if (p === '/api/update-status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ updating: isUpdating() }));
  }

  // 教练问答：DeepSeek 流式代理（key 只存服务端 data/.secrets.json，绝不进前端）
  if (p === '/api/coach' && req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      let secrets = null;
      try { secrets = JSON.parse(await readFile(path.join(DATA, '.secrets.json'), 'utf8')); } catch { /* 未配置 */ }
      const key = secrets?.deepseekApiKey;
      if (!key) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: '未配置 API key（data/.secrets.json）' }));
      }
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { /* 保持空 */ }
      const question = String(body.question || '').slice(0, 4000);
      const history = Array.isArray(body.history) ? body.history.slice(-20) : [];
      if (!question.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: '问题不能为空' }));
      }
      try {
        const ctx = await buildCoachContext();
        const system = [
          '你是「万象棋房」的私人教练，一位《王者万象棋》经验老手。用户是想提升竞技水平的玩家。',
          '回答原则：',
          '1. 结论先行，具体可执行：建议落到「第几回合 / 什么血量经济条件下该做什么」的粒度，不说「注意运营」这类空话。',
          '2. 数值只引用下面提供的版本数据；数据里没有的可以凭经验推断，但必须标明「推断」；绝不编造精确数值。',
          '3. 回答末尾尽量给一条可迁移的判断原则，让用户下次自己会判断。',
          '4. 简体中文，语气像靠谱的老手朋友：直接、不绕弯、不堆砌客套。',
          '5. 用户问阵容/英雄时，结合下面的榜单数据说明「为什么强/弱」，别只报名次。',
          '',
          `【当前版本数据 · 来源：万象棋大数据 · 快照 ${ctx.date ?? '无'} · 近7天】`,
          ctx.text,
        ].join('\n');
        const upstream = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: secrets.deepseekModel || 'deepseek-v4-pro',
            messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: question }],
            stream: true,
            temperature: 0.7,
          }),
        });
        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => '');
          const friendly = upstream.status === 402
            ? 'DeepSeek 余额不足，请到 platform.deepseek.com 充值后重试'
            : `DeepSeek ${upstream.status}: ${detail.slice(0, 300)}`;
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: friendly }));
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        const reader = upstream.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        res.end();
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: String(err.message || err) }));
        } else {
          res.end();
        }
      }
    });
    return;
  }

  // 万象棋大数据 API 代理（第三方接口无 CORS 头，须由本服务端转发）
  if (p.startsWith('/api/datatft/')) {
    const upstream = 'https://api.datatft.com/wzwxq/' + p.slice('/api/datatft/'.length);
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const body = Buffer.concat(chunks).toString() || '{}';
        const r = await fetch(upstream, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'wxq-lab/0.2' },
          body,
        });
        res.writeHead(r.status, { 'Content-Type': 'application/json' });
        res.end(await r.text());
      } catch (err) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
    return;
  }

  let file;
  if (p.startsWith('/data/')) file = path.join(DATA, p.slice(6));
  else if (existsSync(DIST)) file = path.join(DIST, p === '/' ? 'index.html' : p.slice(1));
  else file = path.join(APP, p === '/' ? 'index.html' : p.slice(1));

  // 禁止读取点文件（.secrets.json 等）与目录穿越
  if (p.split('/').some((seg) => seg.startsWith('.')) || file.includes('..')) {
    res.writeHead(404);
    return res.end('not found');
  }

  const allowed = [DIST, APP, DATA];
  if (!allowed.some((dir) => file.startsWith(dir))) { res.writeHead(403); return res.end(); }
  if (!existsSync(file) || !statSync(file).isFile()) {
    // SPA 回退（Vue router history 兜底）
    const index = existsSync(DIST) ? path.join(DIST, 'index.html') : path.join(APP, 'index.html');
    if (existsSync(index) && !p.startsWith('/data/')) {
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      return createReadStream(index).pipe(res);
    }
    res.writeHead(404); return res.end('not found');
  }

  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[x] 端口 ${PORT} 已被占用。换个端口：PORT=5199 node scripts/serve.mjs\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  const mode = process.env.WXQ_MODE === 'dev' ? '数据服务' : 'wxq-lab';
  const app = existsSync(DIST) ? 'dist/' : 'app/（旧版原型）';
  console.log(`\n  ${mode} 已启动 → http://localhost:${PORT}  （前端: ${app}）\n`);
});
