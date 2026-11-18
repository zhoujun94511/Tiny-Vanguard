import { createApp } from 'vue';
import App from './App.vue';
import { APP_CONFIG } from './config/appConfig';
import './style.css';

document.title = APP_CONFIG.title;
createApp(App).mount('#app');
