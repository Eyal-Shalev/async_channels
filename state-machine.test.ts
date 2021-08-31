import { assertEquals } from "deno/testing/asserts.ts";
import { StateMachine } from "./state-machine.ts";

Deno.test("pop -> push", async () => {
  console.log();
  const stack = new StateMachine<string>();

  assertEquals(
    await Promise.all([stack.pop(), stack.push("a")])
      .then((x) => x[0]),
    "a",
  );
});

Deno.test("push -> pop", async () => {
  console.log();
  const stack = new StateMachine<string>();

  assertEquals(
    await Promise.all([stack.push("a"), stack.pop()])
      .then((x) => x[1]),
    "a",
  );
});

Deno.test("pop -> pop -> push -> push", async () => {
  console.log();
  const stack = new StateMachine<string>();

  assertEquals(
    await Promise.all([
      stack.pop(),
      stack.pop(),
      stack.push("a"),
      stack.push("b"),
    ]),
    ["a","b", undefined, undefined],
  );
});

Deno.test("push -> push -> pop -> pop", async () => {
  console.log();
  const stack = new StateMachine<string>();

  assertEquals(
    await Promise.all([
      stack.push("a"),
      stack.push("b"),
      stack.pop(),
      stack.pop(),
    ]),
    [undefined, undefined, "a","b"],
  );
});

Deno.test("push -> pop; pop -> push", async () => {
  console.log();
  const stack = new StateMachine<string>();

  assertEquals(
    await Promise.all([stack.push("a"), stack.pop()]),
    [undefined, "a"]
  )
  assertEquals(
    await Promise.all([stack.pop(), stack.push("b")]),
    ["b", undefined]
  )
});
