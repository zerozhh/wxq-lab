<script setup lang="ts">
// Hero3D —— 悬浮卡牌夜空：圆角卡牌 + 星尘 + 棋盘网格，鼠标视差
// 减动效：静态一帧；卸载：完整释放
import { onMounted, onUnmounted, ref } from 'vue';
import * as THREE from 'three';

const host = ref<HTMLDivElement | null>(null);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let raf = 0;
let resizeObs: ResizeObserver | null = null;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

onMounted(() => {
  const el = host.value!;
  const w = el.clientWidth, h = el.clientHeight;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  el.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x20264e, 14, 30);

  camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
  camera.position.set(0, 1.2, 11);

  // 灯光：主蓝 + 薰衣草补光
  scene.add(new THREE.AmbientLight(0x8899ff, 1.1));
  const key = new THREE.PointLight(0x5b85ff, 90, 44);
  key.position.set(6, 6, 6);
  scene.add(key);
  const fill = new THREE.PointLight(0xa6ccff, 55, 44);
  fill.position.set(-7, -2, 4);
  scene.add(fill);

  // 悬浮卡牌：圆角矩形挤出
  const cardShape = new THREE.Shape();
  const cw = 1.5, ch = 2.1, r = 0.18;
  cardShape.moveTo(-cw / 2 + r, -ch / 2);
  cardShape.lineTo(cw / 2 - r, -ch / 2);
  cardShape.quadraticCurveTo(cw / 2, -ch / 2, cw / 2, -ch / 2 + r);
  cardShape.lineTo(cw / 2, ch / 2 - r);
  cardShape.quadraticCurveTo(cw / 2, ch / 2, cw / 2 - r, ch / 2);
  cardShape.lineTo(-cw / 2 + r, ch / 2);
  cardShape.quadraticCurveTo(-cw / 2, ch / 2, -cw / 2, ch / 2 - r);
  cardShape.lineTo(-cw / 2, -ch / 2 + r);
  cardShape.quadraticCurveTo(-cw / 2, -ch / 2, -cw / 2 + r, -ch / 2);
  const geo = new THREE.ExtrudeGeometry(cardShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3 });

  const palette = [0x4a79ff, 0x70b7ff, 0xa6ccff, 0x2c3468];
  const cards: THREE.Mesh[] = [];
  const layout = [
    { p: [-3.4, 0.9, -1], rx: 0.2, ry: 0.5 },
    { p: [-1.4, -1.1, 0.6], rx: -0.12, ry: -0.35 },
    { p: [0.2, 1.4, -0.6], rx: 0.15, ry: 0.2 },
    { p: [2.1, -0.6, 0.4], rx: -0.18, ry: 0.42 },
    { p: [3.6, 1.1, -1.6], rx: 0.1, ry: -0.5 },
    { p: [-4.8, -1.4, -2.4], rx: 0.08, ry: 0.3 },
    { p: [4.9, -1.7, -2.6], rx: -0.06, ry: -0.28 },
  ];
  layout.forEach((cfg, i) => {
    const c = palette[i % palette.length];
    const mat = new THREE.MeshPhysicalMaterial({
      color: c,
      metalness: 0.35,
      roughness: 0.25,
      transparent: true,
      opacity: i % 3 === 0 ? 0.92 : 0.78,
      emissive: c,
      emissiveIntensity: 0.22,
      clearcoat: 0.6,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cfg.p[0], cfg.p[1], cfg.p[2]);
    mesh.rotation.set(cfg.rx, cfg.ry, (Math.sin(i * 2.3) * 8 * Math.PI) / 180);
    mesh.userData.phase = i * 1.7;
    scene!.add(mesh);
    cards.push(mesh);
  });

  // 星尘
  const starPos = new Float32Array(160 * 3);
  for (let i = 0; i < 160; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 24;
    starPos[i * 3 + 1] = (Math.random() - 0.5) * 12;
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 14 - 2;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xa6ccff, size: 0.05, transparent: true, opacity: 0.7,
    map: makeDot(), alphaTest: 0.01, depthWrite: false,
  }));
  scene.add(stars);

  // 棋盘网格（地面）
  const grid = new THREE.GridHelper(40, 46, 0x2c3468, 0x1c2148);
  grid.position.y = -3.2;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.5;
  scene.add(grid);

  // 鼠标视差
  let mx = 0, my = 0;
  const onMove = (e: MouseEvent) => {
    const rect = el.getBoundingClientRect();
    mx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    my = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  };
  el.addEventListener('mousemove', onMove);

  const render = (t: number) => {
    if (!scene || !camera || !renderer) return;
    for (const card of cards) {
      const ph = card.userData.phase as number;
      card.position.y += Math.sin(t * 0.0006 + ph) * 0.0022;
      card.rotation.z += Math.sin(t * 0.0004 + ph) * 0.0004;
    }
    stars.rotation.y = t * 0.00004;
    camera.position.x += (mx * 0.9 - camera.position.x) * 0.04;
    camera.position.y += (1.2 - my * 0.6 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  };

  if (reduced) {
    render(0);
  } else {
    const loop = (t: number) => { render(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
  }

  resizeObs = new ResizeObserver(() => {
    if (!renderer || !camera || !el) return;
    const nw = el.clientWidth, nh = el.clientHeight;
    if (!nw || !nh) return;
    renderer.setSize(nw, nh);
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
  });
  resizeObs.observe(el);

  (el as HTMLElement & { _cleanup?: () => void })._cleanup = () => {
    el.removeEventListener('mousemove', onMove);
  };
});

function makeDot(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

onUnmounted(() => {
  cancelAnimationFrame(raf);
  resizeObs?.disconnect();
  host.value && (host.value as HTMLElement & { _cleanup?: () => void })._cleanup?.();
  scene?.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m?.dispose?.();
  });
  renderer?.dispose();
});
</script>

<template>
  <div ref="host" class="h-full w-full" aria-hidden="true" />
</template>
