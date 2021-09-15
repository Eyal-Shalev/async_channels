import { html } from "./utils.js";
import Router from "./deps/preact-router.js";
import { Link } from "./deps/preact-router/match.js";
import { Home } from "./Home.js";
import { Exchanges } from "./Exchanges.js";

export function App() {
  return html`<div>
    <nav>
      <${Link} activeClassName="active" href="/">
        Home
      </${Link}>
    </nav>
    <${Router}>
      <${Home} path="/" />
      <${Exchanges} path="/exchanges" />
    </${Router}>
  </div>`;
}
