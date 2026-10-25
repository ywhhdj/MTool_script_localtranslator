import { createApp } from "vue";
import App from "./src/ui/App.vue";
import "./src/main.css";
import "./src/main";
import "highlight.js/styles/atom-one-dark-reasonable.css";

const mountId = "mtool-translator-plugin-app";

function ensureMountPoint(): HTMLElement {
  let el = document.getElementById(mountId);
  if (!el) {
    el = document.createElement("div");
    el.id = mountId;
    el.style.setProperty("all", "initial");
    el.style.setProperty("display", "block");
    document.body.appendChild(el);
  }
  return el as HTMLElement;
}

createApp(App).mount(ensureMountPoint());
