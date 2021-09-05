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

Deno.test("no-buffer receive -> send", async () => {
  const chan = new Channel<string>(0);

  assertEquals(
    await Promise.all([chan.receive(), chan.send("a")]),
    [["a", true], undefined],
  );
});

Deno.test("no-buffer send -> receive", async () => {
  const chan = new Channel<string>(0);

  assertEquals(
    await Promise.all([chan.send("a"), chan.receive()]),
    [undefined, ["a", true]],
  );
});

Deno.test("no-buffer receive -> receive -> send -> send", async () => {
  const chan = new Channel<string>(0);

  assertEquals(
    await Promise.all([
      chan.receive(),
      chan.receive(),
      chan.send("a"),
      chan.send("b"),
    ]),
    [["a", true], ["b", true], undefined, undefined],
  );
});

Deno.test("no-buffer send -> send -> receive -> receive", async () => {
  const chan = new Channel<string>(0);

  assertEquals(
    await Promise.all([
      chan.send("a"),
      chan.send("b"),
      chan.receive(),
      chan.receive(),
    ]),
    [undefined, undefined, ["a", true], ["b", true]],
  );
});

Deno.test("no-buffer send -> receive; receive -> send", async () => {
  const chan = new Channel<string>(0);

  assertEquals(
    await Promise.all([chan.send("a"), chan.receive()]),
    [undefined, ["a", true]],
  );
  assertEquals(
    await Promise.all([chan.receive(), chan.send("b")]),
    [["b", true], undefined],
  );
});

Deno.test("buffered send -> receive", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");
  assertEquals(await chan.receive(), ["a", true]);
});

Deno.test("buffered send -> send -> receive -> receive", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");

  assertEquals(
    await Promise.all([chan.send("b"), chan.receive()]),
    [undefined, ["a", true]],
  );

  assertEquals(await chan.receive(), ["b", true]);
});

Deno.test("buffered send -> receive; receive -> send", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");
  assertEquals(await chan.receive(), ["a", true]);
  await chan.send("a");
  assertEquals(await chan.receive(), ["a", true]);
});

Deno.test("buffered send -> send -> send -> receive -> receive -> receive", async () => {
  const chan = new Channel<string>(2);

  await chan.send("a");
  await chan.send("b");

  assertEquals(
    await Promise.all([chan.send("c"), chan.receive()]),
    [undefined, ["a", true]],
  );

  assertEquals(await chan.receive(), ["b", true]);
  assertEquals(await chan.receive(), ["c", true]);
});

Deno.test("send -> close -> receive -> receive", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");
  chan.close();

  assertEquals(await chan.receive(), ["a", true]);
  assertEquals(await chan.receive(), [undefined, false]);
});

Deno.test("send -> close -> receive -> send", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");
  chan.close();

  assertEquals(await chan.receive(), ["a", true]);
  assertThrowsAsync(
    () => chan.send("b"),
    InvalidTransitionError,
    new InvalidTransitionError(Closed, Transition.SEND).message,
  );
});
Deno.test("send -> close -> send", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");
  chan.close();

  assertThrowsAsync(
    () => chan.send("b"),
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

Deno.test("Channel AsyncIterator", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");

  (async () => {
    await chan.send("b");
    await chan.send("c");
    chan.close();
  })();

  const expected = ["a", "b", "c"];
  for await (const v of chan) {
    assertEquals(v, expected.shift());
  }
});
