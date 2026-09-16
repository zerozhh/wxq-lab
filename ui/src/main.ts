import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { vTip } from './lib/tip';
import './styles/tokens.css';
import './styles/main.css';

createApp(App).use(router).directive('tip', vTip).mount('#app');
