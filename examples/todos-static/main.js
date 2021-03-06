import {
  createContext,
  h,
  render,
} from "https://cdn.skypack.dev/pin/preact@v10.5.14-NU6DIzRE0F11UYcL6Ija/mode=imports,min/optimized/preact.js";
import {
  useContext,
  useEffect,
  useState,
} from "https://cdn.skypack.dev/pin/preact@v10.5.14-NU6DIzRE0F11UYcL6Ija/mode=imports,min/optimized/preact/hooks.js";
import htm from "https://cdn.skypack.dev/pin/htm@v3.1.0-Lnrl6ooU0xR8YCDnwwW6/mode=imports,min/optimized/htm.js";
import { Channel } from "https://cdn.skypack.dev/@eyalsh/async_channels@^1.0.0-beta4?dts";

// Initialize htm with Preact
const html = htm.bind(h);

function Todo({ item: { label, done } }) {
  const ch = useContext(UpdateChan);
  const [enabled, setEnabled] = useState(true);
  const toggle = (ev) => {
    ev.preventDefault();
    setEnabled(false);
    ch.send({ label, done: ev.target.checked })
      .catch((err) => console.error(err))
      .then(() => {
        setEnabled(true);
      });
  };
  return html`<div class="list-group-item">
    <input class="form-check-input me-1" id="${label}"
      disabled="${!enabled}"
      checked="${done}"
      type="checkbox"
      onClick=${toggle}
      aria-label="${label}" />
    <label for="${label}">${label}</label>
  </div>`;
}

function Todos({ items }) {
  return html`<div class="list-group">
    ${items.map((item) => html`<${Todo} item=${item}/>`)}
  </div>`;
}

function AddTodoForm() {
  const ch = useContext(UpdateChan);
  const [enabled, setEnabled] = useState(true);
  const [label, setLabel] = useState("");

  const addItem = (ev) => {
    ev.preventDefault();
    setEnabled(false);
    ch.send({ label, done: false })
      .catch((err) => console.error(err))
      .then(() => {
        setLabel("");
        setEnabled(true);
      });
  };

  return html`<form class="row" onSubmit=${addItem}>
    <div class="col-11">
      <input type="text" class="form-control"
        placeholder="Label" value=${label}  disabled=${!enabled}
        onChange=${(e) => setLabel(e.target.value)} aria-label="Label" />
    </div>
    <button disabled=${!enabled} type="submit" class="btn btn-primary col-1">Add</button>
  </form>`;
}

// deno-lint-ignore no-unused-vars
const sleep = (duration) => {
  return new Promise((res) => {
    setTimeout(() => res(), duration);
  });
};
const UpdateChan = createContext(new Channel(0));

function TodoContainer() {
  const ch = useContext(UpdateChan);
  const [todos, updateTodos] = useState([]);
  useEffect(() => {
    const ctrl = new AbortController();

    (async () => {
      const [todo, ok] = await ch.get(ctrl);
      if (!ok) return;

      // Uncomment below to simulate heavy work with the value
      // await sleep(1000); // Doing heavy work

      const index = todos.findIndex(({ label }) => label === todo.label);

      if (index >= 0) {
        updateTodos([
          ...todos.slice(0, index),
          todo,
          ...todos.slice(index + 1, todos.length),
        ]);
      } else {
        updateTodos([...todos, todo]);
      }
    })().catch((err) => console.error(err));

    return () => ctrl.abort();
  }, [todos]);

  return html`<div>
    <${Todos} items=${todos} />
    <${AddTodoForm} />
  </div>`;
}

function App() {
  return html
    `<div class="container"><${UpdateChan.Provider} value="${new Channel(
      0,
    )}">
    <${TodoContainer} />
    <footer><${Clock} /></footer>
    </${UpdateChan.Provider}>
  </div>`;
}

function Clock() {
  const [timestamp, setTimestamp] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTimestamp(new Date()), 1);
    return () => clearInterval(id);
  }, []);

  return html`<span>Timestamp ${timestamp.getTime()}ms</span>`;
}

render(html`<${App} />`, document.getElementById("main"));
