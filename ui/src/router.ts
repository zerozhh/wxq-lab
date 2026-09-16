import { createRouter, createWebHashHistory } from 'vue-router';
import MetaView from './views/MetaView.vue';
import CodexView from './views/CodexView.vue';
import WorkshopView from './views/WorkshopView.vue';
import LogView from './views/LogView.vue';
import HeroDetailView from './views/HeroDetailView.vue';
import EquipmentFitView from './views/EquipmentFitView.vue';
import TierView from './views/TierView.vue';
import FactionsView from './views/FactionsView.vue';
import ExplorerView from './views/ExplorerView.vue';
import CoachView from './views/CoachView.vue';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/meta' },
    { path: '/coach', component: CoachView },
    { path: '/meta', component: MetaView },
    { path: '/explorer', component: ExplorerView },
    { path: '/codex', component: CodexView },
    { path: '/factions', component: FactionsView },
    { path: '/equipment', component: EquipmentFitView },
    { path: '/workshop', component: WorkshopView },
    { path: '/tier', component: TierView },
    { path: '/log', component: LogView },
    { path: '/hero/:id', component: HeroDetailView },
  ],
});
