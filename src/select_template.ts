import { Receiver, Sender } from "./channel.ts";
import { UnreachableError } from "./internal/errors.ts";
import {
  isSelectOperation,
  select as realSelect,
  SelectOperation,
} from "./select.ts";

/**
 * import { Channel } from "./channel.ts";
 * import { select } from "./selectTemplate.ts";
 * const ch1 = new Channel<string>()
 * const ch2 = new Channel<string>()
 * const res = await select`
 *   case ${ch1}: $((x: string) => `ch1 got ${x}`)
 *   case ${[ch2, "greet"]}: $(() => console.log("sent greet"))
 *   default: $(() => console.log("no channel is ready"))
 * `;
 */
export async function select(
  strings: TemplateStringsArray,
  ...args: (SelectOperation<unknown> | SelectHandler<unknown, unknown>)[]
) {
  let defaultFn: SelectHandler<void, unknown> | undefined;
  const ops: SelectOperation<unknown>[] = [];
  const chToFn = new Map<
    Sender<unknown> | Receiver<unknown>,
    SelectHandler<unknown, unknown>
  >();
  for (let i = 0; i < strings.length; i += 2) {
    const prefix = strings[i].trim();
    if (prefix === "") continue;
    console.assert(
      prefix === "case" || prefix === "default:",
      `"${prefix}" is neither "case", nor "default:"`,
    );
    if (prefix === "case") {
      const sep = strings[i + 1].trim();
      console.assert(sep === ":");
      const op = args[i];
      const fn = args[i + 1];
      if (!isSelectOperation(op)) {
        throw new TypeError(
          "select operation must be (Channel | [Channel, unknown])",
        );
      }
      if (!isSelectHandler(fn)) {
        throw new TypeError(
          "select handlers must be functions",
        );
      }
      const ch = Array.isArray(op) ? op[0] : op;
      chToFn.set(ch, fn);
      ops.push(op);
    } else {
      const fn = args[i];
      if (!isSelectHandler(fn)) {
        throw new TypeError(
          "select handlers must be functions",
        );
      }
      defaultFn = fn;
    }
  }

  const [val, ch] = await realSelect(ops, defaultFn ? { default: void 0 } : {});
  if (!ch && defaultFn) {
    return defaultFn();
  } else if (!ch) {
    throw new UnreachableError();
  }
  const fn = chToFn.get(ch);
  if (fn) {
    return fn(val);
  }
  throw new UnreachableError();
}

type SelectHandler<T, TOut> = (val?: T) => TOut;
function isSelectHandler(x: unknown): x is SelectHandler<unknown, unknown> {
  return typeof x === "function";
}
