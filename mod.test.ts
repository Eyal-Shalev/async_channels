#!/usr/bin/env -S deno test --lock lock.test.json --import-map import_map.json

import { assertEquals } from "deno/testing/asserts.ts";
import { AsyncStack } from "./mod.ts";

Deno.test("pop -> push", async () => {
  const stack = new AsyncStack<string>();

  assertEquals(
    await Promise.all([stack.pop(), stack.push("a")]),
    ["a", undefined],
  );
});

Deno.test("push -> pop", async () => {
  const stack = new AsyncStack<string>();

  assertEquals(
    await Promise.all([stack.push("a"), stack.pop()]),
    [undefined, "a"],
  );
});

Deno.test("pop -> pop -> push -> push", async () => {
  const stack = new AsyncStack<string>();

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
  const stack = new AsyncStack<string>();

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
  const stack = new AsyncStack<string>();

  assertEquals(
    await Promise.all([stack.push("a"), stack.pop()]),
    [undefined, "a"]
  )
  assertEquals(
    await Promise.all([stack.pop(), stack.push("b")]),
    ["b", undefined]
  )
});
