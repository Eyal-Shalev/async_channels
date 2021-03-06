import { sleep } from "./internal/utils.ts";
import { Channel, SendOnClosedError } from "./channel.ts";
import {
  assertEquals,
  assertIsError,
  assertRejects,
  assertThrows,
  fail,
} from "deno/testing/asserts.ts";

Deno.test("invalid bufferSize", () => {
  assertThrows(() => new Channel(0.5), RangeError);
});

Deno.test("no-buffer get-> send", async () => {
  const chan = new Channel<string>(0);
  assertEquals(
    await Promise.all([chan.get(), chan.send("a")]),
    [["a", true], undefined],
  );
});

Deno.test("no-buffer send -> get", async () => {
  const chan = new Channel<string>(0);

  assertEquals(
    await Promise.all([chan.send("a"), chan.get()]),
    [undefined, ["a", true]],
  );
});

Deno.test("no-buffer get -> close", async () => {
  const c = new Channel(0);
  const p = c.get();
  c.close();
  assertEquals(await p, [undefined, false]);
});

Deno.test("no-buffer send -> close", async () => {
  const c = new Channel(0);
  const p = c.send("Hello world");
  c.close();
  await assertRejects(() => p, SendOnClosedError);
});

Deno.test("no-buffer get-> get -> send -> send", async () => {
  const chan = new Channel<string>(0);

  const [getA, getB, ..._] = await Promise.all([
    chan.get(),
    chan.get(),
    chan.send("a"),
    chan.send("b"),
  ]);

  assertEquals(getA, ["a", true]);
  assertEquals(getB, ["b", true]);
});

Deno.test("no-buffer send -> send -> get -> get", async () => {
  const chan = new Channel<string>(0);

  const [_a, _b, getA, getB] = await Promise.all([
    chan.send("a"),
    chan.send("b"),
    chan.get(),
    chan.get(),
  ]);

  assertEquals(getA, ["a", true]);
  assertEquals(getB, ["b", true]);
});

Deno.test("no-buffer send -> get; get-> send", async () => {
  const chan = new Channel<string>(0);

  const [_a, getA] = await Promise.all([chan.send("a"), chan.get()]);
  const [getB, _b] = await Promise.all([chan.get(), chan.send("b")]);

  assertEquals(getA, ["a", true]);
  assertEquals(getB, ["b", true]);
});

Deno.test("buffered send -> get", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");
  assertEquals(await chan.get(), ["a", true]);
});

Deno.test("buffered send -> send -> get -> get", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");

  const [_b, getA] = await Promise.all([chan.send("b"), chan.get()]);
  assertEquals(getA, ["a", true]);
  assertEquals(await chan.get(), ["b", true]);
});

Deno.test("buffered send -> get; get-> send", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");
  assertEquals(await chan.get(), ["a", true]);
  await chan.send("b");
  assertEquals(await chan.get(), ["b", true]);
});

Deno.test("buffered send -> send -> send -> get -> get -> get", async () => {
  const chan = new Channel<string>(2);

  await chan.send("a");
  await chan.send("b");

  const [_c, getA] = await Promise.all([chan.send("c"), chan.get()]);
  assertEquals(getA, ["a", true]);

  assertEquals(await chan.get(), ["b", true]);
  assertEquals(await chan.get(), ["c", true]);
});

Deno.test("send -> close -> get -> get", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");
  chan.close();

  assertEquals(await chan.get(), ["a", true]);
  assertEquals(await chan.get(), [undefined, false]);
});

Deno.test("send -> close -> get -> send", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");
  chan.close();

  assertEquals(await chan.get(), ["a", true]);
  assertRejects(() => chan.send("b"), SendOnClosedError);
});

Deno.test("send -> close -> send", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");
  chan.close();

  assertRejects(() => chan.send("b"), SendOnClosedError);
});

Deno.test("Channel as an async iterator", async (t) => {
  const generateContent = async (chan: Channel<string>) => {
    for (const x of ["a", "b"]) {
      await sleep(20);
      await chan.send(x);
    }
  };
  const generateBoo = (out: string[]) => sleep(30).then(() => out.push("boo"));
  await t.step("read all", async () => {
    const chan = new Channel<string>(1);

    const out: string[] = [];

    const p1 = generateContent(chan)
      .catch((err) => fail(err))
      .finally(() => chan.close());
    const p2 = generateBoo(out);

    for (let next = await chan.next(); !next.done; next = await chan.next()) {
      out.push(next.value);
    }

    await p1;
    await p2;

    assertEquals(out, ["a", "boo", "b"]);
  });
  await t.step("return after 1", async () => {
    const chan = new Channel<string>(1);
    const p = chan.send("a")
      .then(() => sleep(20))
      .then(() => chan.send("b").catch(() => {}));

    assertEquals(await chan.next(), { done: false, value: "a" });
    assertEquals(await chan.return(), { done: true, value: void 0 });
    assertEquals(await chan.next(), { done: true, value: void 0 });
    await p;
  });
  await t.step("throw after 1", async () => {
    const chan = new Channel<string>(1, {
      logger: new Proxy<Console>(console, {
        get(target, property, receiver) {
          if (property === "error") {
            return (...data: unknown[]) => {
              assertEquals(data.length, 2);
              const [error, _extra] = data;
              assertIsError(error, Error, "Expected");
            };
          }
          return Reflect.get(target, property, receiver);
        },
      }),
    });

    const p = chan.send("a")
      .then(() => sleep(20))
      .then(() => chan.send("b").catch(() => {}));

    assertEquals(await chan.next(), { done: false, value: "a" });
    assertEquals(await chan.throw(new Error("Expected")), {
      done: true,
      value: void 0,
    });
    assertEquals(await chan.next(), { done: true, value: void 0 });

    await p;
  });
});

Deno.test("Channel as an async iterable", async () => {
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

  assertEquals(await pipeCh.get(), [36, true]);
  assertEquals(await pipeCh.get(), [undefined, false]);

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
    const [actual] = await ch.get();
    assertEquals(actual, expected);
  }

  assertEquals(await ch.get(), [undefined, false]);
});
