import { h, render } from "https://cdn.skypack.dev/preact";
import { useEffect, useState } from "https://cdn.skypack.dev/preact/hooks";
import htm from "https://unpkg.com/htm?module";
import { Channel } from "https://cdn.skypack.dev/@eyalsh/async-channels";

// Initialize htm with Preact
const html = htm.bind(h);

function Todo({ item: { label, done }, ch }) {
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

function Todos({ items, ch }) {
  return html`<div class="list-group">
    ${items.map((item) => html`<${Todo} item=${item} ch=${ch} />`)}
  </div>`;
}

function AddTodoForm({ ch }) {
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

const sleep = (duration) => {
  return new Promise((res) => {
    setTimeout(() => res(), duration);
  });
};

const ch = new Channel(0, { debug: true });

function App() {
  const [todos, updateTodos] = useState([
    { label: "hello", done: false },
    { label: "world", done: true },
    { label: "1", done: true },
    { label: "2", done: true },
    { label: "3", done: true },
  ]);
  useEffect(() => {
    const ctrl = new AbortController();

    (async () => {
      const [todo, ok] = await ch.receive(ctrl);
      if (!ok) return;
      await sleep(500); // Doing heavy work

      const index = todos.findIndex(({ label }) => label === todo.label);

      const newTodos = [
        ...todos.slice(0, index),
        todo,
        ...todos.slice(index + 1, todos.length),
      ];

      console.log({ index, todos, newTodos });

      if (index >= 0) {
        updateTodos(newTodos);
      } else {
        updateTodos([...todos, todo]);
      }
    })().catch((err) => console.error(err));

    return () => ctrl.abort();
  }, [todos]);
  return html`<div class="container">
    <${Todos} items=${todos} ch=${ch} />
    <${AddTodoForm} ch=${ch} />
  </div>`;
}

render(html`<${App} />`, document.getElementById("main"));
