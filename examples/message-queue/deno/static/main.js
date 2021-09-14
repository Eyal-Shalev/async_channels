import { render } from "./deps/preact.js";
import { App } from "./App.js";
import { html } from "./utils.js";

render(html`<${App} />`, document.getElementById("app"));
