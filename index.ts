import { createApp } from 'vue';
import App from './src/App.vue';
import "./src/main.css";
import './src/main';

const mountId = 'mtool-translator-plugin-app';
let mountEl = document.getElementById(mountId);
if (!mountEl) {
  mountEl = document.createElement('div');
  mountEl.id = mountId;
  mountEl.style.all = 'initial';
  document.body.appendChild(mountEl);
}
createApp(App).mount(`#${mountId}`);
