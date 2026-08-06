import { createApp } from 'vue';
import App from './src/App.vue';
import { install } from './src/main';
import "./src/main.css";

const DEBUG = false;
if (!DEBUG) {
  let div = document.getElementById('mtool-translator-plugin-app');
  if (!div) {
    div = document.createElement('div');
    div.id = 'mtool-translator-plugin-app';
    document.body.appendChild(div);
  }
}
createApp(App).mount('#mtool-translator-plugin-app');
install();
