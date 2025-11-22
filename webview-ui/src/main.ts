import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./styles/main.css";
import { useBoardStore } from "./store/board";
import type { ExtensionMessage } from "./types";

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

const store = useBoardStore();

window.addEventListener("message", (event: MessageEvent<ExtensionMessage>) => {
  const message = event.data;
  switch (message.type) {
    case "boardUpdate":
      store.setBoard(message.board, message.priorityStyles);
      store.setParseWarning(undefined);
      break;
    case "parseWarning":
      store.setParseWarning(message.message);
      break;
    case "agentsDetected":
      store.setAgents(message.agents, message.defaultAgent, message.lastUsed);
      break;
  }
});

store.requestInitialData();

app.mount("#app");
