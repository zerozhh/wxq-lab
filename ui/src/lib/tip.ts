// lib/tip.ts — 全局提示浮层（v-tip 指令，值即 HTML 字符串）
let el: HTMLDivElement | null = null;

function tipEl(): HTMLDivElement {
  if (!el) {
    el = document.createElement('div');
    el.className = 'tooltip';
    el.setAttribute('hidden', '');
    document.body.append(el);
  }
  return el;
}
function move(e: MouseEvent) {
  const t = tipEl();
  if (t.hasAttribute('hidden')) return;
  const x = Math.min(e.clientX + 14, window.innerWidth - t.offsetWidth - 10);
  const y = Math.min(e.clientY + 16, window.innerHeight - t.offsetHeight - 10);
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}

export const vTip = {
  mounted(target: HTMLElement, binding: { value?: string }) {
    target.addEventListener('mouseenter', () => {
      if (!binding.value) return;
      tipEl().innerHTML = binding.value;
      tipEl().removeAttribute('hidden');
    });
    target.addEventListener('mousemove', move);
    target.addEventListener('mouseleave', () => tipEl().setAttribute('hidden', ''));
  },
};

export const tipRows = (rows: [string, string][]): string =>
  rows.map(([k, v]) => `<div class="tt-row"><span>${k}</span><b>${v}</b></div>`).join('');
