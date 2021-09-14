import { sleep } from "./internal/utils.ts";
import { Channel, merge, select } from "./channel.ts";
import { InvalidTransitionError } from "./internal/state-machine.ts";
import { assertEquals, assertThrowsAsync, fail } from "deno/testing/asserts.ts";

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

  const [getA, getB, ..._] = await Promise.all([
    chan.receive(),
    chan.receive(),
    chan.send("a"),
    chan.send("b"),
  ]);

  assertEquals(getA, ["a", true]);
  assertEquals(getB, ["b", true]);
});

Deno.test("no-buffer send -> send -> receive -> receive", async () => {
  const chan = new Channel<string>(0);

  const [_a, _b, getA, getB] = await Promise.all([
    chan.send("a"),
    chan.send("b"),
    chan.receive(),
    chan.receive(),
  ]);

  assertEquals(getA, ["a", true]);
  assertEquals(getB, ["b", true]);
});

Deno.test("no-buffer send -> receive; receive -> send", async () => {
  const chan = new Channel<string>(0);

  const [_a, getA] = await Promise.all([chan.send("a"), chan.receive()]);
  const [getB, _b] = await Promise.all([chan.receive(), chan.send("b")]);

  assertEquals(getA, ["a", true]);
  assertEquals(getB, ["b", true]);
});

Deno.test("buffered send -> receive", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");
  assertEquals(await chan.receive(), ["a", true]);
});

Deno.test("buffered send -> send -> receive -> receive", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");

  const [_b, getA] = await Promise.all([chan.send("b"), chan.receive()]);
  assertEquals(getA, ["a", true]);
  assertEquals(await chan.receive(), ["b", true]);
});

Deno.test("buffered send -> receive; receive -> send", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");
  assertEquals(await chan.receive(), ["a", true]);
  await chan.send("b");
  assertEquals(await chan.receive(), ["b", true]);
});

Deno.test("buffered send -> send -> send -> receive -> receive -> receive", async () => {
  const chan = new Channel<string>(2);

  await chan.send("a");
  await chan.send("b");

  const [_c, getA] = await Promise.all([chan.send("c"), chan.receive()]);
  assertEquals(getA, ["a", true]);

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
  assertThrowsAsync(() => chan.send("b"), InvalidTransitionError);
});
Deno.test("send -> close -> send", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");
  chan.close();

  assertThrowsAsync(() => chan.send("b"), InvalidTransitionError);
});

Deno.test("select when 1 channel is buffered", async () => {
  const c1 = new Channel<string>(0);
  const c2 = new Channel<string>(1);

  const ctrl = new AbortController();

  c1.send("c1", ctrl).then(() => fail("Should have failed"), () => {});
  c2.send("c2", ctrl).catch((err) => fail(err));

  const [val, selectedChannel] = await select([c1, c2]);
  ctrl.abort();
  assertEquals(selectedChannel, c2);
  assertEquals(val, "c2");
});

Deno.test("select send when 1 has buffer", async () => {
  const c1 = new Channel<string>(0);
  const c2 = new Channel<string>(1);

  const [val, selectedChannel] = await select([[c1, "c1"], [c2, "c2"]]);
  assertEquals(val, true);
  assertEquals(selectedChannel, c2);
});

Deno.test("select return default", async () => {
  const c1 = new Channel<string>(0);
  const c2 = new Channel<string>(0);

  for (const expected of [undefined, null, true, false, 0, ""]) {
    const [val, selectedChannel] = await select(
      [[c1, "c1"], c2],
      { default: expected },
    );
    assertEquals(val, expected);
    assertEquals(selectedChannel, undefined);
  }

  c1.close();
  c2.close();
  await sleep(100);
});

Deno.test("channel as an async iterator", async () => {
  const chan = new Channel<string>(1);

  const out: string[] = [];

  (async () => {
    for (const x of ["a", "b"]) {
      await sleep(20);
      await chan.send(x);
    }
    chan.close();
  })();

  const p = sleep(30).then(() => out.push("boo"));

  for await (const v of chan) out.push(v);

  await p;

  assertEquals(out, ["a", "boo", "b"]);
});

Deno.test("map", async () => {
  const ch = new Channel<number>(1);
  const doubleCh = ch.map((x) => x * 2);

  const p = Promise.all([
    ch.send(1),
    ch.send(2),
    ch.send(3),
  ]).then(() => ch.close());

  const expected = [2, 4, 6];
  for await (const x of doubleCh) {
    assertEquals(x, expected.shift());
  }

  await p;
  assertEquals(expected.length, 0, "expected stack isn't empty");
});

Deno.test("merge", async () => {
  const ch1 = new Channel<string>();
  const ch2 = new Channel<number>();
  const mergedChan = merge(ch1, ch2);

  const p = Promise.all([
    ch1.send("Hello"),
    ch2.send(2),
    ch1.send("world"),
  ]).then(() => {
    ch1.close();
    ch2.close();
  });

  const expected = ["Hello", 2, "world"];
  for await (const msg of mergedChan) {
    assertEquals(msg, expected.shift());
  }

  await p;
  assertEquals(expected.length, 0, "expected stack isn't empty");
});

Deno.test("pipeline", async () => {
  const ch = new Channel<number>(0);

  const pipeCh = ch
    .filter((x) => x % 2 !== 0)
    .flatMap((x) => [x, x])
    .map((x) => x * 2)
    .reduce((prev, cur) => prev + cur);

  const p = Promise.all(
    [1, 2, 3, 4, 5, 6].map((x) => ch.send(x)),
  ).then(() => ch.close());

  assertEquals(await pipeCh.receive(), [36, true]);
  assertEquals(await pipeCh.receive(), [undefined, false]);

  await p;
});
