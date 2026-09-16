<script setup lang="ts">
// 教练问答：DeepSeek 流式对话，system 里注入最新快照数据（服务端 /api/coach 组装）
import { nextTick, onMounted, ref, watch } from 'vue';

interface Msg { role: 'user' | 'assistant'; content: string }

const LS_KEY = 'wxq.coach.messages';
const messages = ref<Msg[]>(read());
const input = ref('');
const streaming = ref(false);
const error = ref('');
const snapDate = ref('');
const listEl = ref<HTMLElement | null>(null);
let ctrl: AbortController | null = null;

const SUGGESTIONS = [
  '当前版本上分该围绕哪个英雄？',
  '热门阵容的运营节奏是怎样的？',
  '哪个棋手适合新手练？',
  '强度表里 S 阶该怎么划？',
];

function read(): Msg[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    return Array.isArray(raw) ? raw.slice(-60) : [];
  } catch { return []; }
}
function save() {
  localStorage.setItem(LS_KEY, JSON.stringify(messages.value.slice(-60)));
}

const scrollBottom = () => nextTick(() => {
  const el = listEl.value;
  if (el) el.scrollTop = el.scrollHeight;
});
watch(() => messages.value.map((m) => m.content.length).join(','), scrollBottom);

onMounted(async () => {
  try {
    const dirs: string[] = await (await fetch('/__/meta-dirs')).json();
    if (dirs.length) snapDate.value = dirs[0];
  } catch { /* 静态预览 */ }
  scrollBottom();
});

async function send(text?: string) {
  const q = (text ?? input.value).trim();
  if (!q || streaming.value) return;
  input.value = '';
  error.value = '';
  messages.value.push({ role: 'user', content: q });
  const reply: Msg = { role: 'assistant', content: '' };
  messages.value.push(reply);
  streaming.value = true;
  save();
  ctrl = new AbortController();

  try {
    const history = messages.value.slice(0, -1).slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));
    const res = await fetch('/api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, history }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    // 解析 SSE：data: {choices:[{delta:{content}}]}
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const delta = JSON.parse(payload).choices?.[0]?.delta;
          if (delta?.content) reply.content += delta.content;
        } catch { /* 半包忽略，下轮补 */ }
      }
    }
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    if (!aborted) error.value = String((e as Error).message || e);
    if (!reply.content && aborted) reply.content = '（已停止）';
  } finally {
    streaming.value = false;
    ctrl = null;
    if (!reply.content && !error.value) reply.content = '（教练没有返回内容，重试一下）';
    save();
    scrollBottom();
  }
}
function stopStream() { ctrl?.abort(); }
function clearChat() {
  if (messages.value.length && !confirm('清空全部对话记录？')) return;
  messages.value = [];
  error.value = '';
  save();
}

// 轻量 Markdown 渲染（先转义再转换，只支持教练实际会用的：**粗体** / `code` / 列表 / # 标题）
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inlineMd = (s: string) =>
  s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>');
function mdToHtml(src: string): string {
  const out: string[] = [];
  let inList = false;
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
  for (const raw of esc(src).split('\n')) {
    const line = raw.trimEnd();
    if (/^[-*]\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineMd(line.replace(/^[-*]\s+/, ''))}</li>`);
    } else if (/^\d+\.\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineMd(line.replace(/^\d+\.\s+/, ''))}</li>`);
    } else if (/^#{1,6}\s/.test(line)) {
      closeList();
      out.push(`<div class="md-h">${inlineMd(line.replace(/^#{1,6}\s/, ''))}</div>`);
    } else if (!line.trim()) {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inlineMd(line)}</p>`);
    }
  }
  closeList();
  return out.join('');
}
</script>

<template>
<div>
  <div class="view-head spread">
    <div>
      <h1 class="view-title title-display">教练</h1>
      <p class="view-desc">万象棋老手坐诊：结合最新快照数据回答上分、运营、阵容问题，或者陪你推演一个思路。</p>
    </div>
    <div class="row">
      <span v-if="snapDate" class="chip chip-accent">已注入快照 {{ snapDate }}</span>
      <button class="btn btn-sm btn-danger" :disabled="!messages.length" @click="clearChat">清空对话</button>
    </div>
  </div>

  <section class="panel coach-panel">
    <div ref="listEl" class="coach-list">
      <!-- 空态 -->
      <div v-if="!messages.length" class="coach-empty">
        <div class="big">有什么想不通的，直接问</div>
        <div class="muted" style="margin-bottom:16px">教练能看到最新一期的登顶率、阵容与装备数据。</div>
        <div class="row" style="justify-content:center">
          <button v-for="s in SUGGESTIONS" :key="s" class="chip chip-accent sugg" @click="send(s)">{{ s }}</button>
        </div>
      </div>

      <!-- 消息 -->
      <template v-for="(m, i) in messages" :key="i">
        <div v-if="m.role === 'user'" class="bubble user">{{ m.content }}</div>
        <div v-else class="bubble coach">
          <span v-if="m.content" class="prose" v-html="mdToHtml(m.content)" />
          <span v-else class="muted">教练思考中…</span>
        </div>
      </template>
      <div v-if="error" class="bubble err">{{ error }}</div>
    </div>

    <div class="coach-input">
      <textarea
        v-model="input" class="input" rows="2"
        placeholder="问教练…（Enter 发送，Shift+Enter 换行）"
        @keydown.enter.exact.prevent="send()"
      />
      <button v-if="streaming" class="btn" @click="stopStream">停止</button>
      <button v-else class="btn btn-accent" :disabled="!input.trim()" @click="send()">发送</button>
    </div>
  </section>
</div>
</template>

<style scoped>
.coach-panel { display: flex; flex-direction: column; padding: 0; overflow: hidden; }
.coach-list {
  flex: 1; overflow-y: auto; padding: 18px 20px;
  min-height: 320px; max-height: calc(100vh - 300px);
  display: flex; flex-direction: column; gap: 12px;
}
.coach-empty { margin: auto; text-align: center; padding: 40px 0; }
.coach-empty .big { font-size: 22px; font-weight: 850; color: var(--color-ink-hi); margin-bottom: 6px; }
.sugg { cursor: pointer; font-size: 12.5px; padding: 5px 12px; }
.sugg:hover { border-color: var(--accent); }

.bubble {
  max-width: 78ch; padding: 10px 14px; border-radius: 14px;
  font-size: 13.5px; line-height: 1.7; white-space: pre-wrap; word-break: break-word;
}
.bubble.user {
  align-self: flex-end; color: #ffffff;
  background: var(--color-royal-600); border-bottom-right-radius: 4px;
  box-shadow: 0 6px 16px -8px rgb(86 97 200 / 0.6);
}
.bubble.coach {
  align-self: flex-start; color: var(--color-ink-hi);
  background: var(--color-sky-hi); border: 1px solid rgb(38 43 77 / 0.08);
  border-bottom-left-radius: 4px;
}
.bubble.err {
  align-self: flex-start; color: var(--color-alert);
  background: rgb(195 61 46 / 0.07); border: 1px solid rgb(195 61 46 / 0.28);
}
.prose :deep(code) { background: var(--color-sky); border-radius: 4px; padding: 0 4px; }
.prose :deep(p) { margin: 0 0 8px; }
.prose :deep(p:last-child) { margin-bottom: 0; }
.prose :deep(ul) { margin: 0 0 8px; padding-left: 18px; }
.prose :deep(li) { margin: 3px 0; }
.prose :deep(.md-h) { font-weight: 800; margin: 10px 0 6px; color: var(--color-ink-hi); }

.coach-input {
  display: flex; gap: 10px; align-items: flex-end;
  padding: 12px 16px; border-top: 1px solid rgb(38 43 77 / 0.08);
  background: rgb(255 255 255 / 0.7);
}
.coach-input textarea { flex: 1; resize: none; }
</style>
