import {
  assertEquals,
  assertStrictEquals,
  assertThrowsAsync,
  fail,
} from "deno/testing/asserts.ts";
import { Channel, select } from "./channel.ts";
import {
  Closed,
  InvalidTransitionError,
  Transition,
} from "./internal/state-machine.ts";

Deno.test("no-buffer recieve -> send", async () => {
  const stack = new Channel<string>(0);

  assertEquals(
    await Promise.all([stack.recieve(), stack.send("a")]),
    [["a", true], undefined],
  );
});

Deno.test("no-buffer send -> recieve", async () => {
  const stack = new Channel<string>(0);

  assertEquals(
    await Promise.all([stack.send("a"), stack.recieve()]),
    [undefined, ["a", true]],
  );
});

Deno.test("no-buffer recieve -> recieve -> send -> send", async () => {
  const stack = new Channel<string>(0);

  assertEquals(
    await Promise.all([
      stack.recieve(),
      stack.recieve(),
      stack.send("a"),
      stack.send("b"),
    ]),
    [["a", true], ["b", true], undefined, undefined],
  );
});

Deno.test("no-buffer send -> send -> recieve -> recieve", async () => {
  const stack = new Channel<string>(0);

  assertEquals(
    await Promise.all([
      stack.send("a"),
      stack.send("b"),
      stack.recieve(),
      stack.recieve(),
    ]),
    [undefined, undefined, ["a", true], ["b", true]],
  );
});

Deno.test("no-buffer send -> recieve; recieve -> send", async () => {
  const stack = new Channel<string>(0);

  assertEquals(
    await Promise.all([stack.send("a"), stack.recieve()]),
    [undefined, ["a", true]],
  );
  assertEquals(
    await Promise.all([stack.recieve(), stack.send("b")]),
    [["b", true], undefined],
  );
});

Deno.test("buffered send -> recieve", async () => {
  const stack = new Channel<string>(1);

  await stack.send("a");
  assertEquals(await stack.recieve(), ["a", true]);
});

Deno.test("buffered send -> send -> recieve -> recieve", async () => {
  const stack = new Channel<string>(1);

  await stack.send("a");

  assertEquals(
    await Promise.all([stack.send("b"), stack.recieve()]),
    [undefined, ["a", true]],
  );

  assertEquals(await stack.recieve(), ["b", true]);
});

Deno.test("buffered send -> recieve; recieve -> send", async () => {
  const stack = new Channel<string>(1);

  await stack.send("a");
  assertEquals(await stack.recieve(), ["a", true]);
  await stack.send("a");
  assertEquals(await stack.recieve(), ["a", true]);
});

Deno.test("buffered send -> send -> send -> recieve -> recieve -> recieve", async () => {
  const stack = new Channel<string>(2);

  await stack.send("a");
  await stack.send("b");

  assertEquals(
    await Promise.all([stack.send("c"), stack.recieve()]),
    [undefined, ["a", true]],
  );

  assertEquals(await stack.recieve(), ["b", true]);
  assertEquals(await stack.recieve(), ["c", true]);
});

Deno.test("send -> close -> recieve -> recieve", async () => {
  const stack = new Channel<string>(1);

  await stack.send("a");
  stack.close();

  assertEquals(await stack.recieve(), ["a", true]);
  assertEquals(await stack.recieve(), [undefined, false]);
});

Deno.test("send -> close -> recieve -> send", async () => {
  const stack = new Channel<string>(1);

  await stack.send("a");
  stack.close();

  assertEquals(await stack.recieve(), ["a", true]);
  assertThrowsAsync(
    () => stack.send("b"),
    InvalidTransitionError,
    new InvalidTransitionError(Closed, Transition.SEND).message,
  );
});
Deno.test("send -> close -> send", async () => {
  const stack = new Channel<string>(1);

  await stack.send("a");
  stack.close();

  assertThrowsAsync(
    () => stack.send("b"),
    InvalidTransitionError,
    new InvalidTransitionError(Closed, Transition.SEND).message,
  );
});

Deno.test("select when 1 channel is buffered", async () => {
  const c1 = new Channel<string>(0);
  const c2 = new Channel<string>(1);

  const ctrl = new AbortController();

  c1.send("c1", ctrl).then(() => fail("Should have failed"), () => {});
  c2.send("c2", ctrl).catch((err) => fail(err));

  const [val, selectedChannel] = await select([c1, c2]);
  ctrl.abort();
  assertStrictEquals(selectedChannel, c2);
  assertEquals(val, "c2");
});

Deno.test("select send when 1 has buffer", async () => {
  const c1 = new Channel<string>(0);
  const c2 = new Channel<string>(1);

  const [val, selectedChannel] = await select([[c1, "c1"], [c2, "c2"]]);
  assertEquals(val, true);
  assertStrictEquals(selectedChannel, c2);
});
