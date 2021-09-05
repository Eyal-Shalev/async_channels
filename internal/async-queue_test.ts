#!/usr/bin/env -S deno test --lock lock.test.json --import-map import_map.json

import { assertEquals, assertThrowsAsync } from "deno/testing/asserts.ts";
import { AsyncQueue } from "./async-queue.ts";
import { Closed, InvalidTransitionError, Transition } from "./state-machine.ts";

Deno.test("no-buffer remove -> add", async () => {
  const stack = new AsyncQueue<string>(0);

  assertEquals(
    await Promise.all([stack.remove(), stack.add("a")]),
    [["a", true], undefined],
  );
});

Deno.test("no-buffer add -> remove", async () => {
  const stack = new AsyncQueue<string>(0);

  assertEquals(
    await Promise.all([stack.add("a"), stack.remove()]),
    [undefined, ["a", true]],
  );
});

Deno.test("no-buffer remove -> remove -> add -> add", async () => {
  const stack = new AsyncQueue<string>(0);

  assertEquals(
    await Promise.all([
      stack.remove(),
      stack.remove(),
      stack.add("a"),
      stack.add("b"),
    ]),
    [["a", true], ["b", true], undefined, undefined],
  );
});

Deno.test("no-buffer add -> add -> remove -> remove", async () => {
  const stack = new AsyncQueue<string>(0);

  assertEquals(
    await Promise.all([
      stack.add("a"),
      stack.add("b"),
      stack.remove(),
      stack.remove(),
    ]),
    [undefined, undefined, ["a", true], ["b", true]],
  );
});

Deno.test("no-buffer add -> remove; remove -> add", async () => {
  const stack = new AsyncQueue<string>(0);

  assertEquals(
    await Promise.all([stack.add("a"), stack.remove()]),
    [undefined, ["a", true]],
  );
  assertEquals(
    await Promise.all([stack.remove(), stack.add("b")]),
    [["b", true], undefined],
  );
});

Deno.test("buffered add -> remove", async () => {
  const stack = new AsyncQueue<string>(1);

  await stack.add("a");
  assertEquals(await stack.remove(), ["a", true]);
});

Deno.test("buffered add -> add -> remove -> remove", async () => {
  const stack = new AsyncQueue<string>(1);

  await stack.add("a");

  assertEquals(
    await Promise.all([stack.add("b"), stack.remove()]),
    [undefined, ["a", true]],
  );

  assertEquals(await stack.remove(), ["b", true]);
});

Deno.test("buffered add -> remove; remove -> add", async () => {
  const stack = new AsyncQueue<string>(1);

  await stack.add("a");
  assertEquals(await stack.remove(), ["a", true]);
  await stack.add("a");
  assertEquals(await stack.remove(), ["a", true]);
});

Deno.test("buffered add -> add -> add -> remove -> remove -> remove", async () => {
  const stack = new AsyncQueue<string>(2);

  await stack.add("a");
  await stack.add("b");

  assertEquals(
    await Promise.all([stack.add("c"), stack.remove()]),
    [undefined, ["a", true]],
  );

  assertEquals(await stack.remove(), ["b", true]);
  assertEquals(await stack.remove(), ["c", true]);
});

Deno.test("add -> close -> remove -> remove", async () => {
  const stack = new AsyncQueue<string>(1);

  await stack.add("a");
  stack.close();

  assertEquals(await stack.remove(), ["a", true]);
  assertEquals(await stack.remove(), [undefined, false]);
});

Deno.test("add -> close -> remove -> add", async () => {
  const stack = new AsyncQueue<string>(1);

  await stack.add("a");
  stack.close();

  assertEquals(await stack.remove(), ["a", true]);
  assertThrowsAsync(
    () => stack.add("b"),
    InvalidTransitionError,
    new InvalidTransitionError(Closed, Transition.ADD).message,
  );
});
Deno.test("add -> close -> add", async () => {
  const stack = new AsyncQueue<string>(1);

  await stack.add("a");
  stack.close();

  assertThrowsAsync(
    () => stack.add("b"),
    InvalidTransitionError,
    new InvalidTransitionError(Closed, Transition.ADD).message,
  );
});
