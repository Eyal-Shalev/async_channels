import { sleep } from "./internal/utils.ts";
import { Channel } from "./channel.ts";
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

Deno.test("channel as an async iterator", async () => {
  const chan = new Channel<string>(1);

  const out: string[] = [];

  (async () => {
    for (const x of ["a", "b"]) {
      await sleep(20);
      await chan.send(x);
    }
  })().catch((err) => fail(err))
    .finally(() => chan.close());

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

Deno.test("flat", async () => {
  await 0;
  const ch = new Channel<string[]>();
  const flatCh = ch.flat();
  const p = Promise.all([
    ch.send(["Hello", "world"]),
    ch.send(["from", "Array"]),
  ]).then(() => ch.close());

  const expected = ["Hello", "world", "from", "Array"];
  for await (const x of flatCh) {
    assertEquals(x, expected.shift());
  }

  await p;
  assertEquals(expected.length, 0, "expected stack isn't empty");
});

Deno.test("groupBy", async () => {
  const ch = new Channel<number>(0);
  const { even: evenCh, odd: oddCh } = ch.groupBy((x) =>
    x % 2 === 0 ? "even" : "odd"
  );
  const expected = Object.freeze({
    evens: [2, 4, 6],
    odds: [1, 3, 5],
  });

  const sendP = Promise.all(
    [1, 2, 3, 4, 5, 6].map((x) => ch.send(x)),
  ).finally(() => ch.close());

  const receiveP = Promise.all([
    evenCh.forEach((n) => assertEquals(n, expected.evens.shift())),
    oddCh.forEach((n) => assertEquals(n, expected.odds.shift())),
  ]);

  await Promise.all([sendP, receiveP]);
});

Deno.test("duplicate", async () => {
  const ch = new Channel<number>(0);
  const [ch0, ch1] = ch.duplicate(2, { sendMode: "WaitForOne" });
  const evenCh = ch0.filter((n) => n % 2 === 0);
  const oddCh = ch1.filter((n) => n % 2 === 1);
  const expected = Object.freeze({
    evens: [2, 4, 6],
    odds: [1, 3, 5],
  });

  const sendP = Promise.all(
    [1, 2, 3, 4, 5, 6].map((x) => ch.send(x)),
  ).finally(() => ch.close());

  const receiveP = Promise.all([
    evenCh.forEach((n) => assertEquals(n, expected.evens.shift())),
    oddCh.forEach((n) => assertEquals(n, expected.odds.shift())),
  ]);

  await Promise.all([sendP, receiveP]);
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

Deno.test("Channel.from", async () => {
  const ch = Channel.from(async function* () {
    for (let i = 0; i < 3; i++) {
      await sleep(10);
      yield i;
    }
  }());

  for (const expected of [0, 1, 2]) {
    const [actual] = await ch.receive();
    assertEquals(actual, expected);
  }

  assertEquals(await ch.receive(), [undefined, false]);
});
